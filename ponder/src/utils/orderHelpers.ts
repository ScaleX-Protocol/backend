import {
	dailyBuckets,
	fiveMinuteBuckets,
	hourBuckets,
	minuteBuckets,
	orderBookDepth,
	orderBookTrades,
	orderHistory,
	orders,
	pools,
	thirtyMinuteBuckets,
	trades,
} from "ponder:schema";
import { ORDER_STATUS, OrderSide, OrderType, TIME_INTERVALS } from "./constants";
import { createBucketId, createOrderId } from "./id";
import { OrderMatchedEventArgs, OrderPlacedEventArgs } from "@/types";

export async function insertOrder(db: any, orderData: any) {
	await db.insert(orders).values(orderData).onConflictDoNothing();
}

export async function upsertOrderHistory(db: any, historyData: any) {
	await db
		.insert(orderHistory)
		.values(historyData)
		.onConflictDoUpdate(() => ({
			timestamp: historyData.timestamp,
			quantity: historyData.quantity,
			filled: historyData.filled,
			status: historyData.status,
		}));
}

export async function insertOrderBookDepth(db: any, depthData: any) {
	await db
		.insert(orderBookDepth)
		.values(depthData)
		.onConflictDoUpdate((row: any) => ({
			quantity: row.quantity + depthData.quantity,
			orderCount: row.orderCount + 1,
			lastUpdated: depthData.lastUpdated,
		}));
}

export function getSide(side: number) {
	return side ? OrderSide.SELL : OrderSide.BUY;
}

export function getOppositeSide(side: number) {
	return side ? OrderSide.BUY : OrderSide.SELL;
}

export function getType(isMarketOrder: boolean) {
	return isMarketOrder ? OrderType.MARKET : OrderType.LIMIT;
}

export async function insertTrade(
	db: any,
	chainId: number,
	tradeId: string,
	orderId: string,
	price: bigint,
	quantity: bigint,
	event: any
) {
	await db
		.insert(trades)
		.values({
			id: tradeId,
			chainId,
			transactionId: event.transaction.hash,
			orderId,
			timestamp: Number(event.args.timestamp),
			price,
			quantity,
			poolId: event.log.address!,
		})
		.onConflictDoNothing();
}

export async function upsertOrderBookDepth(
	db: any,
	chainId: number,
	poolAddress: string,
	side: string,
	price: bigint,
	quantity: bigint,
	timestamp: number,
	increment = false
) {
	await db
		.insert(orderBookDepth)
		.values({
			id: `${poolAddress}-${side.toLowerCase()}-${price.toString()}`,
			chainId,
			poolId: poolAddress,
			side,
			price,
			quantity,
			orderCount: 1,
			lastUpdated: timestamp,
		})
		.onConflictDoUpdate((row: any) => ({
			quantity: increment ? row.quantity + quantity : row.quantity - quantity,
			orderCount: increment ? row.orderCount + 1 : row.orderCount - 1,
			lastUpdated: timestamp,
		}));
}

export function updateCandlestickBucket(
	bucketTable: any,
	intervalInSeconds: number,
	price: bigint,
	quantity: bigint,
	timestamp: number,
	db: any,
	event: any,
	isTakerBuy: boolean,
	chainId: number,
	baseDecimals = 18,
	quoteDecimals = 6
) {
	const openTime = Math.floor(timestamp / intervalInSeconds) * intervalInSeconds;
	const closeTime = openTime + intervalInSeconds - 1;

	const bucketId = createBucketId(chainId, event.log.address!, openTime);

	const priceDecimal = Number(price);

	const baseVolume = Number(quantity) / 10 ** baseDecimals;
	const quoteVolume = Number(Number(quantity) * Number(price)) / 10 ** (baseDecimals + quoteDecimals);

	const takerBuyBaseVolume = isTakerBuy ? baseVolume : 0;
	const takerBuyQuoteVolume = isTakerBuy ? quoteVolume : 0;

	return db
		.insert(bucketTable)
		.values({
			id: bucketId,
			chainId: chainId,
			openTime: openTime,
			closeTime: closeTime,
			open: priceDecimal,
			close: priceDecimal,
			low: priceDecimal,
			high: priceDecimal,
			average: priceDecimal,
			volume: baseVolume,
			quoteVolume: quoteVolume,
			count: 1,
			takerBuyBaseVolume: takerBuyBaseVolume,
			takerBuyQuoteVolume: takerBuyQuoteVolume,
			poolId: event.log.address!,
		})
		.onConflictDoUpdate((row: any) => ({
			close: priceDecimal,
			low: Math.min(Number(row.low), priceDecimal),
			high: Math.max(Number(row.high), priceDecimal),
			average: (Number(row.average) * Number(row.count) + priceDecimal) / (Number(row.count) + 1),
			count: row.count + 1,
			volume: Number(row.volume) + baseVolume,
			quoteVolume: Number(row.quoteVolume) + quoteVolume,
			takerBuyBaseVolume: Number(row.takerBuyBaseVolume) + takerBuyBaseVolume,
			takerBuyQuoteVolume: Number(row.takerBuyQuoteVolume) + takerBuyQuoteVolume,
		}));
}

