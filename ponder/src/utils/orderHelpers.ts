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
import { createLogger, LogLabel } from "./logger";
import { eq, and, or } from "ponder";

// Create logger instance for this file
const logger = createLogger('orderHelpers.ts');

/**
 * Find an active order by its on-chain order ID.
 * Since on-chain order IDs can be reused after cancellation/expiry,
 * we query by natural keys and filter for active status.
 */
export async function findActiveOrder(
	db: any,
	chainId: number,
	poolId: string,
	onChainOrderId: bigint
): Promise<any | null> {
	try {
		// Query orders matching chainId, poolId, orderId and active status
		// Note: poolId comparison is case-sensitive at DB level, normalized to lowercase
		const activeOrders = await db
			.select()
			.from(orders)
			.where(
				and(
					eq(orders.chainId, chainId),
					eq(orders.poolId, poolId.toLowerCase()),
					eq(orders.orderId, onChainOrderId),
					or(
						eq(orders.status, "PENDING"),
						eq(orders.status, "OPEN"),
						eq(orders.status, "PARTIALLY_FILLED")
					)
				)
			);

		if (activeOrders && activeOrders.length > 0) {
			logger.info('Found active order', LogLabel.DATABASE, 'findActiveOrder', {
				chainId,
				poolId,
				onChainOrderId: onChainOrderId.toString(),
				hashedId: activeOrders[0].id,
				status: activeOrders[0].status
			});
			return activeOrders[0];
		}

		logger.debug('No active order found', LogLabel.DATABASE, 'findActiveOrder', {
			chainId,
			poolId,
			onChainOrderId: onChainOrderId.toString()
		});
		return null;
	} catch (error) {
		logger.error('Failed to find active order', LogLabel.DATABASE, 'findActiveOrder', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			chainId,
			poolId,
			onChainOrderId: onChainOrderId.toString()
		});
		return null;
	}
}

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

