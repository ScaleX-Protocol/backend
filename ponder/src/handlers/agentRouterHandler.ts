import { updateIndexerStatus } from "@/utils/indexerStatus";
import { createLogger, LogLabel, log, LogLevel, ServiceName } from "../utils/logger";
import { eq } from "ponder";
import {
	agentInstallations,
	agentOrders,
	agentLendingEvents,
	agentStats,
	users,
} from "ponder:schema";

const logger = createLogger('agentRouterHandler.ts');

// Helper function to upsert agent stats
async function upsertAgentStats(
	db: any,
	chainId: number,
	owner: string,
	agentTokenId: bigint,
	timestamp: number,
	updates: any
) {
	const statsId = `${chainId}-${owner}-${agentTokenId}`;

	await db
		.insert(agentStats)
		.values({
			id: statsId,
			chainId,
			owner: owner as `0x${string}`,
			agentTokenId,
			firstActivityTimestamp: timestamp,
			lastActivityTimestamp: timestamp,
			isActive: true,
			...updates,
		})
		.onConflictDoUpdate((row: any) => ({
			lastActivityTimestamp: timestamp,
			...Object.keys(updates).reduce((acc: any, key: string) => {
				if (key.startsWith('total')) {
					acc[key] = row[key] + (updates[key] || 0);
				}
				return acc;
			}, {}),
		}));
}

