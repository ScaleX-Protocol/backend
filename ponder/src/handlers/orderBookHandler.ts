import { getEventPublisher } from "@/events/index";
import { OrderMatchedEventArgs, OrderPlacedEventArgs } from "@/types";
import {
  createDepthData,
  createOrderData,
  createOrderHistoryId,
  createOrderId,
  createPoolId,
  createTradeId,
  getOppositeSide,
  getSide,
  insertOrder,
  insertOrderBookDepth,
  insertOrderBookTrades,
  insertTrade,
  ORDER_STATUS,
  OrderSide,
  TIME_INTERVALS,
  updateCandlestickBuckets,
  updateOrder,
  updateOrderStatusAndTimestamp,
  updatePoolVolume,
  upsertOrderBookDepth,
  upsertOrderBookDepthOnCancel,
  upsertOrderHistory,
} from "@/utils";
import { getDepth } from "@/utils/getDepth";
import { getPoolTradingPair } from "@/utils/getPoolTradingPair";
import { executeIfInSync } from "@/utils/syncState";
import dotenv from "dotenv";
import { and, eq } from "ponder";
import {
  fiveMinuteBuckets,
  hourBuckets,
  minuteBuckets,
  orders,
  thirtyMinuteBuckets,
  users
} from "ponder:schema";

dotenv.config();

async function upsertUserForOrder(db: any, chainId: number, user: string, timestamp: number, volume: bigint) {
	const userId = `${chainId}-${user}`;
	await db
		.insert(users)
		.values({
			id: userId,
			chainId: chainId,
			address: user,
			firstSeenTimestamp: timestamp,
			lastSeenTimestamp: timestamp,
			totalOrders: 1,
			totalDeposits: 0,
			totalVolume: volume,
		})
		.onConflictDoUpdate((row: any) => ({
			lastSeenTimestamp: timestamp,
			totalOrders: row.totalOrders + 1,
			totalVolume: row.totalVolume + volume,
		}));
}

async function upsertUserActivity(db: any, chainId: number, user: string, timestamp: number) {
	const userId = `${chainId}-${user}`;
	await db
		.insert(users)
		.values({
			id: userId,
			chainId: chainId,
			address: user,
			firstSeenTimestamp: timestamp,
			lastSeenTimestamp: timestamp,
			totalOrders: 0,
			totalDeposits: 0,
			totalVolume: BigInt(0),
		})
		.onConflictDoUpdate((row: any) => ({
			lastSeenTimestamp: timestamp,
		}));
}

// Helper function to publish events
async function publishOrderEvent(order: any, symbol: string, timestamp: number, executionType: "new" | "trade" | "cancelled", filledQuantity: bigint, _executionPrice: bigint) {
  try {
    const eventPublisher = getEventPublisher();

    // Publish order event
    await eventPublisher.publishOrder({
      orderId: order.orderId.toString(),
      userId: order.user,
      symbol: symbol.toLowerCase(),
      side: order.side.toLowerCase(),
      type: order.type.toLowerCase(),
      price: order.price.toString(),
      quantity: order.quantity.toString(),
      filledQuantity: order.filled.toString(),
      status: order.status.toLowerCase(),
      timestamp: timestamp.toString()
    });

    // Publish execution report
    await eventPublisher.publishExecutionReport({
      orderId: order.orderId.toString(),
      userId: order.user,
      symbol: symbol.toLowerCase(),
      side: order.side.toLowerCase(),
      type: order.type.toLowerCase(),
      price: order.price.toString(),
      quantity: order.quantity.toString(),
      filledQuantity: filledQuantity.toString(),
      status: order.status.toLowerCase(),
      timestamp: timestamp.toString(),
      executionType: executionType
    });
  } catch (error) {
    console.error('Failed to publish order event:', error);
  }
}

async function publishTradeEvent(symbol: string, price: string, quantity: string, userId: string, side: string, tradeId: string, orderId: string, makerOrderId: string, timestamp: number) {
  try {
    const eventPublisher = getEventPublisher();

    await eventPublisher.publishTrade({
      symbol: symbol.toLowerCase(),
      price: price,
      quantity: quantity,
      timestamp: timestamp.toString(),
      userId: userId,
      side: side.toLowerCase() as "buy" | "sell",
      tradeId: tradeId,
      orderId: orderId,
      makerOrderId: makerOrderId
    });
  } catch (error) {
    console.error('Failed to publish trade event:', error);
  }
}