export function getTimeInForce(timeInForce: number): string {
	switch (timeInForce) {
		case 0:
			return "GTC";
		case 1:
			return "IOC";
		case 2:
			return "FOK";
		case 3:
			return "PO";
		default:
			return "GTC";
	}
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
	{ side, timestamp, executionPrice, executedQuantity }: Partial<OrderMatchedEventArgs>
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
	const existingPool = await db.find(pools, {
		id: poolId
	});

	if (!existingPool) {
		logger.warn('Pool not found for volume update', LogLabel.VALIDATION, 'updatePoolVolume', {
			poolId,
			quantity: quantity.toString(),
			price: price.toString(),
			timestamp
		});
		return false;
	}

	await db.update(pools, { id: poolId }).set((row: any) => {
		const baseDecimals = BigInt(row.baseDecimals);
		const quoteVolume = (quantity * price) / BigInt(10) ** BigInt(baseDecimals);
		return {
			price,
			volume: BigInt(row.volume) + quantity,
			volumeInQuote: BigInt(row.volumeInQuote) + quoteVolume,
			timestamp,
		};
	});
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

	if (!pool) {
		logger.warn('Pool not found for candlestick update', LogLabel.VALIDATION, 'updateCandlestickBuckets', {
			poolId,
			quantity: quantity.toString(),
			price: price.toString(),
			timestamp: Number(event.block.timestamp)
		});
		return false;
	}

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
	timestamp: number,
	txHash: string,
) {
	const orderData = {
		id: createOrderId(chainId, args.orderId, poolId, txHash),
		chainId,
		userAddress: args.user,
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
		autoRepay: args.autoRepay ?? false,
		autoBorrow: args.autoBorrow ?? false,
		timeInForce: getTimeInForce(args.timeInForce),
		quoteQuantity: args.price * args.quantity,
		executedQuoteQuantity: BigInt(0),
		transactionId: txHash,
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

export async function updateOrder(
	db: any,
	chainId: number,
	hashedOrderId: string,
	event: any,
	timestamp: number
) {
	// First check if the order exists
	const existingOrder = await db.find(orders, {
		id: hashedOrderId,
		chainId: chainId,
	});

	if (!existingOrder) {
		logger.warn('Order not found for update', LogLabel.VALIDATION, 'updateOrder', {
			hashedOrderId,
			chainId,
			orderId: event.args.orderId,
			status: event.args.status
		});
		return false;
	}

	try {
		const updateData: any = {
			status: ORDER_STATUS[Number(event.args.status)],
			timestamp: timestamp,
		};

		// For market orders, also update filled quantity and executed quote quantity
		if (existingOrder.type === 'Market') {
			updateData.filled = BigInt(event.args.filled);

			// Calculate executed quote quantity for market orders
			if (existingOrder.price && BigInt(event.args.filled) > BigInt(0)) {
				updateData.executedQuoteQuantity = existingOrder.price * BigInt(event.args.filled);
			} else if (BigInt(event.args.filled) === BigInt(0)) {
				updateData.executedQuoteQuantity = BigInt(0);
			}
		}

		// CRITICAL FIX: Check if order is 100% filled regardless of event status
		// This handles IOC orders that get partially filled then cancelled
		const filledAmount = existingOrder.type === 'Market' ? BigInt(event.args.filled) : BigInt(existingOrder.filled);
		const orderQuantity = BigInt(existingOrder.quantity);

		if (filledAmount >= orderQuantity && orderQuantity > 0) {
			updateData.status = "FILLED";
			logger.info('Order is 100% filled, overriding event status to FILLED', LogLabel.DATABASE, 'updateOrder', {
				hashedOrderId,
				filled: filledAmount.toString(),
				quantity: orderQuantity.toString(),
				eventStatus: ORDER_STATUS[Number(event.args.status)],
				correctedStatus: 'FILLED'
			});
		}

		await db
			.update(orders, {
				id: hashedOrderId,
				chainId: chainId,
			})
			.set(updateData);
		return true; // Indicate successful update
	} catch (error) {
		logger.error('Failed to update order status', LogLabel.DATABASE, 'updateOrder', {
			error: error instanceof Error ? error.message : String(error),
			hashedOrderId,
			chainId,
			orderId: event.args.orderId,
			status: event.args.status
		});
		return false;
	}
}

export async function updateOrderQuantity(
	db: any,
	chainId: number,
	hashedOrderId: string,
	filledQuantity: bigint,
	executionPrice?: bigint
) {
	// First check if the order exists
	const existingOrder = await db.find(orders, {
		id: hashedOrderId,
		chainId: chainId,
	});

	if (!existingOrder) {
		logger.warn('Order not found for quantity update', LogLabel.VALIDATION, 'updateOrderQuantity', {
			hashedOrderId,
			chainId,
			filledQuantity: filledQuantity.toString()
		});
		return false;
	}

	try {
		const oldQuantity = BigInt(existingOrder.quantity);
		const oldPrice = BigInt(existingOrder.price);
		const newFilledQuantity = existingOrder.filled + filledQuantity;

		const updateData: any = {
			filled: newFilledQuantity,
		};

		// Check if both old quantity and filled quantity are zero, or both old price and execution price are zero
		if ((oldQuantity === BigInt(0) && newFilledQuantity === BigInt(0)) ||
			(oldPrice === BigInt(0) && (!executionPrice || executionPrice === BigInt(0)))) {
			updateData.status = "EXPIRED";
			logger.info('Order has no quantity or price, updating status to EXPIRED', LogLabel.DATABASE, 'updateOrderQuantity', {
				hashedOrderId,
				oldQuantity: oldQuantity.toString(),
				newFilledQuantity: newFilledQuantity.toString(),
				oldPrice: oldPrice.toString(),
				executionPrice: executionPrice?.toString() || 'undefined'
			});
		}

		// Update price for market orders with actual execution price
		if (existingOrder.type === 'Market' && executionPrice) {
			const executedQuoteValue = executionPrice * filledQuantity;
			const totalQuoteValue = BigInt(existingOrder.executedQuoteQuantity || 0) + executedQuoteValue;
			const weightedAveragePrice = newFilledQuantity > BigInt(0) ? totalQuoteValue / newFilledQuantity : BigInt(0);

			updateData.price = weightedAveragePrice;
			updateData.orderValue = weightedAveragePrice * oldQuantity;
			updateData.executedQuoteQuantity = totalQuoteValue;
		} else {
			// For limit orders, also update executed quote quantity
			if (executionPrice) {
				const executedQuoteValue = executionPrice * filledQuantity;
				updateData.executedQuoteQuantity = (existingOrder.executedQuoteQuantity || BigInt(0)) + executedQuoteValue;
			}
		}

		// Auto-update status based on filled quantity
		if (newFilledQuantity >= oldQuantity) {
			updateData.status = "FILLED";
			logger.info('Order fully filled, updating status to FILLED', LogLabel.DATABASE, 'updateOrderQuantity', {
				hashedOrderId,
				filled: newFilledQuantity.toString(),
				quantity: oldQuantity.toString()
			});
		} else if (newFilledQuantity > BigInt(0) && !updateData.status) {
			updateData.status = "PARTIALLY_FILLED";
			logger.debug('Order partially filled, updating status to PARTIALLY_FILLED', LogLabel.DATABASE, 'updateOrderQuantity', {
				hashedOrderId,
				filled: newFilledQuantity.toString(),
				quantity: oldQuantity.toString()
			});
		}

		await db
			.update(orders, {
				id: hashedOrderId,
				chainId: chainId,
			})
			.set(updateData);
		return true; // Indicate successful update
	} catch (error) {
		logger.error('Failed to update order quantity', LogLabel.DATABASE, 'updateOrderQuantity', {
			error: error instanceof Error ? error.message : String(error),
			hashedOrderId,
			chainId,
			filledQuantity: filledQuantity.toString()
		});
		return false;
	}
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
	// FIX: order.side is already a string ("Buy" or "Sell"), use it directly
	const side = order.side;
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
			// FIX: SUBTRACT quantity when order is cancelled, not ADD
			quantity: row.quantity - BigInt(order.quantity),
			orderCount: row.orderCount - 1,
			lastUpdated: timestamp,
		}));
}