// Helper function to upsert user activity
async function upsertUserActivity(db: any, chainId: number, user: string, timestamp: number) {
	const userId = `${chainId}-${user}`;
	await db
		.insert(users)
		.values({
			id: userId,
			chainId: chainId,
			address: user as `0x${string}`,
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

// =============================================================
//           POLICYFACTORY EVENT HANDLERS
// =============================================================

export async function handleAgentInstalled(event: any, context: any) {
	try {
		const { owner, agentTokenId, templateUsed, timestamp } = event.args;
		const chainId = context.network.chainId;
		const installationId = `${chainId}-${owner}-${agentTokenId}`;

		logger.info(
			`Agent installed - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Template: ${templateUsed}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentInstalled'
		);

		// Upsert user
		await upsertUserActivity(context.db, chainId, owner, Number(timestamp));

		// Insert agent installation record
		await context.db
			.insert(agentInstallations)
			.values({
				id: installationId,
				chainId,
				owner: owner as `0x${string}`,
				agentTokenId,
				templateUsed,
				enabled: true,
				installedAt: Number(timestamp),
				transactionId: event.transaction.hash,
				blockNumber: BigInt(event.block.number),
			})
			.onConflictDoUpdate(() => ({
				enabled: true,
				templateUsed,
			}));

		// Initialize agent stats
		await upsertAgentStats(context.db, chainId, owner, agentTokenId, Number(timestamp), {});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentInstalled"
		);
	} catch (error) {
		logger.error(
			`Failed to handle AgentInstalled event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentInstalled',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentUninstalled(event: any, context: any) {
	try {
		const { owner, agentTokenId, timestamp } = event.args;
		const chainId = context.network.chainId;
		const installationId = `${chainId}-${owner}-${agentTokenId}`;

		logger.info(
			`Agent uninstalled - Owner: ${owner}, AgentTokenId: ${agentTokenId}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentUninstalled'
		);

		// Update agent installation record
		await context.db
			.update(agentInstallations, { id: installationId })
			.set({
				enabled: false,
				uninstalledAt: Number(timestamp),
			});

		// Update agent stats
		await context.db
			.update(agentStats, { id: installationId })
			.set({
				isActive: false,
			});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentUninstalled"
		);
	} catch (error) {
		logger.error(
			`Failed to handle AgentUninstalled event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentUninstalled',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

// =============================================================
//           AGENTROUTER EVENT HANDLERS
// =============================================================

export async function handleAgentSwapExecuted(event: any, context: any) {
	try {
		const { owner, agentTokenId, executor, tokenIn, tokenOut, amountIn, amountOut, timestamp } = event.args;
		const chainId = context.network.chainId;
		const orderId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.info(
			`Agent market order - Owner: ${owner}, AgentTokenId: ${agentTokenId}, AmountIn: ${amountIn}, AmountOut: ${amountOut}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSwapExecuted'
		);

		// Upsert user
		await upsertUserActivity(context.db, chainId, owner, Number(timestamp));

		// Insert agent order record
		await context.db.insert(agentOrders).values({
			id: orderId,
			chainId,
			owner: owner as `0x${string}`,
			agentTokenId,
			executor: executor as `0x${string}`,
			orderId: null,
			orderType: "MARKET",
			side: null,
			tokenIn: tokenIn as `0x${string}`,
			tokenOut: tokenOut as `0x${string}`,
			amountIn,
			amountOut,
			limitPrice: null,
			timestamp: Number(timestamp),
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
			status: "FILLED",
		});

		// Update agent stats
		await upsertAgentStats(context.db, chainId, owner, agentTokenId, Number(timestamp), {
			totalMarketOrders: 1,
			totalTradingVolume: amountIn,
		});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentSwapExecuted"
		);
	} catch (error) {
		logger.error(
			`Failed to handle AgentSwapExecuted event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSwapExecuted',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentLimitOrderPlaced(event: any, context: any) {
	try {
		const { owner, agentTokenId, executor, orderId, tokenIn, tokenOut, amount, limitPrice, isBuy, timestamp } = event.args;
		const chainId = context.network.chainId;
		const orderDbId = `${chainId}-${orderId}`;

		logger.info(
			`Agent limit order - Owner: ${owner}, AgentTokenId: ${agentTokenId}, OrderId: ${orderId}, Amount: ${amount}, LimitPrice: ${limitPrice}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentLimitOrderPlaced'
		);

		// Upsert user
		await upsertUserActivity(context.db, chainId, owner, Number(timestamp));

		// Insert agent order record
		await context.db.insert(agentOrders).values({
			id: orderDbId,
			chainId,
			owner: owner as `0x${string}`,
			agentTokenId,
			executor: executor as `0x${string}`,
			orderId: orderId as `0x${string}`,
			orderType: "LIMIT",
			side: isBuy ? "BUY" : "SELL",
			tokenIn: tokenIn as `0x${string}`,
			tokenOut: tokenOut as `0x${string}`,
			amountIn: amount,
			amountOut: null,
			limitPrice,
			timestamp: Number(timestamp),
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
			status: "ACTIVE",
		});

		// Update agent stats
		await upsertAgentStats(context.db, chainId, owner, agentTokenId, Number(timestamp), {
			totalLimitOrders: 1,
		});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentLimitOrderPlaced"
		);
	} catch (error) {
		logger.error(
			`Failed to handle AgentLimitOrderPlaced event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentLimitOrderPlaced',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentOrderCancelled(event: any, context: any) {
	try {
		const { owner, agentTokenId, executor, orderId, timestamp } = event.args;
		const chainId = context.network.chainId;
		const orderDbId = `${chainId}-${orderId}`;

		logger.info(
			`Agent order cancelled - Owner: ${owner}, AgentTokenId: ${agentTokenId}, OrderId: ${orderId}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentOrderCancelled'
		);

		// Update agent order status
		await context.db
			.update(agentOrders, { id: orderDbId })
			.set({
				status: "CANCELLED",
			});

		// Update agent stats
		await upsertAgentStats(context.db, chainId, owner, agentTokenId, Number(timestamp), {
			totalOrdersCancelled: 1,
		});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentOrderCancelled"
		);
	} catch (error) {
		logger.error(
			`Failed to handle AgentOrderCancelled event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentOrderCancelled',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentBorrowExecuted(event: any, context: any) {
	try {
		const { owner, agentTokenId, executor, token, amount, newHealthFactor, timestamp } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.info(
			`Agent borrow - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Token: ${token}, Amount: ${amount}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentBorrowExecuted'
		);

		// Upsert user
		await upsertUserActivity(context.db, chainId, owner, Number(timestamp));

		// Insert lending event
		await context.db.insert(agentLendingEvents).values({
			id: eventId,
			chainId,
			owner: owner as `0x${string}`,
			agentTokenId,
			executor: executor as `0x${string}`,
			action: "BORROW",
			token: token as `0x${string}`,
			amount,
			newHealthFactor,
			timestamp: Number(timestamp),
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
		});

		// Update agent stats
		await upsertAgentStats(context.db, chainId, owner, agentTokenId, Number(timestamp), {
			totalBorrowAmount: amount,
		});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentBorrowExecuted"
		);
	} catch (error) {
		logger.error(
			`Failed to handle AgentBorrowExecuted event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentBorrowExecuted',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentRepayExecuted(event: any, context: any) {
	try {
		const { owner, agentTokenId, executor, token, amount, newHealthFactor, timestamp } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.info(
			`Agent repay - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Token: ${token}, Amount: ${amount}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentRepayExecuted'
		);

		// Upsert user
		await upsertUserActivity(context.db, chainId, owner, Number(timestamp));

		// Insert lending event
		await context.db.insert(agentLendingEvents).values({
			id: eventId,
			chainId,
			owner: owner as `0x${string}`,
			agentTokenId,
			executor: executor as `0x${string}`,
			action: "REPAY",
			token: token as `0x${string}`,
			amount,
			newHealthFactor,
			timestamp: Number(timestamp),
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
		});

		// Update agent stats
		await upsertAgentStats(context.db, chainId, owner, agentTokenId, Number(timestamp), {
			totalRepayAmount: amount,
		});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentRepayExecuted"
		);
	} catch (error) {
		logger.error(
			`Failed to handle AgentRepayExecuted event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentRepayExecuted',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentCollateralSupplied(event: any, context: any) {
	try {
		const { owner, agentTokenId, executor, token, amount, timestamp } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.info(
			`Agent collateral supplied - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Token: ${token}, Amount: ${amount}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentCollateralSupplied'
		);

		// Upsert user
		await upsertUserActivity(context.db, chainId, owner, Number(timestamp));

		// Insert lending event
		await context.db.insert(agentLendingEvents).values({
			id: eventId,
			chainId,
			owner: owner as `0x${string}`,
			agentTokenId,
			executor: executor as `0x${string}`,
			action: "SUPPLY",
			token: token as `0x${string}`,
			amount,
			newHealthFactor: null,
			timestamp: Number(timestamp),
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
		});

		// Update agent stats
		await upsertAgentStats(context.db, chainId, owner, agentTokenId, Number(timestamp), {
			totalCollateralSupplied: amount,
		});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentCollateralSupplied"
		);
	} catch (error) {
		logger.error(
			`Failed to handle AgentCollateralSupplied event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentCollateralSupplied',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentCollateralWithdrawn(event: any, context: any) {
	try {
		const { owner, agentTokenId, executor, token, amount, timestamp } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.info(
			`Agent collateral withdrawn - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Token: ${token}, Amount: ${amount}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentCollateralWithdrawn'
		);

		// Upsert user
		await upsertUserActivity(context.db, chainId, owner, Number(timestamp));

		// Insert lending event
		await context.db.insert(agentLendingEvents).values({
			id: eventId,
			chainId,
			owner: owner as `0x${string}`,
			agentTokenId,
			executor: executor as `0x${string}`,
			action: "WITHDRAW",
			token: token as `0x${string}`,
			amount,
			newHealthFactor: null,
			timestamp: Number(timestamp),
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
		});

		// Update agent stats
		await upsertAgentStats(context.db, chainId, owner, agentTokenId, Number(timestamp), {
			totalCollateralWithdrawn: amount,
		});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentCollateralWithdrawn"
		);
	} catch (error) {
		logger.error(
			`Failed to handle AgentCollateralWithdrawn event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentCollateralWithdrawn',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}