export async function insertOrderBookTrades(
	db: any,
	chainId: number,
	tradeId: string,
	transactionHash: string,
	poolId: string,
	{ user, side, timestamp, executionPrice, executedQuantity }: Partial<OrderMatchedEventArgs>
) {
	await db.insert(orderBookTrades).values({
		id: tradeId,
		chainId,
		price: executionPrice,
		quantity: executedQuantity,
		timestamp,
		transactionId: transactionHash,
		side: getSide(side as number),
		poolId,
	}).onConflictDoNothing();
}

export async function updatePoolVolume(db: any, poolId: string, quantity: bigint, price: bigint, timestamp: number) {
	await db.update(pools, { id: poolId }).set((row: any) => {
		const baseDecimals = BigInt(row.baseDecimals);
		const quoteVolume = (quantity * price) / 10n ** baseDecimals;
		return {
			price,
			volume: BigInt(row.volume) + quantity,
			volumeInQuote: BigInt(row.volumeInQuote) + quoteVolume,
			timestamp,
		};
	});
}

export async function updateOrder(db: any, chainId: number, buyOrderId: string, quantity: bigint) {
	await db
		.update(orders, {
			id: buyOrderId,
			chainId,
		})
		.set((row: any) => ({
			filled: row.filled + quantity,
			status: row.filled + quantity === row.quantity ? "FILLED" : "PARTIALLY_FILLED",
		}));
}

export async function updateCandlestickBuckets(
	db: any,
	chainId: number,
	poolId: string,
	price: bigint,
	quantity: bigint,
	event: any,
	args: OrderMatchedEventArgs
) {
	const isTakerBuy = !args.side;
	const pool = await db.find(pools, { id: poolId });

	const bucketIntervals = [
		{ table: minuteBuckets, seconds: TIME_INTERVALS.minute },
		{ table: fiveMinuteBuckets, seconds: TIME_INTERVALS.fiveMinutes },
		{ table: thirtyMinuteBuckets, seconds: TIME_INTERVALS.thirtyMinutes },
		{ table: hourBuckets, seconds: TIME_INTERVALS.hour },
		{ table: dailyBuckets, seconds: TIME_INTERVALS.day },
	] as const;

	for (const { table, seconds } of bucketIntervals) {
		await updateCandlestickBucket(
			table,
			seconds,
			price,
			quantity,
			Number(event.block.timestamp),
			db,
			event,
			isTakerBuy,
			chainId,
			pool.baseDecimals,
			pool.quoteDecimals
		);
	}
}

export function createOrderData(
	chainId: number,
	args: OrderPlacedEventArgs,
	poolId: string,
	side: string,
	timestamp: number
) {
	const orderData = {
		id: createOrderId(chainId, args.orderId, poolId),
		chainId,
		user: args.user,
		poolId,
		orderId: args.orderId,
		side,
		timestamp,
		price: args.price,
		quantity: args.quantity,
		orderValue: args.price * args.quantity,
		filled: BigInt(0),
		type: getType(args.isMarketOrder),
		status: ORDER_STATUS[Number(args.status)],
		expiry: Number(args.expiry),
	};
	return orderData;
}

export function createDepthData(
	chainId: number,
	orderBookDepthId: string,
	poolId: string,
	side: string,
	price: bigint,
	quantity: bigint,
	timestamp: number
) {
	return {
		id: orderBookDepthId,
		chainId,
		poolId,
		side,
		price,
		quantity,
		orderCount: 1,
		lastUpdated: timestamp,
	};
}

export async function updateOrderStatusAndTimestamp(
	db: any,
	chainId: number,
	hashedOrderId: string,
	event: any,
	timestamp: number
) {
	await db
		.update(orders, {
			id: hashedOrderId,
			chainId: chainId,
		})
		.set((row: any) => ({
			status: ORDER_STATUS[Number(event.args.status)],
			timestamp: timestamp,
		}));
}

export async function upsertOrderBookDepthOnCancel(
	db: any,
	chainId: number,
	hashedOrderId: string,
	event: any,
	timestamp: number
) {
	const order = await db.find(orders, { id: hashedOrderId });
	const price = BigInt(order.price);
	const side = getSide(order.side);
	await db
		.insert(orderBookDepth)
		.values({
			id: `${event.log.address!}-${side.toLowerCase()}-${price.toString()}`,
			chainId: chainId,
			poolId: event.log.address!,
			side: side,
			price: price,
			quantity: BigInt(order.quantity),
			orderCount: 1,
			lastUpdated: timestamp,
		})
		.onConflictDoUpdate((row: any) => ({
			quantity: row.quantity + BigInt(order.quantity),
			orderCount: row.orderCount - 1,
			lastUpdated: timestamp,
		}));
}
