import { getEventPublisher } from "@/events/index";
import { createBalanceId, createLendingPositionId } from "@/utils";
import { executeIfInSync } from "@/utils/syncState";
import { updateIndexerStatus } from "@/utils/indexerStatus";
import { createLogger, LogLabel, log, LogLevel, ServiceName } from "../utils/logger";
import { sql } from "ponder";
import {
  assetConfigurations,
  balances,
  interestRateParameters,
  lendingEvents,
  lendingPositions,
  liquidations,
  oraclePrices,
  poolLendingStats,
  userLendingStats
} from "ponder:schema";
import { getAddress } from "viem";

// Create logger instance for this file
const logger = createLogger('lendingManagerHandler.ts');

// Helper functions for lending statistics
async function upsertUserLendingStats(
  db: any,
  chainId: number,
  userAddress: string,
  action: string,
  amount: bigint,
  timestamp: number
) {
  const userId = `${chainId}-${userAddress}`;
  const statsId = `${chainId}-${userAddress}-lending`;

  const updateData: any = {
    lastLendingActivity: timestamp,
  };

  // Update based on action type
  switch (action) {
    case "SUPPLY":
      updateData.totalSupplied = sql`${userLendingStats.totalSupplied} + ${amount}`;
      break;
    case "BORROW":
      updateData.totalBorrowed = sql`${userLendingStats.totalBorrowed} + ${amount}`;
      break;
    case "REPAY":
      updateData.totalRepaid = sql`${userLendingStats.totalRepaid} + ${amount}`;
      break;
    case "WITHDRAW":
      updateData.totalWithdrawn = sql`${userLendingStats.totalWithdrawn} + ${amount}`;
      break;
    case "LIQUIDATE":
      updateData.totalLiquidations = sql`${userLendingStats.totalLiquidations} + 1`;
      updateData.totalLiquidatedAmount = sql`${userLendingStats.totalLiquidatedAmount} + ${amount}`;
      break;
  }

  await db
    .insert(userLendingStats)
    .values({
      id: statsId,
      chainId,
      user_address: userAddress,
      firstLendingActivity: timestamp,
      lastLendingActivity: timestamp,
      activePositions: 0,
    })
    .onConflictDoUpdate((row: any) => ({
      ...updateData,
      firstLendingActivity: row.firstLendingActivity || timestamp,
    }));
}

async function publishLendingEvent(
  action: string,
  user: string,
  token: string,
  amount: string,
  timestamp: number,
  additionalData: any = {}
) {
  try {
    const eventPublisher = getEventPublisher();
    await eventPublisher.publishLendingEvent({
      action: action.toLowerCase(),
      user,
      token,
      amount,
      timestamp: timestamp.toString(),
      ...additionalData
    });
  } catch (error) {
    logger.error('Failed to publish lending event', LogLabel.EVENT_HANDLER, 'publishLendingEvent', { error: error instanceof Error ? error.message : String(error), action, user, token, amount });
  }
}

