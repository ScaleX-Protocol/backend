import { updateIndexerStatus } from "@/utils/indexerStatus";
import { createLogger, log, LogLabel, LogLevel } from "../utils/logger";
import { predictionEvents, predictionMarkets, predictionPositions } from "ponder:schema";
import { getAddress } from "viem";

const logger = createLogger('pricePredictionHandler.ts');

// In-memory set of known market IDs.
// Populated on MarketCreated and lazily on first use via db.find() fallback,
// so markets created before the indexer started are handled correctly.
const knownMarkets = new Set<string>();

async function marketExists(db: any, marketDbId: string): Promise<boolean> {
  if (knownMarkets.has(marketDbId)) return true;
  const row = await db.find(predictionMarkets, { id: marketDbId });
  if (row) knownMarkets.add(marketDbId);
  return !!row;
}

// Market status values matching the contract enum
const MARKET_STATUS = {
  OPEN: 0,
  SETTLEMENT_REQUESTED: 1,
  SETTLED: 2,
  CANCELLED: 3,
} as const;

function createMarketId(chainId: number, marketId: bigint): string {
  return `${chainId}-${marketId.toString()}`;
}

function createPositionId(chainId: number, marketId: bigint, userAddress: string): string {
  return `${chainId}-${marketId.toString()}-${userAddress.toLowerCase()}`;
}

function createEventId(txHash: string, eventType: string, marketId: bigint): string {
  return `${txHash}-${eventType}-${marketId.toString()}`;
}

export async function handleMarketCreated({ event, context }: any) {
  // await updateIndexerStatus(context, 'PricePrediction:MarketCreated', event); // perf
  const { db } = context;
  const chainId = context.network.chainId;

  const marketId = BigInt(event.args.marketId);
  const baseToken = getAddress(event.args.baseToken);
  const marketType = Number(event.args.marketType);
  const strikePrice = BigInt(event.args.strikePrice);
  const openingTwap = BigInt(event.args.openingTwap);
  const startTime = Number(event.args.startTime);
  const endTime = Number(event.args.endTime);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  const id = createMarketId(chainId, marketId);

  await db
    .insert(predictionMarkets)
    .values({
      id,
      chainId,
      marketId,
      marketType,
      status: MARKET_STATUS.OPEN,
      baseToken,
      strikePrice,
      openingTwap,
      startTime,
      endTime,
      totalUp: BigInt(0),
      totalDown: BigInt(0),
      outcome: null,
      protocolFee: null,
      transactionId: txHash,
    })
    .onConflictDoUpdate(() => ({
      marketType,
      status: MARKET_STATUS.OPEN,
      baseToken,
      strikePrice,
      openingTwap,
      startTime,
      endTime,
      transactionId: txHash,
    }));

  await db
    .insert(predictionEvents)
    .values({
      id: createEventId(txHash, 'MarketCreated', marketId),
      chainId,
      marketId,
      eventType: 'MarketCreated',
      userAddress: null,
      amount: null,
      predictedUp: null,
      outcome: null,
      payout: null,
      timestamp,
      blockNumber: BigInt(event.block.number),
      transactionId: txHash,
    })
    .onConflictDoNothing();

  knownMarkets.add(id);

  log(LogLevel.INFO, `Market ${marketId} created (type=${marketType}, endTime=${endTime})`, LogLabel.EVENT_HANDLER, 'core-chain', { chainId, marketId: marketId.toString() }, 'pricePredictionHandler.ts', 'handleMarketCreated');
}

export async function handlePredicted({ event, context }: any) {
  // await updateIndexerStatus(context, 'PricePrediction:Predicted', event); // perf
  const { db } = context;
  const chainId = context.network.chainId;

  const marketId = BigInt(event.args.marketId);
  const user = getAddress(event.args.user);
  const predictedUp = Boolean(event.args.predictedUp);
  const amount = BigInt(event.args.amount);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  const marketDbId = createMarketId(chainId, marketId);
  const positionId = createPositionId(chainId, marketId, user);

  // Update market totals (skip if market record doesn't exist)
  if (await marketExists(db, marketDbId)) {
    if (predictedUp) {
      await db.update(predictionMarkets, { id: marketDbId }).set((row: any) => ({ totalUp: row.totalUp + amount }));
    } else {
      await db.update(predictionMarkets, { id: marketDbId }).set((row: any) => ({ totalDown: row.totalDown + amount }));
    }
  }

  // Upsert position
  const existingPosition = await context.db.find(predictionPositions, { id: positionId });
  if (existingPosition) {
    await db
      .update(predictionPositions, { id: positionId })
      .set((row: any) => ({
        stakeUp: predictedUp ? row.stakeUp + amount : row.stakeUp,
        stakeDown: !predictedUp ? row.stakeDown + amount : row.stakeDown,
        lastUpdated: timestamp,
      }));
  } else {
    await db
      .insert(predictionPositions)
      .values({
        id: positionId,
        chainId,
        marketId,
        userAddress: user,
        stakeUp: predictedUp ? amount : BigInt(0),
        stakeDown: !predictedUp ? amount : BigInt(0),
        claimed: false,
        payout: null,
        lastUpdated: timestamp,
      });
  }

  // Record event
  await db
    .insert(predictionEvents)
    .values({
      id: createEventId(txHash, 'Predicted', marketId),
      chainId,
      marketId,
      eventType: 'Predicted',
      userAddress: user,
      amount,
      predictedUp,
      outcome: null,
      payout: null,
      timestamp,
      blockNumber: BigInt(event.block.number),
      transactionId: txHash,
    })
    .onConflictDoNothing();
}