async function publishDepthEvent(symbol: string, bids: any[], asks: any[], timestamp: number) {
  try {
    const eventPublisher = getEventPublisher();

    await eventPublisher.publishDepth({
      symbol: symbol.toLowerCase(),
      bids: bids,
      asks: asks,
      timestamp: timestamp.toString()
    });
  } catch (error) {
    console.error('Failed to publish depth event:', error);
  }
}

async function publishKlineEvent(symbol: string, interval: string, klinePayload: any) {
  try {
    const eventPublisher = getEventPublisher();

    await eventPublisher.publishKline({
      symbol: symbol.toLowerCase(),
      interval: interval,
      openTime: klinePayload.t.toString(),
      closeTime: klinePayload.T.toString(),
      open: klinePayload.o,
      high: klinePayload.h,
      low: klinePayload.l,
      close: klinePayload.c,
      volume: klinePayload.v,
      trades: klinePayload.n.toString()
    });
  } catch (error) {
    console.error('Failed to publish kline event:', error);
  }
}

export async function handleOrderPlaced({ event, context }: any) {

  try {

    const args = event.args as OrderPlacedEventArgs;

    const db = context.db;
    const chainId = context.network.chainId;
    const txHash = event.transaction.hash;


    if (!db) throw new Error('Database context is null or undefined');
    if (!chainId) throw new Error('Chain ID is missing from context');
    if (!txHash) throw new Error('Transaction hash is missing');

    const filled = BigInt(0);
    const orderId = BigInt(args.orderId!);
    const poolAddress = event.log.address!;
    const price = BigInt(args.price);
    const quantity = BigInt(args.quantity);


    let side, status;
    try {
      side = getSide(args.side);
    } catch (error) {
      throw new Error(`Failed to convert side: ${(error as Error).message}`);
    }

    try {
      status = ORDER_STATUS[Number(args.status)];
    } catch (error) {
      throw new Error(`Failed to convert status: ${(error as Error).message}`);
    }

    const timestamp = Number(event.block.timestamp);

    let orderData;
    try {
      orderData = createOrderData(chainId, args, poolAddress, side, timestamp);
    } catch (error) {
      throw new Error(`Failed to create order data: ${(error as Error).message}`);
    }

    try {
      await insertOrder(db, orderData);
    } catch (error) {
      console.error('Order insertion failed:', error);
      throw new Error(`Failed to insert order: ${(error as Error).message}`);
    }

    // Track user for order
    const volume = price * quantity;
    await upsertUserForOrder(db, chainId, args.user, timestamp, volume);

    const historyId = createOrderHistoryId(chainId, txHash, filled, poolAddress, orderId.toString());
    const historyData = { id: historyId, chainId, orderId, poolId: poolAddress, timestamp, quantity, filled, status };

    try {
      await upsertOrderHistory(db, historyData);
    } catch (error) {
      console.error('Order history upsert failed:', error);
      throw new Error(`Failed to upsert order history: ${(error as Error).message}`);
    }

    const depthId = `${poolAddress}-${side.toLowerCase()}-${price.toString()}`;
    let depthData;
    try {
      depthData = createDepthData(chainId, depthId, poolAddress, side, price, quantity, timestamp);
    } catch (error) {
      console.error('Depth data creation failed:', error);
      throw new Error(`Failed to create depth data: ${(error as Error).message}`);
    }

    try {
      await insertOrderBookDepth(db, depthData);
    } catch (error) {
      console.error('Order book depth insertion failed:', error);
      throw new Error(`Failed to insert order book depth: ${(error as Error).message}`);
    }

    try {
      await executeIfInSync(Number(event.block.number), async () => {
        let symbol;
        try {
          if (!event.log.address) {
            throw new Error(`Event log address is ${event.log.address} (${typeof event.log.address})`);
          }


          symbol = (await getPoolTradingPair(context, event.log.address, chainId, 'handleOrderPlaced', Number(event.block.number))).toUpperCase();
        } catch (error) {
          console.error('Failed to get trading pair:', error);
          throw new Error(`Failed to get trading pair: ${(error as Error).message}`);
        }

        const id = createOrderId(chainId, args.orderId, poolAddress);
        let order;
        try {
          order = await context.db.find(orders, { id: id });
          if (!order) {
            throw new Error(`Order not found in database with id: ${id}`);
          }
        } catch (error) {
          console.error('Failed to find order:', error);
          throw new Error(`Failed to find order: ${(error as Error).message}`);
        }

        try {
          // Publish events
          await publishOrderEvent(order, symbol, timestamp, "new", BigInt(0), BigInt(0));
        } catch (error) {
          console.error('Failed to publish order event:', error);
          throw new Error(`Failed to publish order event: ${(error as Error).message}`);
        }

        let latestDepth;
        try {
          latestDepth = await getDepth(event.log.address!, context.db, chainId);
        } catch (error) {
          throw new Error(`Failed to get depth: ${(error as Error).message}`);
        }

        try {
          await publishDepthEvent(symbol, latestDepth.bids as any, latestDepth.asks as any, timestamp);
        } catch (error) {
          console.error('Failed to publish depth event:', error);
          throw new Error(`Failed to publish depth event: ${(error as Error).message}`);
        }

      }, 'handleOrderPlaced');
    } catch (error) {
      throw new Error(`executeIfInSync failed: ${(error as Error).message}`);
    }


  } catch (error) {
    throw error;
  }
}