// Supply event handler
export async function handleSupply({ event, context }: any) {
  await updateIndexerStatus(context, 'LendingManager:Supply', event);
  const { db } = context;
  const chainId = context.network.chainId;


  const userAddress = getAddress(event.args.user);
  const token = getAddress(event.args.token);
  const amount = BigInt(event.args.amount);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  // DEBUG: Log event args to diagnose user address issue
  const debugInfo = {
    txHash,
    blockNumber: event.block.number,
    rawUser: event.args.user,
    rawUserType: typeof event.args.user,
    extractedUser: userAddress,
    extractedUserType: typeof userAddress,
    token,
    amount: amount.toString(),
    isValidAddress: userAddress && typeof userAddress === 'string' && userAddress.startsWith('0x') && userAddress.length === 42,
  };
  logger.info('[LENDING-DEBUG] Supply event extracted values', LogLabel.EVENT_HANDLER, 'handleSupply', debugInfo);
  console.log('[LENDING-DEBUG] Supply event:', {
    txHash,
    blockNumber: event.block.number,
    eventArgs: JSON.stringify({
      userAddress: event.args.user,
      userLength: typeof event.args.user === 'string' ? event.args.user.length : 'N/A',
      token: event.args.token,
      amount: event.args.amount?.toString(),
    }),
    extracted: { userAddress, token, amount: amount.toString() },
    ...debugInfo,
  });

  // Create/update lending position
  const positionId = createLendingPositionId(chainId, userAddress, token, token);

  // Try to find existing position first
  const existingPosition = await context.db.find(lendingPositions, {
    id: positionId
  });

  if (existingPosition) {
    // Update existing position
    await db
      .update(lendingPositions, { id: existingPosition.id })
      .set((row: any) => ({
        collateralAmount: row.collateralAmount + amount,
        lastUpdated: timestamp,
        isActive: true,
      }));
  } else {
    // Create new position
    await db
      .insert(lendingPositions)
      .values({
        id: positionId,
        chainId,
        user_address: userAddress,
        collateralToken: token,
        debtToken: token,
        collateralAmount: amount,
        debtAmount: BigInt(0),
        lastUpdated: timestamp,
        isActive: true,
      });
  }

  // Record lending event
  const eventId = `${txHash}-supply-${timestamp}`;

  const insertValues = {
    id: eventId,
    chainId,
    user_address: userAddress,
    action: "SUPPLY",
    token,
    amount,
    timestamp,
    transactionId: txHash,
    blockNumber: BigInt(event.block.number),
  };
  console.log('[LENDING-DB-INSERT] About to insert lending event:', JSON.stringify(insertValues, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));

  await db.insert(lendingEvents).values(insertValues).onConflictDoUpdate((row: any) => ({
    chainId,
    user_address: userAddress,
    action: "SUPPLY",
    token,
    amount,
    timestamp,
    transactionId: txHash,
    blockNumber: BigInt(event.block.number),
  }));

  // Update user stats
  await upsertUserLendingStats(db, chainId, userAddress, "SUPPLY", amount, timestamp);

  // Update pool lending stats
  await updatePoolLendingStats(db, chainId, token, amount, BigInt(0), timestamp);

  // Update user balance to reflect real lending supply
  const balanceId = createBalanceId(chainId, token, userAddress);
  await db
    .insert(balances)
    .values({
      id: balanceId,
      user_address: userAddress,
      chainId,
      currency: token,
      amount: BigInt(0),
      lockedAmount: amount,
      syntheticBalance: BigInt(0),
      collateralAmount: amount,
      lastUpdated: timestamp,
    })
    .onConflictDoUpdate({
      id: balanceId,
      set: {
        lockedAmount: amount,
        collateralAmount: amount,
        lastUpdated: timestamp,
      },
    });

  // Publish events if in sync
  await executeIfInSync(Number(event.block.number), async () => {
    await publishLendingEvent("SUPPLY", userAddress, token, amount.toString(), timestamp);

    // Update balance event
    const balance = await db.find(balances, { id: balanceId });
    if (balance) {
      const eventPublisher = getEventPublisher();
      await eventPublisher.publishBalanceUpdate({
        userId: balance.user_address,
        token: balance.currency,
        available: (balance.amount ?? BigInt(0)).toString(),
        locked: (balance.lockedAmount ?? BigInt(0)).toString(),
        timestamp: timestamp.toString()
      });
    }
  }, 'handleSupply');
}

// Borrow event handler
export async function handleBorrow({ event, context }: any) {
  await updateIndexerStatus(context, 'LendingManager:Borrow', event);
  const { db } = context;
  const chainId = context.network.chainId;

  const userAddress = getAddress(event.args.user);
  const token = getAddress(event.args.token);
  const amount = BigInt(event.args.amount);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  // DEBUG: Log event args to diagnose user address issue
  const debugInfo = {
    txHash,
    blockNumber: event.block.number,
    rawUser: event.args.user,
    rawUserType: typeof event.args.user,
    extractedUser: userAddress,
    extractedUserType: typeof userAddress,
    token,
    amount: amount.toString(),
    isValidAddress: userAddress && typeof userAddress === 'string' && userAddress.startsWith('0x') && userAddress.length === 42,
  };
  logger.info('[LENDING-DEBUG] Borrow event extracted values', LogLabel.EVENT_HANDLER, 'handleBorrow', debugInfo);
  console.log('[LENDING-DEBUG] Borrow event:', {
    txHash,
    blockNumber: event.block.number,
    eventArgs: JSON.stringify({
      userAddress: event.args.user,
      userLength: typeof event.args.user === 'string' ? event.args.user.length : 'N/A',
      token: event.args.token,
      amount: event.args.amount?.toString(),
    }),
    extracted: { userAddress, token, amount: amount.toString() },
    ...debugInfo,
  });

  try {
    // Update lending position
    const positionId = createLendingPositionId(chainId, userAddress, token, token);
    await db
      .insert(lendingPositions)
      .values({
        id: positionId,
        chainId,
        user_address: userAddress,
        collateralToken: token,
        debtToken: token,
        collateralAmount: BigInt(0),
        debtAmount: amount,
        lastUpdated: timestamp,
        isActive: true,
      })
      .onConflictDoUpdate((row: any) => ({
        debtAmount: row.debtAmount + amount,
        lastUpdated: timestamp,
        isActive: true,
      }));

    // Record lending event
    const eventId = `${txHash}-borrow-${timestamp}`;
    await db.insert(lendingEvents).values({
      id: eventId,
      chainId,
      user_address: userAddress,
      action: "BORROW",
      token: token,
      amount,
      // No interestRate - calculated on-demand from poolLendingStats
      timestamp,
      transactionId: txHash,
      blockNumber: BigInt(event.block.number),
    }).onConflictDoUpdate((row: any) => ({
      action: row.action,
      token: row.token,
      amount: row.amount + amount,
      // No interestRate - calculated on-demand from poolLendingStats
      // No healthFactor - calculated on-demand
      timestamp,
      transactionId: txHash,
      blockNumber: BigInt(event.block.number),
    }));

    // Update user stats
    await upsertUserLendingStats(db, chainId, userAddress, "BORROW", amount, timestamp);

    // Update pool lending stats
    await updatePoolLendingStats(db, chainId, token, BigInt(0), amount, timestamp);

    // Update user balance to reflect debt (negative balance indicates debt)
    const balanceId = createBalanceId(chainId, token, userAddress);
    await db
      .insert(balances)
      .values({
        id: balanceId,
        user_address: userAddress,
        chainId,
        currency: token,
        amount: BigInt(0),
        lockedAmount: BigInt(0),
        lastUpdated: timestamp,
      })
      .onConflictDoUpdate({
        amount: sql`${balances.amount} - ${amount}`,
        lastUpdated: timestamp,
      });

    // // Publish events if in sync
    await executeIfInSync(Number(event.block.number), async () => {
      await publishLendingEvent("BORROW", userAddress, token, amount.toString(), timestamp, {
        healthFactor: "10000",
        interestRate: "0"
      });
    }, 'handleBorrow');
  } catch (error) {
    log(LogLevel.ERROR, 'handleBorrow ERROR', LogLabel.EVENT_HANDLER, { error: error instanceof Error ? error.message : String(error), userAddress, token, amount: amount.toString() }, 'lendingManagerHandler.ts', 'handleBorrow');
    return;
  }
}

