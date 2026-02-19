import { updateIndexerStatus } from "@/utils/indexerStatus";
import { createLogger, LogLabel, log, LogLevel, ServiceName } from "../utils/logger";
import { eq } from "ponder";
import {
	agentInstallations,
	agentOrders,
	agentLendingEvents,
	agentStats,
	agentCircuitBreakers,
	agentPolicyViolations,
} from "ponder:schema";

const logger = createLogger('agentRouterHandler.ts');

// Helper function to upsert agent stats
async function upsertAgentStats(
	db: any,
	chainId: number,
	user: string,
	agentTokenId: bigint,
	timestamp: number,
	updates: any
) {
	const statsId = `${chainId}-${user}-${agentTokenId}`;

	await db
		.insert(agentStats)
		.values({
			id: statsId,
			chainId,
			owner: user as `0x${string}`,
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

// =============================================================
//           POLICYFACTORY EVENT HANDLERS
// =============================================================

export async function handlePolicyInstalled({ event, context }: any) {
	try {
		const { user, strategyAgentId, templateUsed, timestamp } = event.args;
		const chainId = context.network.chainId;
		const installationId = `${chainId}-${user}-${strategyAgentId}`;

		logger.info(
			`Policy installed - User: ${user}, StrategyAgentId: ${strategyAgentId}, Template: ${templateUsed}`,
			LogLabel.EVENT_HANDLER,
			'handlePolicyInstalled'
		);


		// Insert agent installation record
		await context.db
			.insert(agentInstallations)
			.values({
				id: installationId,
				chainId,
				owner: user as `0x${string}`,
				agentTokenId: strategyAgentId,
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
		await upsertAgentStats(context.db, chainId, user, strategyAgentId, Number(timestamp), {});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"PolicyInstalled"
		);
	} catch (error) {
		logger.error(
			`Failed to handle PolicyInstalled event`,
			LogLabel.EVENT_HANDLER,
			'handlePolicyInstalled',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handlePolicyUninstalled({ event, context }: any) {
	try {
		const { user, strategyAgentId, timestamp } = event.args;
		const chainId = context.network.chainId;
		const installationId = `${chainId}-${user}-${strategyAgentId}`;

		logger.info(
			`Policy uninstalled - User: ${user}, StrategyAgentId: ${strategyAgentId}`,
			LogLabel.EVENT_HANDLER,
			'handlePolicyUninstalled'
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
			"PolicyUninstalled"
		);
	} catch (error) {
		logger.error(
			`Failed to handle PolicyUninstalled event`,
			LogLabel.EVENT_HANDLER,
			'handlePolicyUninstalled',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

// =============================================================
//           AGENTROUTER EVENT HANDLERS
// =============================================================

export async function handleAgentSwapExecuted({ event, context }: any) {
	try {
		const { owner, agentTokenId, executor, tokenIn, tokenOut, amountIn, amountOut, timestamp } = event.args;
		const chainId = context.network.chainId;
		const orderId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.info(
			`Agent market order - Owner: ${owner}, AgentTokenId: ${agentTokenId}, AmountIn: ${amountIn}, AmountOut: ${amountOut}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSwapExecuted'
		);


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

export async function handleAgentLimitOrderPlaced({ event, context }: any) {
	try {
		const { owner, agentTokenId, executor, orderId, tokenIn, tokenOut, amount, limitPrice, isBuy, timestamp } = event.args;
		const chainId = context.network.chainId;
		const orderDbId = `${chainId}-${orderId}`;

		logger.info(
			`Agent limit order - Owner: ${owner}, AgentTokenId: ${agentTokenId}, OrderId: ${orderId}, Amount: ${amount}, LimitPrice: ${limitPrice}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentLimitOrderPlaced'
		);


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

export async function handleAgentOrderCancelled({ event, context }: any) {
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

export async function handleAgentBorrowExecuted({ event, context }: any) {
	try {
		const { owner, agentTokenId, executor, token, amount, newHealthFactor, timestamp } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.info(
			`Agent borrow - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Token: ${token}, Amount: ${amount}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentBorrowExecuted'
		);


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

export async function handleAgentRepayExecuted({ event, context }: any) {
	try {
		const { owner, agentTokenId, executor, token, amount, newHealthFactor, timestamp } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.info(
			`Agent repay - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Token: ${token}, Amount: ${amount}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentRepayExecuted'
		);


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

export async function handleAgentCollateralSupplied({ event, context }: any) {
	try {
		const { owner, agentTokenId, executor, token, amount, timestamp } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.info(
			`Agent collateral supplied - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Token: ${token}, Amount: ${amount}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentCollateralSupplied'
		);


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

export async function handleAgentCollateralWithdrawn({ event, context }: any) {
	try {
		const { owner, agentTokenId, executor, token, amount, timestamp } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.info(
			`Agent collateral withdrawn - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Token: ${token}, Amount: ${amount}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentCollateralWithdrawn'
		);


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

// =============================================================
//           AGENT MONITORING EVENTS
// =============================================================

export async function handleCircuitBreakerTriggered({ event, context }: any) {
	try {
		const { owner, agentTokenId, drawdownBps, currentValue, dayStartValue, timestamp } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.warn(
			`Circuit breaker triggered - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Drawdown: ${drawdownBps} bps`,
			LogLabel.EVENT_HANDLER,
			'handleCircuitBreakerTriggered'
		);


		// Insert circuit breaker event
		await context.db.insert(agentCircuitBreakers).values({
			id: eventId,
			chainId,
			owner: owner as `0x${string}`,
			agentTokenId,
			drawdownBps,
			currentValue,
			dayStartValue,
			timestamp: Number(timestamp),
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
		});

		// Update agent stats to mark as potentially at risk
		const statsId = `${chainId}-${owner}-${agentTokenId}`;
		await context.db
			.update(agentStats, { id: statsId })
			.set({
				lastActivityTimestamp: Number(timestamp),
			});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"CircuitBreakerTriggered"
		);
	} catch (error) {
		logger.error(
			`Failed to handle CircuitBreakerTriggered event`,
			LogLabel.EVENT_HANDLER,
			'handleCircuitBreakerTriggered',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handlePolicyViolation({ event, context }: any) {
	try {
		const { owner, agentTokenId, reason, timestamp } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;

		logger.warn(
			`Policy violation - Owner: ${owner}, AgentTokenId: ${agentTokenId}, Reason: ${reason}`,
			LogLabel.EVENT_HANDLER,
			'handlePolicyViolation'
		);


		// Insert policy violation event
		await context.db.insert(agentPolicyViolations).values({
			id: eventId,
			chainId,
			owner: owner as `0x${string}`,
			agentTokenId,
			reason,
			timestamp: Number(timestamp),
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
		});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"PolicyViolation"
		);
	} catch (error) {
		logger.error(
			`Failed to handle PolicyViolation event`,
			LogLabel.EVENT_HANDLER,
			'handlePolicyViolation',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

// =============================================================
//           AGENTROUTER AUTHORIZATION EVENTS
// =============================================================

export async function handleStrategyAgentAuthorized({ event, context }: any) {
	try {
		const { user, strategyAgentId, timestamp } = event.args;
		const chainId = context.network.chainId;
		const installationId = `${chainId}-${user}-${strategyAgentId}`;

		logger.info(
			`Strategy agent authorized - User: ${user}, StrategyAgentId: ${strategyAgentId}`,
			LogLabel.EVENT_HANDLER,
			'handleStrategyAgentAuthorized'
		);


		// Mark agent installation as authorized (PolicyInstalled always fires first and creates the record)
		await context.db
			.update(agentInstallations, { id: installationId })
			.set({
				enabled: true,
			});

		// Update indexer status
		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"StrategyAgentAuthorized"
		);
	} catch (error) {
		logger.error(
			`Failed to handle StrategyAgentAuthorized event`,
			LogLabel.EVENT_HANDLER,
			'handleStrategyAgentAuthorized',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleStrategyAgentRevoked({ event, context }: any) {
	try {
		const { user, strategyAgentId, timestamp } = event.args;
		const chainId = context.network.chainId;
		const installationId = `${chainId}-${user}-${strategyAgentId}`;

		logger.info(
			`Strategy agent revoked - User: ${user}, StrategyAgentId: ${strategyAgentId}`,
			LogLabel.EVENT_HANDLER,
			'handleStrategyAgentRevoked'
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
			"StrategyAgentRevoked"
		);
	} catch (error) {
		logger.error(
			`Failed to handle StrategyAgentRevoked event`,
			LogLabel.EVENT_HANDLER,
			'handleStrategyAgentRevoked',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}