export async function handleOrderMatched({ event, context }: any) {

  const args = event.args as OrderMatchedEventArgs;
  const db = context.db;
  const chainId = context.network.chainId;
  const txHash = event.transaction.hash;

  const poolAddress = event.log.address!;
  const poolId = createPoolId(chainId, poolAddress);
  const price = BigInt(args.executionPrice);
  const quantity = BigInt(args.executedQuantity);
  const timestamp = Number(args.timestamp);

  await updatePoolVolume(db, poolId, quantity, price, timestamp);

  // Track user trade volume
  const tradeVolume = price * quantity;
  await upsertUserForOrder(db, chainId, args.user, timestamp, tradeVolume);

  const tradeId = createTradeId(chainId, txHash, args.user, getSide(args.side), args);
  await insertOrderBookTrades(db, chainId, tradeId, txHash, poolAddress, args);

  const buyTradeId = createTradeId(chainId, txHash, args.user, OrderSide.BUY, args);
  const buyOrderId = createOrderId(chainId, BigInt(args.buyOrderId), poolAddress);
  await insertTrade(db, chainId, buyTradeId, buyOrderId, price, quantity, event);
  await updateOrder(db, chainId, buyOrderId, quantity);

  const sellTradeId = createTradeId(chainId, txHash, args.user, OrderSide.SELL, args);
  const sellOrderId = createOrderId(chainId, BigInt(args.sellOrderId), poolAddress);
  await insertTrade(db, chainId, sellTradeId, sellOrderId, price, quantity, event);
  await updateOrder(db, chainId, sellOrderId, quantity);

  await upsertOrderBookDepth(db, chainId, poolAddress, getSide(args.side), price, quantity, timestamp);
  await upsertOrderBookDepth(db, chainId, poolAddress, getOppositeSide(args.side), price, quantity, timestamp);

  await updateCandlestickBuckets(db, chainId, poolId, price, quantity, event, args);

  await executeIfInSync(Number(event.block.number), async () => {
    const symbol = (await getPoolTradingPair(context, event.log.address!, chainId, 'handleOrderMatched', Number(event.block.number))).toUpperCase();
    const txHash = event.transaction.hash;
    const price = event.args.executionPrice.toString();
    const quantity = event.args.executedQuantity.toString();

    const buyRow = await context.db.find(orders, {
      id: buyOrderId
    });

    const sellRowById = await context.db.find(orders, {
      id: sellOrderId
    });

    // Publish trade event
    await publishTradeEvent(symbol, price, quantity, event.args.user, getSide(event.args.side), txHash, event.args.buyOrderId.toString(), event.args.sellOrderId.toString(), timestamp);

    if (buyRow) {
      await publishOrderEvent(buyRow, symbol, timestamp, "trade", BigInt(event.args.executedQuantity), BigInt(event.args.executionPrice));
    }

    if (sellRowById) {
      await publishOrderEvent(sellRowById, symbol, timestamp, "trade", BigInt(event.args.executedQuantity), BigInt(event.args.executionPrice));
    }

    const latestDepth = await getDepth(event.log.address!, context.db, chainId);

    // Publish depth event
    await publishDepthEvent(symbol, latestDepth.bids as any, latestDepth.asks as any, timestamp);

    const timeIntervals = [
      { table: minuteBuckets, interval: '1m', seconds: TIME_INTERVALS.minute },
      { table: fiveMinuteBuckets, interval: '5m', seconds: TIME_INTERVALS.fiveMinutes },
      { table: thirtyMinuteBuckets, interval: '30m', seconds: TIME_INTERVALS.thirtyMinutes },
      { table: hourBuckets, interval: '1h', seconds: TIME_INTERVALS.hour }
    ];

    const currentTimestamp = Number(event.block.timestamp);

    for (const { table, interval, seconds } of timeIntervals) {
      const openTime = Math.floor(currentTimestamp / seconds) * seconds;

      const klineData = await context.db.sql
        .select()
        .from(table)
        .where(
          and(
            eq(table.poolId, event.log.address!),
            eq(table.openTime, openTime)
          )
        )
        .execute();

      if (klineData.length > 0) {
        const kline = klineData[0];
        const klinePayload = {
          t: kline.openTime * 1000,
          T: kline.closeTime * 1000,
          s: symbol.toUpperCase(),
          i: interval,
          o: kline.open.toString(),
          c: kline.close.toString(),
          h: kline.high.toString(),
          l: kline.low.toString(),
          v: kline.volume.toString(),
          n: kline.count,
          x: false,
          q: kline.quoteVolume.toString(),
          V: kline.takerBuyBaseVolume.toString(),
          Q: kline.takerBuyQuoteVolume.toString()
        };

        // Publish kline event
        await publishKlineEvent(symbol, interval, klinePayload);
      }
    }

    // Mini ticker is handled by the websocket service consuming Redis streams

  }, 'handleOrderMatched');
}