// Repay event handler
export async function handleRepay({ event, context }: any) {
  await updateIndexerStatus(context, 'LendingManager:Repay', event);
  const { db } = context;
  const chainId = context.network.chainId;
  const userAddress = getAddress(event.args.user);
  const token = getAddress(event.args.token);
  const amount = BigInt(event.args.amount);
  const interest = BigInt(event.args.interest || 0);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  // DEBUG: Log event args to diagnose user address issue
  const debugInfo = {
    txHash,
    blockNumber: event.block.number,
    rawUser: event.args.user,
    rawUserType: typeof event.args.user,
    extractedUser: userAddress,
    extractedUserType: typeof userAddress,
    token,
    amount: amount.toString(),
    interest: interest.toString(),
    isValidAddress: userAddress && typeof userAddress === 'string' && userAddress.startsWith('0x') && userAddress.length === 42,
  };
  logger.info('[LENDING-DEBUG] Repay event extracted values', LogLabel.EVENT_HANDLER, 'handleRepay', debugInfo);
  console.log('[LENDING-DEBUG] Repay event:', {
    txHash,
    blockNumber: event.block.number,
    eventArgs: JSON.stringify({
      userAddress: event.args.user,
      userLength: typeof event.args.user === 'string' ? event.args.user.length : 'N/A',
      token: event.args.token,
      amount: event.args.amount?.toString(),
      interest: event.args.interest?.toString(),
    }),
    extracted: { userAddress, token, amount: amount.toString(), interest: interest.toString() },
    ...debugInfo,
  });

  // Record repay event
  const eventId = `${txHash}-repay-${timestamp}`;
  await db.insert(lendingEvents).values({
    id: eventId,
    chainId,
    user_address: userAddress,
    action: "REPAY",
    token: token,
    amount: amount + interest,
    timestamp: timestamp,
    transactionId: txHash,
    blockNumber: BigInt(event.block.number),
  });

  // Update user stats
  await upsertUserLendingStats(db, chainId, userAddress, "REPAY", amount, timestamp);

  // Update pool lending stats (decrement borrow on repay)
  await updatePoolLendingStats(db, chainId, token, BigInt(0), -amount, timestamp);

  // Update user balance
  const balanceId = createBalanceId(chainId, token, userAddress);
  await db
    .update(balances, { id: balanceId })
    .set({
      amount: sql`${balances.amount} + ${amount}`,
      lastUpdated: timestamp,
    });

  // Publish events if in sync
  await executeIfInSync(Number(event.block.number), async () => {
    await publishLendingEvent("REPAY", userAddress, token, amount.toString(), timestamp, {
      interestPaid: interest.toString(),
      healthFactor: "10000"
    });
  }, 'handleRepay');
}