export async function handleSettlementRequested({ event, context }: any) {
  // await updateIndexerStatus(context, 'PricePrediction:SettlementRequested', event); // perf
  const { db } = context;
  const chainId = context.network.chainId;

  const marketId = BigInt(event.args.marketId);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  const marketDbId = createMarketId(chainId, marketId);

  if (await marketExists(db, marketDbId)) {
    await db
      .update(predictionMarkets, { id: marketDbId })
      .set(() => ({
        status: MARKET_STATUS.SETTLEMENT_REQUESTED,
      }));
  }

  await db
    .insert(predictionEvents)
    .values({
      id: createEventId(txHash, 'SettlementRequested', marketId),
      chainId,
      marketId,
      eventType: 'SettlementRequested',
      userAddress: null,
      amount: null,
      predictedUp: null,
      outcome: null,
      payout: null,
      timestamp,
      blockNumber: BigInt(event.block.number),
      transactionId: txHash,
    })
    .onConflictDoNothing();
}

export async function handleMarketSettled({ event, context }: any) {
  // await updateIndexerStatus(context, 'PricePrediction:MarketSettled', event); // perf
  const { db } = context;
  const chainId = context.network.chainId;

  const marketId = BigInt(event.args.marketId);
  const outcome = Boolean(event.args.outcome);
  const totalUp = BigInt(event.args.totalUp);
  const totalDown = BigInt(event.args.totalDown);
  const protocolFee = BigInt(event.args.protocolFee);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  const marketDbId = createMarketId(chainId, marketId);

  if (await marketExists(db, marketDbId)) {
    await db
      .update(predictionMarkets, { id: marketDbId })
      .set(() => ({
        status: MARKET_STATUS.SETTLED,
        outcome,
        totalUp,
        totalDown,
        protocolFee,
      }));
  }

  await db
    .insert(predictionEvents)
    .values({
      id: createEventId(txHash, 'MarketSettled', marketId),
      chainId,
      marketId,
      eventType: 'MarketSettled',
      userAddress: null,
      amount: null,
      predictedUp: null,
      outcome,
      payout: null,
      timestamp,
      blockNumber: BigInt(event.block.number),
      transactionId: txHash,
    })
    .onConflictDoNothing();

  log(LogLevel.INFO, `Market ${marketId} settled (outcome=${outcome})`, LogLabel.EVENT_HANDLER, 'core-chain', { chainId, marketId: marketId.toString(), outcome }, 'pricePredictionHandler.ts', 'handleMarketSettled');
}

export async function handleClaimed({ event, context }: any) {
  // await updateIndexerStatus(context, 'PricePrediction:Claimed', event); // perf
  const { db } = context;
  const chainId = context.network.chainId;

  const marketId = BigInt(event.args.marketId);
  const user = getAddress(event.args.user);
  const payout = BigInt(event.args.payout);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  const positionId = createPositionId(chainId, marketId, user);

  await db
    .update(predictionPositions, { id: positionId })
    .set(() => ({
      claimed: true,
      payout,
      lastUpdated: timestamp,
    }));

  await db
    .insert(predictionEvents)
    .values({
      id: createEventId(txHash, 'Claimed', marketId),
      chainId,
      marketId,
      eventType: 'Claimed',
      userAddress: user,
      amount: null,
      predictedUp: null,
      outcome: null,
      payout,
      timestamp,
      blockNumber: BigInt(event.block.number),
      transactionId: txHash,
    })
    .onConflictDoNothing();
}

export async function handleMarketCancelled({ event, context }: any) {
  // await updateIndexerStatus(context, 'PricePrediction:MarketCancelled', event); // perf
  const { db } = context;
  const chainId = context.network.chainId;

  const marketId = BigInt(event.args.marketId);
  const timestamp = Number(event.block.timestamp);
  const txHash = event.transaction.hash;

  const marketDbId = createMarketId(chainId, marketId);

  if (await marketExists(db, marketDbId)) {
    await db
      .update(predictionMarkets, { id: marketDbId })
      .set(() => ({
        status: MARKET_STATUS.CANCELLED,
      }));
  }

  await db
    .insert(predictionEvents)
    .values({
      id: createEventId(txHash, 'MarketCancelled', marketId),
      chainId,
      marketId,
      eventType: 'MarketCancelled',
      userAddress: null,
      amount: null,
      predictedUp: null,
      outcome: null,
      payout: null,
      timestamp,
      blockNumber: BigInt(event.block.number),
      transactionId: txHash,
    })
    .onConflictDoNothing();
}