export async function handleOrderCancelled({ event, context }: any) {
  const db = context.db;
  const chainId = context.network.chainId;

  const hashedOrderId = createOrderId(chainId, BigInt(event.args.orderId!), event.log.address!);
  const timestamp = Number(event.args.timestamp);

  try {
    await updateOrderStatusAndTimestamp(db, chainId, hashedOrderId, event, timestamp);
    await upsertOrderBookDepthOnCancel(db, chainId, hashedOrderId, event, timestamp);

    // Track user activity for order cancellation
    await upsertUserActivity(db, chainId, event.args.user, timestamp);

    await executeIfInSync(Number(event.block.number), async () => {
      const symbol = (await getPoolTradingPair(context, event.log.address!, chainId, 'handleOrderCancelled')).toUpperCase();
      const row = await context.db.find(orders, { id: hashedOrderId });

      if (!row) return;

      await publishOrderEvent(row, symbol, timestamp, "cancelled", BigInt(0), BigInt(0));

      const latestDepth = await getDepth(event.log.address!, context.db, chainId);

      await publishDepthEvent(symbol, latestDepth.bids as any, latestDepth.asks as any, timestamp);
    }, 'handleOrderCancelled');
  } catch (e) {
    console.error('OrderCancelled error:', e);
    throw e;
  }
}