// Withdraw event handler
export async function handleWithdraw({ event, context }: any) {
  await updateIndexerStatus(context, 'LendingManager:Withdraw', event);
  const { db } = context;
  const chainId = context.network.chainId;
  const userAddress = getAddress(event.args.user);
  const token = getAddress(event.args.token);
  const amount = BigInt(event.args.amount);
  const yieldAmount = BigInt(event.args.yield || 0);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  // DEBUG: Log event args to diagnose user address issue
  const debugInfo = {
    txHash,
    blockNumber: event.block.number,
    rawUser: event.args.user,
    rawUserType: typeof event.args.user,
    extractedUser: userAddress,
    extractedUserType: typeof userAddress,
    token,
    amount: amount.toString(),
    yieldAmount: yieldAmount.toString(),
    isValidAddress: userAddress && typeof userAddress === 'string' && userAddress.startsWith('0x') && userAddress.length === 42,
  };
  logger.info('[LENDING-DEBUG] Withdraw event extracted values', LogLabel.EVENT_HANDLER, 'handleWithdraw', debugInfo);
  console.log('[LENDING-DEBUG] Withdraw event:', {
    eventArgs: JSON.stringify({
      userAddress: event.args.user,
      userLength: typeof event.args.user === 'string' ? event.args.user.length : 'N/A',
      token: event.args.token,
      amount: event.args.amount?.toString(),
      yield: event.args.yield?.toString(),
    }),
    extracted: { userAddress, token, amount: amount.toString(), yieldAmount: yieldAmount.toString() },
    ...debugInfo,
  });

  // Update pool lending stats (decrement supply on withdraw)
  await updatePoolLendingStats(db, chainId, token, -amount, BigInt(0), timestamp);

  // Record lending event
  const eventId = `${txHash}-withdraw-${timestamp}`;
  await db.insert(lendingEvents).values({
    id: eventId,
    chainId,
    user_address: userAddress,
    action: "WITHDRAW",
    token: token,
    amount,
    timestamp,
    transactionId: txHash,
    blockNumber: BigInt(event.block.number),
  });

  // Update user stats
  await upsertUserLendingStats(db, chainId, userAddress, "WITHDRAW", amount, timestamp);

  // Update user balance
  const balanceId = createBalanceId(chainId, token, userAddress);
  await db
    .update(balances, { id: balanceId })
    .set({
      amount: sql`${balances.amount} - ${amount}`,
      lastUpdated: timestamp,
    });

  // Publish events if in sync
  await executeIfInSync(Number(event.block.number), async () => {
    await publishLendingEvent("WITHDRAW", userAddress, token, amount.toString(), timestamp, {
      interestEarned: yieldAmount.toString()
    });
  }, 'handleWithdraw');
}

// Liquidation event handler
export async function handleLiquidation({ event, context }: any) {
  await updateIndexerStatus(context, 'LendingManager:Liquidation', event);
  const { db } = context;
  const chainId = context.network.chainId;
  const borrower = event.args.borrower;
  const liquidator = event.args.liquidator;
  const collateralToken = getAddress(event.args.collateralToken);
  const debtToken = getAddress(event.args.debtToken);
  const debtToCover = BigInt(event.args.debtToCover);
  const liquidatedCollateral = BigInt(event.args.liquidatedCollateral);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  // Record liquidation event
  const liquidationId = `${txHash}-liquidation-${timestamp}`;
  await db.insert(liquidations).values({
    id: liquidationId,
    chainId,
    liquidatedUser: borrower,
    liquidator: liquidator,
    collateralToken: collateralToken,
    debtToken: debtToken,
    collateralAmount: liquidatedCollateral,
    debtAmount: debtToCover,
    liquidationBonus: 1000,
    protocolFee: BigInt(0),
    timestamp,
    transactionId: txHash,
    blockNumber: BigInt(event.block.number),
    price: BigInt(0),
  });

  // Record lending event for liquidated user
  const liquidatedEventId = `${txHash}-liquidated-${timestamp}`;
  await db.insert(lendingEvents).values({
    id: liquidatedEventId,
    chainId,
    user: borrower,
    action: "LIQUIDATE",
    token: collateralToken,
    amount: liquidatedCollateral,
    debtToken: debtToken,
    // No healthFactor - calculated on-demand // Default health factor since event doesn't provide it
    timestamp,
    transactionId: txHash,
    blockNumber: BigInt(event.block.number),
    liquidator: liquidator,
    liquidatedAmount: debtToCover,
  });

  // Update liquidated user stats
  await upsertUserLendingStats(db, chainId, borrower, "LIQUIDATE", liquidatedCollateral, timestamp);

  // Publish events if in sync
  await executeIfInSync(Number(event.block.number), async () => {
    await publishLendingEvent("LIQUIDATE", borrower, collateralToken, liquidatedCollateral.toString(), timestamp, {
      liquidator: liquidator,
      debtToken: debtToken,
      debtRepaid: debtToCover.toString(),
      healthFactor: "0",
      liquidationBonus: "1000"
    });

    // Publish liquidation event
    const eventPublisher = getEventPublisher();
    await eventPublisher.publishLiquidation({
      liquidatedUser: borrower,
      liquidator: liquidator,
      collateralToken: collateralToken,
      debtToken: debtToken,
      collateralAmount: liquidatedCollateral.toString(),
      debtAmount: debtToCover.toString(),
      healthFactor: "0",
      price: "0",
      timestamp: timestamp.toString()
    });
  }, 'handleLiquidation');
}

