import { updateIndexerStatus } from "@/utils/indexerStatus";
import { createLogger, LogLabel, log, LogLevel, ServiceName } from "../utils/logger";
import { eq } from "ponder";
import {
	agentInstallations,
	agentOrders,
	agentLendingEvents,
	agentPolicies,
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

// Helper: read policy from contract and upsert into agentPolicies table
async function upsertAgentPolicy(
	db: any,
	context: any,
	chainId: number,
	user: string,
	strategyAgentId: bigint,
	templateUsed: string,
	timestamp: number
) {
	const policyId = `${chainId}-${user}-${strategyAgentId}`;

	let policy: any = null;
	try {
		policy = await context.client.readContract({
			address: context.contracts.PolicyFactory.address,
			abi: context.contracts.PolicyFactory.abi,
			functionName: "getPolicy",
			args: [user as `0x${string}`, strategyAgentId],
		});
	} catch (err) {
		logger.error(
			`Failed to read policy from contract for ${user}/${strategyAgentId}`,
			LogLabel.EVENT_HANDLER,
			'upsertAgentPolicy',
			{ error: err instanceof Error ? err.message : String(err) }
		);
		return; // don't block the handler if read fails
	}

	const values = {
		id: policyId,
		chainId,
		owner: user as `0x${string}`,
		agentTokenId: strategyAgentId,
		templateUsed,
		enabled: policy.enabled,
		installedAt: BigInt(policy.installedAt),
		expiryTimestamp: BigInt(policy.expiryTimestamp),
		lastUpdatedAt: timestamp,
		maxOrderSize: BigInt(policy.maxOrderSize),
		minOrderSize: BigInt(policy.minOrderSize),
		whitelistedTokens: JSON.stringify(policy.whitelistedTokens),
		blacklistedTokens: JSON.stringify(policy.blacklistedTokens),
		allowMarketOrders: policy.allowMarketOrders,
		allowLimitOrders: policy.allowLimitOrders,
		allowSwap: policy.allowSwap,
		allowBorrow: policy.allowBorrow,
		allowRepay: policy.allowRepay,
		allowSupplyCollateral: policy.allowSupplyCollateral,
		allowWithdrawCollateral: policy.allowWithdrawCollateral,
		allowPlaceLimitOrder: policy.allowPlaceLimitOrder,
		allowCancelOrder: policy.allowCancelOrder,
		allowBuy: policy.allowBuy,
		allowSell: policy.allowSell,
		allowAutoBorrow: policy.allowAutoBorrow,
		maxAutoBorrowAmount: BigInt(policy.maxAutoBorrowAmount),
		allowAutoRepay: policy.allowAutoRepay,
		minDebtToRepay: BigInt(policy.minDebtToRepay),
		minHealthFactor: BigInt(policy.minHealthFactor),
		maxSlippageBps: BigInt(policy.maxSlippageBps),
		minTimeBetweenTrades: BigInt(policy.minTimeBetweenTrades),
		emergencyRecipient: policy.emergencyRecipient as `0x${string}`,
		dailyVolumeLimit: BigInt(policy.dailyVolumeLimit),
		weeklyVolumeLimit: BigInt(policy.weeklyVolumeLimit),
		maxDailyDrawdown: BigInt(policy.maxDailyDrawdown),
		maxWeeklyDrawdown: BigInt(policy.maxWeeklyDrawdown),
		maxTradeVsTVLBps: BigInt(policy.maxTradeVsTVLBps),
		minWinRateBps: BigInt(policy.minWinRateBps),
		minSharpeRatio: BigInt(policy.minSharpeRatio),
		maxPositionConcentrationBps: BigInt(policy.maxPositionConcentrationBps),
		maxCorrelationBps: BigInt(policy.maxCorrelationBps),
		maxTradesPerDay: BigInt(policy.maxTradesPerDay),
		maxTradesPerHour: BigInt(policy.maxTradesPerHour),
		tradingStartHour: BigInt(policy.tradingStartHour),
		tradingEndHour: BigInt(policy.tradingEndHour),
		minReputationScore: BigInt(policy.minReputationScore),
		useReputationMultiplier: policy.useReputationMultiplier,
		requiresChainlinkFunctions: policy.requiresChainlinkFunctions,
	};

	const existing = await db.find(agentPolicies, { id: policyId });
	if (existing) {
		const { id, chainId: _c, owner: _o, agentTokenId: _a, installedAt: _i, ...updateFields } = values;
		await db.update(agentPolicies, { id: policyId }).set(updateFields);
	} else {
		await db.insert(agentPolicies).values(values);
	}
}

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

		// Insert or update agent installation record (avoid onConflictDoUpdate to prevent insertBuffer PK conflicts in Ponder 0.9.14)
		const existingInstallation = await context.db.find(agentInstallations, { id: installationId });
		if (existingInstallation) {
			await context.db
				.update(agentInstallations, { id: installationId })
				.set({
					enabled: true,
					templateUsed,
				});
		} else {
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
				});
		}

		// Read full policy from contract and index it
		await upsertAgentPolicy(context.db, context, chainId, user, strategyAgentId, templateUsed, Number(timestamp));

		// Initialize agent stats
		await upsertAgentStats(context.db, chainId, user, strategyAgentId, Number(timestamp), {});

		// Update indexer status
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "PolicyInstalled" // perf
		// ); // perf
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