export async function handleUpdateOrder({ event, context }: any) {
  const db = context.db;
  const chainId = context.network.chainId;

  // Validate required event args exist
  if (event.args.orderId === undefined || event.args.filled === undefined || event.args.status === undefined || event.args.timestamp === undefined) {
    console.error('UpdateOrder event missing required arguments:', event.args);
    return;
  }

  // Validate log address exists
  if (!event.log.address) {
    console.error('UpdateOrder event missing log address:', event.log);
    return;
  }

  const filled = BigInt(event.args.filled);
  const orderId = BigInt(event.args.orderId);
  const poolAddress = event.log.address;
  const status = ORDER_STATUS[Number(event.args.status)];
  const timestamp = Number(event.args.timestamp);


  const hashedOrderId = createOrderId(chainId, orderId, poolAddress);
  const orderHistoryId = createOrderHistoryId(chainId, event.transaction.hash, filled, poolAddress, orderId.toString());

  const historyData = {
    id: orderHistoryId,
    chainId,
    orderId: orderId.toString(),
    poolId: poolAddress,
    timestamp,
    filled,
    status,
  };

  try {
    await upsertOrderHistory(db, historyData);

    await updateOrderStatusAndTimestamp(db, chainId, hashedOrderId, event, timestamp);

    // Track user activity for order update (get user from order)
    const order = await db.find(orders, { id: hashedOrderId });
    if (order && order.user) {
      const updateVolume = BigInt(event.args.filled) * BigInt(order.price);
      await upsertUserForOrder(db, chainId, order.user, timestamp, updateVolume);
    }

    const isExpired = ORDER_STATUS[5];

    if (event.args.status == isExpired) {
      const order = await db.find(orders, { id: hashedOrderId });
      if (order && order.side) {
        const price = BigInt(order.price);
        await upsertOrderBookDepth(
          db,
          chainId,
          poolAddress,
          order.side,
          price,
          BigInt(order.quantity),
          timestamp,
          false
        );
      }
    }
    await executeIfInSync(Number(event.block.number), async () => {
      const symbol = (await getPoolTradingPair(context, event.log.address!, chainId, 'handleUpdateOrder')).toUpperCase();
      const row = await context.db.find(orders, { id: hashedOrderId });

      if (!row) return;

      // Publish order event
      await publishOrderEvent(row, symbol, timestamp, "trade", BigInt(event.args.filled), row.price);

      const latestDepth = await getDepth(event.log.address!, context.db, chainId);

      // Publish depth event
      await publishDepthEvent(symbol, latestDepth.bids as any, latestDepth.asks as any, timestamp);
    }, 'handleUpdateOrder');
  } catch (e) {
    console.error('UpdateOrder error:', e);
    throw e;
  }

  await executeIfInSync(Number(event.block.number), async () => {
    const symbol = (await getPoolTradingPair(context, event.log.address!, chainId, 'handleUpdateOrder', Number(event.block.number))).toUpperCase();
    const row = await context.db.find(orders, { id: hashedOrderId });

    if (!row) return;

    // Publish trade event for the fill
    await publishTradeEvent(
      symbol,
      row.price.toString(),
      event.args.filled.toString(),
      row.user,
      row.side,
      event.transaction.hash,
      row.id,
      row.id,
      timestamp
    );

    // Publish order event
    await publishOrderEvent(row, symbol, timestamp, "trade", BigInt(event.args.filled), row.price);

    const latestDepth = await getDepth(event.log.address!, context.db, chainId);

    // Publish depth event
    await publishDepthEvent(symbol, latestDepth.bids as any, latestDepth.asks as any, timestamp);

    // Publish kline events for all intervals
    const timeIntervals = [
      { table: minuteBuckets, interval: '1m', seconds: TIME_INTERVALS.minute },
      { table: fiveMinuteBuckets, interval: '5m', seconds: TIME_INTERVALS.fiveMinutes },
      { table: thirtyMinuteBuckets, interval: '30m', seconds: TIME_INTERVALS.thirtyMinutes },
      { table: hourBuckets, interval: '1h', seconds: TIME_INTERVALS.hour }
    ];

    const currentTimestamp = Number(event.block.timestamp);

    for (const { table, interval, seconds } of timeIntervals) {
      const openTime = Math.floor(currentTimestamp / seconds) * seconds;

      const klineData = await context.db.sql
        .select()
        .from(table)
        .where(
          and(
            eq(table.poolId, event.log.address!),
            eq(table.openTime, openTime)
          )
        )
        .execute();

      if (klineData.length > 0) {
        const kline = klineData[0];
        const klinePayload = {
          t: kline.openTime * 1000,
          T: kline.closeTime * 1000,
          s: symbol.toUpperCase(),
          i: interval,
          o: kline.open.toString(),
          c: kline.close.toString(),
          h: kline.high.toString(),
          l: kline.low.toString(),
          v: kline.volume.toString(),
          n: kline.count,
          x: false,
          q: kline.quoteVolume.toString(),
          V: kline.takerBuyBaseVolume.toString(),
          Q: kline.takerBuyQuoteVolume.toString()
        };

        // Publish kline event
        await publishKlineEvent(symbol, interval, klinePayload);
      }
    }

    // Mini ticker is handled by the websocket service consuming Redis streams
  }, 'handleUpdateOrder');
}