// Oracle price update handler
export async function handleOraclePriceUpdate({ event, context }: any) {
  await updateIndexerStatus(context, 'LendingManager:OraclePriceUpdate', event);
  const { db } = context;
  const chainId = context.network.chainId;
  const token = getAddress(event.args.token);
  const price = BigInt(event.args.price);
  const decimals = Number(event.args.decimals || 18);
  const source = event.args.source || "CHAINLINK";
  const timestamp = Number(event.block.timestamp);

  // Record oracle price
  const priceId = `${chainId}-${token}-${timestamp}`;
  await db.insert(oraclePrices).values({
    id: priceId,
    chainId,
    token,
    price,
    decimals,
    timestamp,
    blockNumber: BigInt(event.block.number),
    source,
    confidence: BigInt(event.args.confidence || 0),
  });

  // Publish price update if in sync
  await executeIfInSync(Number(event.block.number), async () => {
    const eventPublisher = getEventPublisher();
    await eventPublisher.publishPriceUpdate({
      token,
      price: price.toString(),
      decimals: decimals.toString(),
      source,
      timestamp: timestamp.toString(),
      confidence: event.args.confidence?.toString() || "0"
    });
  }, 'handleOraclePriceUpdate');
}

// AssetConfigured event handler
export async function handleAssetConfigured({ event, context }: any) {
  await updateIndexerStatus(context, 'LendingManager:AssetConfigured', event);
  const { db } = context;
  const chainId = context.network.chainId;
  const token = getAddress(event.args.token);

  // Values are already in basis points (e.g., 7500 = 75%, 8000 = 80%)
  const collateralFactor = Number(event.args.collateralFactor);
  const liquidationThreshold = Number(event.args.liquidationThreshold);
  const liquidationBonus = Number(event.args.liquidationBonus);
  const reserveFactor = Number(event.args.reserveFactor);
  const timestamp = Number(event.block.timestamp);

  // Create unique ID for this asset configuration
  const configId = `${chainId}-${token}`;

  // Insert new asset configuration
  await db
    .insert(assetConfigurations)
    .values({
      id: configId,
      chainId,
      token,
      collateralFactor,
      liquidationThreshold,
      liquidationBonus,
      reserveFactor,
      timestamp,
      blockNumber: BigInt(event.block.number),
      isActive: true,
    })
    .onConflictDoUpdate(() => ({
      collateralFactor,
      liquidationThreshold,
      liquidationBonus,
      reserveFactor,
      timestamp,
      blockNumber: BigInt(event.block.number),
      isActive: true,
    }));

  await initializePoolLendingStats(db, chainId, token, collateralFactor, reserveFactor, timestamp);
}

// InterestRateParamsSet event handler
export async function handleInterestRateParamsSet({ event, context }: any) {
  await updateIndexerStatus(context, 'LendingManager:InterestRateParamsSet', event);
  const { db } = context;
  const chainId = context.network.chainId;
  const token = getAddress(event.args.token);

  const baseRate = Number(event.args.baseRate); // Already in basis points
  const optimalUtilization = Number(event.args.optimalUtilization); // Already in basis points
  const rateSlope1 = Number(event.args.rateSlope1); // Already in basis points
  const rateSlope2 = Number(event.args.rateSlope2); // Already in basis points
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  // Create unique ID for this interest rate configuration
  const rateId = `${chainId}-${token}`;

  // Insert new interest rate configuration
  await db
    .insert(interestRateParameters)
    .values({
      id: rateId,
      chainId,
      token,
      baseRate,
      optimalUtilization,
      rateSlope1,
      rateSlope2,
      timestamp,
      blockNumber: BigInt(event.block.number),
      isActive: true,
    })
    .onConflictDoUpdate(() => ({
      baseRate,
      optimalUtilization,
      rateSlope1,
      rateSlope2,
      timestamp,
      blockNumber: BigInt(event.block.number),
      isActive: true,
    }));

  // Update pool lending stats with new rate parameters
  await updatePoolLendingRates(db, chainId, token, timestamp);

  logger.info(`Interest rate parameters updated for ${token}: Base=${baseRate/100}%, Optimal=${optimalUtilization/100}%, Slope1=${rateSlope1/100}%, Slope2=${rateSlope2/100}%`, LogLabel.EVENT_HANDLER, 'handleInterestRateParamsSet', {
    token,
    baseRate,
    optimalUtilization,
    rateSlope1,
    rateSlope2,
    timestamp,
    txHash
  });
}

