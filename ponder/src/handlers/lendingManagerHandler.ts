import { getEventPublisher } from "@/events/index";
import { createBalanceId, createLendingPositionId } from "@/utils";
import { executeIfInSync } from "@/utils/syncState";
import { sql } from "ponder";
import {
  assetConfigurations,
  balances,
  lendingEvents,
  lendingPositions,
  liquidations,
  oraclePrices,
  poolLendingStats,
  syntheticTokens,
  userLendingStats
} from "ponder:schema";
import { getAddress } from "viem";

// Helper functions for lending statistics
async function upsertUserLendingStats(
  db: any,
  chainId: number,
  user: string,
  action: string,
  amount: bigint,
  timestamp: number
) {
  const userId = `${chainId}-${user}`;
  const statsId = `${chainId}-${user}-lending`;

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
      user,
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
    console.error('Failed to publish lending event:', error);
  }
}

// Supply event handler
export async function handleSupply({ event, context }: any) {
  const { db } = context;
  const chainId = context.network.chainId;


  const user = event.args.user;
  const token = getAddress(event.args.token);
  const amount = BigInt(event.args.amount);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  // Create/update lending position
  const positionId = createLendingPositionId(chainId, user, token, token);

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
        user,
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

  await db.insert(lendingEvents).values({
    id: eventId,
    chainId,
    user,
    action: "SUPPLY",
    token,
    amount,
    timestamp,
    transactionId: txHash,
    blockNumber: BigInt(event.block.number),
  }).onConflictDoUpdate((row: any) => ({
    chainId,
    user,
    action: "SUPPLY",
    token,
    amount,
    timestamp,
    transactionId: txHash,
    blockNumber: BigInt(event.block.number),
  }));

  // Update user stats
  await upsertUserLendingStats(db, chainId, user, "SUPPLY", amount, timestamp);

  // Update user balance to reflect real lending supply
  const balanceId = createBalanceId(chainId, token, user);
  await db
    .insert(balances)
    .values({
      id: balanceId,
      user,
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
    await publishLendingEvent("SUPPLY", user, token, amount.toString(), timestamp);

    // Update balance event
    const balance = await db.find(balances, { id: balanceId });
    if (balance) {
      const eventPublisher = getEventPublisher();
      await eventPublisher.publishBalanceUpdate({
        userId: balance.user,
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
  const { db } = context;
  const chainId = context.network.chainId;

  const user = event.args.user;
  const token = getAddress(event.args.token);
  const amount = BigInt(event.args.amount);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  try {
    // Update lending position
    const positionId = createLendingPositionId(chainId, user, token, token);
    await db
      .insert(lendingPositions)
      .values({
        id: positionId,
        chainId,
        user,
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
      user,
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
    await upsertUserLendingStats(db, chainId, user, "BORROW", amount, timestamp);

    // Update user balance to reflect debt (negative balance indicates debt)
    const balanceId = createBalanceId(chainId, token, user);
    await db
      .insert(balances)
      .values({
        id: balanceId,
        user,
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
      await publishLendingEvent("BORROW", user, token, amount.toString(), timestamp, {
        healthFactor: "10000",
        interestRate: "0"
      });
    }, 'handleBorrow');
  } catch (error) {
    console.error('❌ handleBorrow ERROR:', error);
    console.error('Error details:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Repay event handler
export async function handleRepay({ event, context }: any) {
  const { db } = context;
  const chainId = context.network.chainId;
  const user = event.args.user;
  const token = getAddress(event.args.token);
  const amount = BigInt(event.args.amount);
  const interest = BigInt(event.args.interest || 0);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  // Record repay event
  const eventId = `${txHash}-repay-${timestamp}`;
  await db.insert(lendingEvents).values({
    id: eventId,
    chainId,
    user,
    action: "REPAY",
    token: token,
    amount: amount + interest,
    timestamp: timestamp,
    transactionId: txHash,
    blockNumber: BigInt(event.block.number),
  });

  // Update user stats
  await upsertUserLendingStats(db, chainId, user, "REPAY", amount, timestamp);

  // Update user balance
  const balanceId = createBalanceId(chainId, token, user);
  await db
    .update(balances, { id: balanceId })
    .set({
      amount: sql`${balances.amount} + ${amount}`,
      lastUpdated: timestamp,
    });

  // Publish events if in sync
  await executeIfInSync(Number(event.block.number), async () => {
    await publishLendingEvent("REPAY", user, token, amount.toString(), timestamp, {
      interestPaid: interest.toString(),
      healthFactor: "10000"
    });
  }, 'handleRepay');
}

// Withdraw event handler
export async function handleWithdraw({ event, context }: any) {
  const { db } = context;
  const chainId = context.network.chainId;
  const user = event.args.user;
  const token = getAddress(event.args.token);
  const amount = BigInt(event.args.amount);
  const yieldAmount = BigInt(event.args.yield || 0);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  // Update synthetic token tracking
  const syntheticTokenId = `${chainId}-${token}`;
  await db.update(syntheticTokens, { id: syntheticTokenId }).set({
    totalSupply: sql`${syntheticTokens.totalSupply} - ${amount}`,
    lastUpdated: timestamp,
  });

  // Record lending event
  const eventId = `${txHash}-withdraw-${timestamp}`;
  await db.insert(lendingEvents).values({
    id: eventId,
    chainId,
    user,
    action: "WITHDRAW",
    token: token,
    amount,
    timestamp,
    transactionId: txHash,
    blockNumber: BigInt(event.block.number),
  });

  // Update user stats
  await upsertUserLendingStats(db, chainId, user, "WITHDRAW", amount, timestamp);

  // Update user balance
  const balanceId = createBalanceId(chainId, token, user);
  await db
    .update(balances, { id: balanceId })
    .set({
      amount: sql`${balances.amount} - ${amount}`,
      lastUpdated: timestamp,
    });

  // Publish events if in sync
  await executeIfInSync(Number(event.block.number), async () => {
    await publishLendingEvent("WITHDRAW", user, token, amount.toString(), timestamp, {
      interestEarned: yieldAmount.toString()
    });
  }, 'handleWithdraw');
}

// Liquidation event handler
export async function handleLiquidation({ event, context }: any) {
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
  const { db } = context;
  const chainId = context.network.chainId;
  const token = getAddress(event.args.token);

  const collateralFactor = Number(BigInt(event.args.collateralFactor) / BigInt(10 ** 14));
  const liquidationThreshold = Number(BigInt(event.args.liquidationThreshold) / BigInt(10 ** 14));
  const liquidationBonus = Number(BigInt(event.args.liquidationBonus) / BigInt(10 ** 14));
  const reserveFactor = Number(BigInt(event.args.reserveFactor) / BigInt(10 ** 14));
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

// Initialize pool lending stats with calculated APY rates
async function initializePoolLendingStats(
  db: any,
  chainId: number,
  token: string,
  collateralFactor: number,
  reserveFactor: number,
  timestamp: number
) {
  try {
    const poolId = `${chainId}-lending-${token}`;
    const statsId = `${chainId}-${token}`;

    // Calculate base APY rates based on risk factors
    // These are realistic rates similar to Aave/Compound
    let baseSupplyAPY, baseBorrowAPY;

    if (collateralFactor >= 8000) { // 80%+ collateral factor (e.g., WBTC, WETH)
      baseSupplyAPY = 150; // 1.5%
      baseBorrowAPY = 400; // 4.0%
    } else if (collateralFactor >= 7500) { // 75%+ collateral factor (e.g., major altcoins)
      baseSupplyAPY = 250; // 2.5%
      baseBorrowAPY = 600; // 6.0%
    } else if (collateralFactor >= 7000) { // 70%+ collateral factor
      baseSupplyAPY = 350; // 3.5%
      baseBorrowAPY = 800; // 8.0%
    } else { // Lower collateral factors
      baseSupplyAPY = 500; // 5.0%
      baseBorrowAPY = 1200; // 12.0%
    }

    // Add reserve factor to borrow rate (protocol fee)
    baseBorrowAPY = baseBorrowAPY + (reserveFactor / 10);

    // Insert or update pool lending stats
    await db
      .insert(poolLendingStats)
      .values({
        id: statsId,
        chainId,
        poolId,
        token,
        totalSupply: BigInt(0),
        totalBorrow: BigInt(0),
        supplyRate: baseSupplyAPY, // Store as basis points (150 = 1.5%)
        borrowRate: baseBorrowAPY, // Store as basis points (400 = 4.0%)
        utilizationRate: 0,
        totalYieldGenerated: BigInt(0),
        activeLenders: 0,
        activeBorrowers: 0,
        lastUpdated: timestamp,
      })
      .onConflictDoUpdate(() => ({
        supplyRate: baseSupplyAPY,
        borrowRate: baseBorrowAPY,
        lastUpdated: timestamp,
      }));

    console.log(`Pool stats initialized for ${token}: Supply APY ${baseSupplyAPY / 100}%, Borrow APY ${baseBorrowAPY / 100}%`);
  } catch (error) {
    console.error(`Failed to initialize pool lending stats for ${token}:`, error);
  }
}