export async function handlePolicyUpdated({ event, context }: any) {
	try {
		const { user, strategyAgentId, timestamp } = event.args;
		const chainId = context.network.chainId;

		// Re-read the full policy from contract to get updated values
		const existing = await context.db.find(agentPolicies, { id: `${chainId}-${user}-${strategyAgentId}` });
		const templateUsed = existing?.templateUsed || "custom";
		await upsertAgentPolicy(context.db, context, chainId, user, strategyAgentId, templateUsed, Number(timestamp));

		// await updateIndexerStatus(context.db, chainId, BigInt(event.block.number), Number(event.block.timestamp), "PolicyUpdated"); // perf
	} catch (error) {
		logger.error(`Failed to handle PolicyUpdated event`, LogLabel.EVENT_HANDLER, 'handlePolicyUpdated', { error: error instanceof Error ? error.message : String(error) });
		throw error;
	}
}

export async function handlePolicyEnabled({ event, context }: any) {
	try {
		const { user, strategyAgentId, timestamp } = event.args;
		const chainId = context.network.chainId;
		const policyId = `${chainId}-${user}-${strategyAgentId}`;

		await context.db.update(agentPolicies, { id: policyId }).set({ enabled: true, lastUpdatedAt: Number(timestamp) });
		await context.db.update(agentInstallations, { id: policyId }).set({ enabled: true });

		// await updateIndexerStatus(context.db, chainId, BigInt(event.block.number), Number(event.block.timestamp), "PolicyEnabled"); // perf
	} catch (error) {
		logger.error(`Failed to handle PolicyEnabled event`, LogLabel.EVENT_HANDLER, 'handlePolicyEnabled', { error: error instanceof Error ? error.message : String(error) });
		throw error;
	}
}