// Calculate borrow rate using kinked curve based on utilization (matches smart contract)
function calculateBorrowRate(utilizationRate: number, baseRate: number = 200, optimalUtilization: number = 8000, rateSlope1: number = 1000, rateSlope2: number = 2000): number {
  // Ensure we have valid parameters
  if (optimalUtilization === 0) optimalUtilization = 8000; // 80% default
  if (baseRate === 0) baseRate = 200; // 2% default
  if (rateSlope1 === 0) rateSlope1 = 1000; // 10% default
  if (rateSlope2 === 0) rateSlope2 = 2000; // 20% default

  if (utilizationRate <= optimalUtilization) {
    // Below optimal utilization: linear increase
    return Math.floor(baseRate + (utilizationRate * rateSlope1) / optimalUtilization);
  } else {
    // Above optimal utilization: steeper slope
    const excessUtilization = utilizationRate - optimalUtilization;
    const denominator = 10000 - optimalUtilization; // BASIS_POINTS - optimalUtilization
    if (denominator === 0) return baseRate + rateSlope1;

    const excessRate = Math.floor((excessUtilization * rateSlope2) / denominator);
    return baseRate + rateSlope1 + excessRate;
  }
}

// Calculate supply rate based on borrow rate and utilization (matches smart contract)
function calculateSupplyRate(borrowRate: number, utilizationRate: number, reserveFactor: number = 1000): number {
  const basisPointsMinusReserve = 10000 - reserveFactor; // BASIS_POINTS - protocolReserve
  const denominator = 10000 * 10000; // BASIS_POINTS * BASIS_POINTS

  const calculatedRate = (borrowRate * utilizationRate * basisPointsMinusReserve) / denominator;

  // Fix: Ensure minimum precision and round properly to prevent rounding to zero
  return Math.max(1, Math.round(calculatedRate)); // Minimum 1 basis point (0.01%) for display purposes
}

// Get interest rate parameters for a token (only from database)
async function getInterestRateParams(db: any, chainId: number, token: string): Promise<{
  baseRate: number;
  optimalUtilization: number;
  rateSlope1: number;
  rateSlope2: number;
  reserveFactor: number;
}> {
  try {
    // Get from interest rate parameters table
    const rateParams = await db.find(interestRateParameters, { id: `${chainId}-${token}` });
    const assetConfig = await db.find(assetConfigurations, { id: `${chainId}-${token}` });

    if (rateParams) {
      return {
        baseRate: rateParams.baseRate,
        optimalUtilization: rateParams.optimalUtilization,
        rateSlope1: rateParams.rateSlope1,
        rateSlope2: rateParams.rateSlope2,
        reserveFactor: assetConfig?.reserveFactor || 1000,
      };
    }

    // No rate parameters found - throw error instead of fallback
    throw new Error(`Interest rate parameters not found for token ${token} on chain ${chainId}. Tokens must be configured with setInterestRateParams() before rates can be calculated.`);
  } catch (error) {
    logger.error(`Error getting interest rate params for ${token}`, LogLabel.DATABASE, 'getInterestRateParams', { token, error: error instanceof Error ? error.message : String(error) });

    // Re-throw to make the error visible
    throw error;
  }
}

// Update only the rates in pool lending stats (used by InterestRateParamsUpdated)
async function updatePoolLendingRates(db: any, chainId: number, token: string, timestamp: number) {
  try {
    const statsId = `${chainId}-${token}`;

    // Get current pool stats
    const currentStats = await db.find(poolLendingStats, { id: statsId });
    if (!currentStats) {
      logger.warn(`Pool stats not found for ${token}, cannot update rates`, LogLabel.DATABASE, 'updatePoolLendingRates', { token });
      return;
    }

    // Get interest rate parameters (will throw if not configured)
    let rateParams;
    try {
      rateParams = await getInterestRateParams(db, chainId, token);
    } catch (error) {
      logger.warn(`Cannot update rates for ${token}: ${error instanceof Error ? error.message : String(error)}`, LogLabel.DATABASE, 'updatePoolLendingRates', { token });
      return;
    }

    const { baseRate, optimalUtilization, rateSlope1, rateSlope2, reserveFactor } = rateParams;

    // Calculate current utilization rate
    let utilizationRate = 0;
    if (currentStats.totalSupply > 0n) {
      utilizationRate = Number((currentStats.totalBorrow * 10000n) / currentStats.totalSupply);
    }

    // Calculate new rates using current utilization
    const borrowRate = calculateBorrowRate(utilizationRate, baseRate, optimalUtilization, rateSlope1, rateSlope2);
    const supplyRate = calculateSupplyRate(borrowRate, utilizationRate, reserveFactor);

    // Update only the rates
    await db
      .update(poolLendingStats, { id: statsId })
      .set({
        supplyRate,
        borrowRate,
        utilizationRate,
        lastUpdated: timestamp,
      });

    logger.info(`Pool rates updated for ${token}: BorrowAPY=${(borrowRate/100).toFixed(2)}%, SupplyAPY=${(supplyRate/100).toFixed(2)}%`, LogLabel.SYSTEM, 'updatePoolLendingRates', {
      token,
      baseRate,
      optimalUtilization,
      rateSlope1,
      rateSlope2,
      utilizationRate,
      borrowRate,
      supplyRate
    });
  } catch (error) {
    logger.error(`Failed to update pool lending rates for ${token}`, LogLabel.DATABASE, 'updatePoolLendingRates', { token, error: error instanceof Error ? error.message : String(error) });
  }
}

// Update pool lending stats with new supply/borrow amounts and recalculate rates using smart contract logic
async function updatePoolLendingStats(
  db: any,
  chainId: number,
  token: string,
  supplyAmount: bigint,
  borrowAmount: bigint,
  timestamp: number
) {
  try {
    const statsId = `${chainId}-${token}`;

    // Get current stats to calculate new utilization and rates
    const currentStats = await db.find(poolLendingStats, { id: statsId });

    // For negative amounts (withdrawals/repayments), we need existing stats
    if (!currentStats && (supplyAmount < 0n || borrowAmount < 0n)) {
      logger.warn(`Cannot update pool stats for ${token}: No existing stats for withdrawal/repayment`, LogLabel.DATABASE, 'updatePoolLendingStats', { token, supplyAmount: supplyAmount.toString(), borrowAmount: borrowAmount.toString() });
      return;
    }

    // Calculate new totals (ensure non-negative)
    const newTotalSupply = currentStats
      ? (currentStats.totalSupply + supplyAmount < 0n ? 0n : currentStats.totalSupply + supplyAmount)
      : (supplyAmount < 0n ? 0n : supplyAmount);
    const newTotalBorrow = currentStats
      ? (currentStats.totalBorrow + borrowAmount < 0n ? 0n : currentStats.totalBorrow + borrowAmount)
      : (borrowAmount < 0n ? 0n : borrowAmount);

    // Calculate utilization rate in basis points
    let utilizationRate = 0;
    if (newTotalSupply > 0n) {
      utilizationRate = Number((newTotalBorrow * 10000n) / newTotalSupply);
    }

    // Get per-token interest rate parameters (will throw if not configured)
    let rateParams;
    try {
      rateParams = await getInterestRateParams(db, chainId, token);
    } catch (error) {
      logger.warn(`Cannot update pool stats for ${token}: ${error instanceof Error ? error.message : String(error)}`, LogLabel.DATABASE, 'updatePoolLendingStats', { token });
      // Update pool stats without rates if parameters not configured
      await db
        .insert(poolLendingStats)
        .values({
          id: statsId,
          chainId,
          poolId: `${chainId}-lending-${token}`,
          token,
          totalSupply: newTotalSupply,
          totalBorrow: newTotalBorrow,
          supplyRate: 0, // No rates available
          borrowRate: 0, // No rates available
          utilizationRate, // Store as basis points
          totalYieldGenerated: currentStats ? currentStats.totalYieldGenerated : BigInt(0),
          activeLenders: currentStats ? currentStats.activeLenders : 0,
          activeBorrowers: currentStats ? currentStats.activeBorrowers : 0,
          lastUpdated: timestamp,
        })
        .onConflictDoUpdate(() => ({
          totalSupply: newTotalSupply,
          totalBorrow: newTotalBorrow,
          utilizationRate,
          lastUpdated: timestamp,
        }));

      logger.info(`Pool stats updated for ${token} without rates (parameters not configured): Supply=${newTotalSupply.toString()}, Borrow=${newTotalBorrow.toString()}, Utilization=${(utilizationRate/100).toFixed(2)}%`, LogLabel.SYSTEM, 'updatePoolLendingStats', {
        token,
        supplyAmount: supplyAmount.toString(),
        borrowAmount: borrowAmount.toString(),
        utilizationRate: utilizationRate.toString()
      });
      return;
    }

    const { baseRate, optimalUtilization, rateSlope1, rateSlope2, reserveFactor } = rateParams;

    // Calculate rates using smart contract formulas
    const borrowRate = calculateBorrowRate(utilizationRate, baseRate, optimalUtilization, rateSlope1, rateSlope2);
    const supplyRate = calculateSupplyRate(borrowRate, utilizationRate, reserveFactor);

    // Update the pool stats with new amounts and calculated rates
    await db
      .insert(poolLendingStats)
      .values({
        id: statsId,
        chainId,
        poolId: `${chainId}-lending-${token}`,
        token,
        totalSupply: newTotalSupply,
        totalBorrow: newTotalBorrow,
        supplyRate, // Store as basis points
        borrowRate, // Store as basis points
        utilizationRate, // Store as basis points
        totalYieldGenerated: currentStats ? currentStats.totalYieldGenerated : BigInt(0),
        activeLenders: currentStats ? currentStats.activeLenders : 0,
        activeBorrowers: currentStats ? currentStats.activeBorrowers : 0,
        lastUpdated: timestamp,
      })
      .onConflictDoUpdate(() => ({
        totalSupply: newTotalSupply,
        totalBorrow: newTotalBorrow,
        supplyRate,
        borrowRate,
        utilizationRate,
        lastUpdated: timestamp,
      }));

    logger.info(`Pool stats updated for ${token}: Supply=${newTotalSupply.toString()}, Borrow=${newTotalBorrow.toString()}, Utilization=${(utilizationRate/100).toFixed(2)}%, BorrowAPY=${(borrowRate/100).toFixed(2)}%, SupplyAPY=${(supplyRate/100).toFixed(2)}%`, LogLabel.SYSTEM, 'updatePoolLendingStats', {
      token,
      supplyAmount: supplyAmount.toString(),
      borrowAmount: borrowAmount.toString(),
      utilizationRate: utilizationRate.toString(),
      baseRate,
      optimalUtilization,
      rateSlope1,
      rateSlope2,
      borrowRate: borrowRate.toString(),
      supplyRate: supplyRate.toString()
    });
  } catch (error) {
    logger.error(`Failed to update pool lending stats for ${token}`, LogLabel.DATABASE, 'updatePoolLendingStats', { token, error: error instanceof Error ? error.message : String(error) });
  }
}