export async function handlePolicyDisabled({ event, context }: any) {
	try {
		const { user, strategyAgentId, timestamp } = event.args;
		const chainId = context.network.chainId;
		const policyId = `${chainId}-${user}-${strategyAgentId}`;

		await context.db.update(agentPolicies, { id: policyId }).set({ enabled: false, lastUpdatedAt: Number(timestamp) });
		await context.db.update(agentInstallations, { id: policyId }).set({ enabled: false });

		// await updateIndexerStatus(context.db, chainId, BigInt(event.block.number), Number(event.block.timestamp), "PolicyDisabled"); // perf
	} catch (error) {
		logger.error(`Failed to handle PolicyDisabled event`, LogLabel.EVENT_HANDLER, 'handlePolicyDisabled', { error: error instanceof Error ? error.message : String(error) });
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "PolicyUninstalled" // perf
		// ); // perf
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "AgentSwapExecuted" // perf
		// ); // perf
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "AgentLimitOrderPlaced" // perf
		// ); // perf
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "AgentOrderCancelled" // perf
		// ); // perf
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "AgentBorrowExecuted" // perf
		// ); // perf
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "AgentRepayExecuted" // perf
		// ); // perf
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "AgentCollateralSupplied" // perf
		// ); // perf
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "AgentCollateralWithdrawn" // perf
		// ); // perf
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
//        AGENT SELF-FUNDED TRADING EVENTS (No Policy Constraints)
// =============================================================

export async function handleAgentSelfTradeExecuted({ event, context }: any) {
	try {
		const { strategyAgentId, agentWallet, orderBook, side, quantity, filled } = event.args;
		const chainId = context.network.chainId;
		const orderId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;
		const timestamp = Number(event.block.timestamp);

		logger.info(
			`Agent self market order - AgentWallet: ${agentWallet}, StrategyAgentId: ${strategyAgentId}, Quantity: ${quantity}, Filled: ${filled}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSelfTradeExecuted'
		);

		await context.db.insert(agentOrders).values({
			id: orderId,
			chainId,
			owner: agentWallet as `0x${string}`,
			agentTokenId: strategyAgentId,
			executor: agentWallet as `0x${string}`,
			orderId: null,
			orderType: "MARKET",
			side: side === 0 ? "BUY" : "SELL",
			tokenIn: null,
			tokenOut: null,
			amountIn: quantity,
			amountOut: filled,
			limitPrice: null,
			timestamp,
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
			status: "FILLED",
		});

		await upsertAgentStats(context.db, chainId, agentWallet, strategyAgentId, timestamp, {
			totalMarketOrders: 1,
			totalTradingVolume: quantity,
		});

		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// timestamp, // perf
			// "AgentSelfTradeExecuted" // perf
		// ); // perf
	} catch (error) {
		logger.error(
			`Failed to handle AgentSelfTradeExecuted event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSelfTradeExecuted',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentSelfLimitOrderPlaced({ event, context }: any) {
	try {
		const { strategyAgentId, agentWallet, orderBook, side, price, quantity, orderId } = event.args;
		const chainId = context.network.chainId;
		const orderDbId = `${chainId}-self-${orderId}`;
		const timestamp = Number(event.block.timestamp);

		logger.info(
			`Agent self limit order - AgentWallet: ${agentWallet}, StrategyAgentId: ${strategyAgentId}, OrderId: ${orderId}, Price: ${price}, Quantity: ${quantity}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSelfLimitOrderPlaced'
		);

		await context.db.insert(agentOrders).values({
			id: orderDbId,
			chainId,
			owner: agentWallet as `0x${string}`,
			agentTokenId: strategyAgentId,
			executor: agentWallet as `0x${string}`,
			orderId: orderId.toString(),
			orderType: "LIMIT",
			side: side === 0 ? "BUY" : "SELL",
			tokenIn: null,
			tokenOut: null,
			amountIn: quantity,
			amountOut: null,
			limitPrice: price,
			timestamp,
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
			status: "ACTIVE",
		});

		await upsertAgentStats(context.db, chainId, agentWallet, strategyAgentId, timestamp, {
			totalLimitOrders: 1,
		});

		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// timestamp, // perf
			// "AgentSelfLimitOrderPlaced" // perf
		// ); // perf
	} catch (error) {
		logger.error(
			`Failed to handle AgentSelfLimitOrderPlaced event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSelfLimitOrderPlaced',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentSelfOrderCancelled({ event, context }: any) {
	try {
		const { strategyAgentId, agentWallet, orderBook, orderId } = event.args;
		const chainId = context.network.chainId;
		const orderDbId = `${chainId}-self-${orderId}`;
		const timestamp = Number(event.block.timestamp);

		logger.info(
			`Agent self order cancelled - AgentWallet: ${agentWallet}, StrategyAgentId: ${strategyAgentId}, OrderId: ${orderId}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSelfOrderCancelled'
		);

		await context.db
			.update(agentOrders, { id: orderDbId })
			.set({ status: "CANCELLED" });

		await upsertAgentStats(context.db, chainId, agentWallet, strategyAgentId, timestamp, {
			totalOrdersCancelled: 1,
		});

		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// timestamp, // perf
			// "AgentSelfOrderCancelled" // perf
		// ); // perf
	} catch (error) {
		logger.error(
			`Failed to handle AgentSelfOrderCancelled event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSelfOrderCancelled',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentSelfBorrowExecuted({ event, context }: any) {
	try {
		const { strategyAgentId, agentWallet, token, amount } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;
		const timestamp = Number(event.block.timestamp);

		logger.info(
			`Agent self borrow - AgentWallet: ${agentWallet}, StrategyAgentId: ${strategyAgentId}, Token: ${token}, Amount: ${amount}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSelfBorrowExecuted'
		);

		await context.db.insert(agentLendingEvents).values({
			id: eventId,
			chainId,
			owner: agentWallet as `0x${string}`,
			agentTokenId: strategyAgentId,
			executor: agentWallet as `0x${string}`,
			action: "BORROW",
			token: token as `0x${string}`,
			amount,
			newHealthFactor: null,
			timestamp,
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
		});

		await upsertAgentStats(context.db, chainId, agentWallet, strategyAgentId, timestamp, {
			totalBorrowAmount: amount,
		});

		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// timestamp, // perf
			// "AgentSelfBorrowExecuted" // perf
		// ); // perf
	} catch (error) {
		logger.error(
			`Failed to handle AgentSelfBorrowExecuted event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSelfBorrowExecuted',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

export async function handleAgentSelfRepayExecuted({ event, context }: any) {
	try {
		const { strategyAgentId, agentWallet, token, amount } = event.args;
		const chainId = context.network.chainId;
		const eventId = `${chainId}-${event.transaction.hash}-${event.log.logIndex}`;
		const timestamp = Number(event.block.timestamp);

		logger.info(
			`Agent self repay - AgentWallet: ${agentWallet}, StrategyAgentId: ${strategyAgentId}, Token: ${token}, Amount: ${amount}`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSelfRepayExecuted'
		);

		await context.db.insert(agentLendingEvents).values({
			id: eventId,
			chainId,
			owner: agentWallet as `0x${string}`,
			agentTokenId: strategyAgentId,
			executor: agentWallet as `0x${string}`,
			action: "REPAY",
			token: token as `0x${string}`,
			amount,
			newHealthFactor: null,
			timestamp,
			transactionId: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
		});

		await upsertAgentStats(context.db, chainId, agentWallet, strategyAgentId, timestamp, {
			totalRepayAmount: amount,
		});

		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// timestamp, // perf
			// "AgentSelfRepayExecuted" // perf
		// ); // perf
	} catch (error) {
		logger.error(
			`Failed to handle AgentSelfRepayExecuted event`,
			LogLabel.EVENT_HANDLER,
			'handleAgentSelfRepayExecuted',
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "CircuitBreakerTriggered" // perf
		// ); // perf
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "PolicyViolation" // perf
		// ); // perf
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "StrategyAgentAuthorized" // perf
		// ); // perf
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
		// await updateIndexerStatus( // perf
			// context.db, // perf
			// chainId, // perf
			// BigInt(event.block.number), // perf
			// Number(event.block.timestamp), // perf
			// "StrategyAgentRevoked" // perf
		// ); // perf
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