// Initialize pool lending stats with per-token smart contract rate model
async function initializePoolLendingStats(
  db: any,
  chainId: number,
  token: string,
  _collateralFactor: number, // Unused but kept for interface compatibility
  reserveFactor: number,
  timestamp: number
) {
  try {
    const poolId = `${chainId}-lending-${token}`;
    const statsId = `${chainId}-${token}`;

    // Get per-token interest rate parameters (will throw if not configured)
    let rateParams;
    let initialBorrowRate = 0;
    let initialSupplyRate = 0;
    let baseRate = 0;
    let optimalUtilization = 0;
    let rateSlope1 = 0;
    let rateSlope2 = 0;

    try {
      rateParams = await getInterestRateParams(db, chainId, token);
      baseRate = rateParams.baseRate;
      optimalUtilization = rateParams.optimalUtilization;
      rateSlope1 = rateParams.rateSlope1;
      rateSlope2 = rateParams.rateSlope2;

      // Start with zero utilization, so rates will be at base levels
      const initialUtilization = 0;
      initialBorrowRate = calculateBorrowRate(initialUtilization, baseRate, optimalUtilization, rateSlope1, rateSlope2);
      initialSupplyRate = calculateSupplyRate(initialBorrowRate, initialUtilization, reserveFactor);

      logger.info(`Pool stats initialized for ${token} with per-token model: Base Rate=${baseRate/100}%, Optimal Util=${optimalUtilization/100}%, Slope1=${rateSlope1/100}%, Slope2=${rateSlope2/100}%`, LogLabel.SYSTEM, 'initializePoolLendingStats', {
        token,
        baseRate,
        optimalUtilization,
        rateSlope1,
        rateSlope2,
        reserveFactor,
        initialBorrowRate,
        initialSupplyRate
      });
    } catch (error) {
      logger.warn(`Initializing pool stats for ${token} without rates: ${error instanceof Error ? error.message : String(error)}`, LogLabel.DATABASE, 'initializePoolLendingStats', { token });
    }

    // Insert or update pool lending stats (with or without rates)
    await db
      .insert(poolLendingStats)
      .values({
        id: statsId,
        chainId,
        poolId,
        token,
        totalSupply: BigInt(0),
        totalBorrow: BigInt(0),
        supplyRate: initialSupplyRate, // Store as basis points (0 if not configured)
        borrowRate: initialBorrowRate, // Store as basis points (0 if not configured)
        utilizationRate: 0, // Store as basis points
        totalYieldGenerated: BigInt(0),
        activeLenders: 0,
        activeBorrowers: 0,
        lastUpdated: timestamp,
      })
      .onConflictDoUpdate(() => ({
        supplyRate: initialSupplyRate,
        borrowRate: initialBorrowRate,
        utilizationRate: 0,
        lastUpdated: timestamp,
      }));
  } catch (error) {
    logger.error(`Failed to initialize pool lending stats for ${token}`, LogLabel.DATABASE, 'initializePoolLendingStats', { token, error: error instanceof Error ? error.message : String(error) });
  }
}

