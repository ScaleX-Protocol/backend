import dotenv from "dotenv";
import { deposits, withdrawals, users, lendingEvents, currencies, lockEvents, unlockEvents } from "ponder:schema";
import { getAddress } from "viem";
import { createLogger, LogLabel } from "../utils/logger";
import { updateIndexerStatus } from "@/utils/indexerStatus";
import { eq, and } from "ponder";
import { getSyntheticUnderlyingToken } from "../utils/syntheticCurrencyCache";

dotenv.config();

// Create logger instance for this file
const logger = createLogger('balanceManagerHandler.ts');

async function upsertUserForDeposit(db: any, chainId: number, user: string, timestamp: number) {
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
			totalDeposits: 1,
			totalVolume: BigInt(0),
		})
		.onConflictDoUpdate((row: any) => ({
			lastSeenTimestamp: timestamp,
			totalDeposits: row.totalDeposits + 1,
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

async function recordLendingTransferEvents(
	db: any,
	chainId: number,
	sender: string,
	receiver: string,
	currency: string,
	amount: bigint,
	feeAmount: bigint,
	timestamp: number,
	txHash: string,
	blockNumber: bigint,
	logIndex: number,
	agentTokenId?: bigint,
	executor?: string
) {
	try {
		// Cache lookup — zero DB cost (populated by tokenRegistryHandler on registration)
		const underlyingToken = getSyntheticUnderlyingToken(chainId, currency);
		if (!underlyingToken) return;

		const netAmount = amount - feeAmount;

		// Insert both events in parallel
		const transferOutEventId = `${txHash}-transfer-out-${sender}-${logIndex}`;
		const transferInEventId = `${txHash}-transfer-in-${receiver}-${logIndex}`;
		await Promise.all([
			db.insert(lendingEvents).values({
				id: transferOutEventId,
				chainId,
				userAddress: sender,
				action: "TRANSFER_OUT",
				token: underlyingToken,
				amount: amount,
				timestamp,
				transactionId: txHash,
				blockNumber,
				agentTokenId: agentTokenId ?? BigInt(0),
				executor: executor ?? null,
			}).onConflictDoNothing(),
			db.insert(lendingEvents).values({
				id: transferInEventId,
				chainId,
				userAddress: receiver,
				action: "TRANSFER_IN",
				token: underlyingToken,
				amount: netAmount,
				timestamp,
				transactionId: txHash,
				blockNumber,
				agentTokenId: agentTokenId ?? BigInt(0),
				executor: executor ?? null,
			}).onConflictDoNothing(),
		]);

		logger.info(`Recorded lending transfer events: ${sender} -> ${receiver}`, LogLabel.EVENT_HANDLER, 'recordLendingTransferEvents', {
			sender,
			receiver,
			currency,
			underlyingToken,
			amount: amount.toString(),
			netAmount: netAmount.toString(),
			txHash
		});
	} catch (error) {
		logger.error('Failed to record lending transfer events', LogLabel.EVENT_HANDLER, 'recordLendingTransferEvents', {
			error: error instanceof Error ? error.message : String(error),
			sender,
			receiver,
			currency,
			amount: amount.toString()
		});
	}
}

function fromId(id: number): string {
	return `0x${id.toString(16).padStart(40, "0")}`;
}

export async function handleDeposit({ event, context }: any) {
	await updateIndexerStatus(context, 'BalanceManager:Deposit', event);
	const { db } = context;
	const chainId = context.network.chainId;
	const userAddress = event.args.user;
	const currency = getAddress(fromId(event.args.id));
	const timestamp = Number(event.block.timestamp);

	// Record deposit event (append-only)
	const depositId = `${event.transaction.hash}-${event.args.id}`;
	await db.insert(deposits).values({
		id: depositId,
		chainId: chainId,
		userAddress: userAddress,
		currency: currency,
		amount: BigInt(event.args.amount),
		timestamp: timestamp,
		transactionId: event.transaction.hash,
		blockNumber: BigInt(event.block.number),
		// ERC-8004 Agent tracking
		agentTokenId: event.args.agentTokenId ?? BigInt(0),
		executor: event.args.executor ?? null,
	});

	// Track user
	await upsertUserForDeposit(db, chainId, userAddress, timestamp);
}

export async function handleWithdrawal({ event, context }: any) {
	await updateIndexerStatus(context, 'BalanceManager:Withdrawal', event);
	const { db } = context;
	const chainId = context.network.chainId;
	const userAddress = event.args.user;
	const currency = getAddress(fromId(event.args.id));
	const timestamp = Number(event.block.timestamp);

	// Record withdrawal event (append-only)
	const withdrawalId = `${event.transaction.hash}-${event.args.id}`;
	await db.insert(withdrawals).values({
		id: withdrawalId,
		chainId: chainId,
		userAddress: userAddress,
		currency: currency,
		amount: BigInt(event.args.amount),
		timestamp: timestamp,
		transactionId: event.transaction.hash,
		blockNumber: BigInt(event.block.number),
		// ERC-8004 Agent tracking
		agentTokenId: event.args.agentTokenId ?? BigInt(0),
		executor: event.args.executor ?? null,
	});

	// Track user activity
	await upsertUserActivity(db, chainId, userAddress, timestamp);
}

export async function handleTransferFrom({ event, context }: any) {
	await updateIndexerStatus(context, 'BalanceManager:TransferFrom', event);
	const { db } = context;
	const chainId = context.network.chainId;
	const currency = getAddress(fromId(event.args.id));
	const timestamp = Number(event.block.timestamp);

	// Record lending transfer events for synthetic tokens
	await recordLendingTransferEvents(
		db,
		chainId,
		event.args.sender,
		event.args.receiver,
		currency,
		BigInt(event.args.amount),
		BigInt(event.args.feeAmount),
		timestamp,
		event.transaction.hash,
		BigInt(event.block.number),
		Number(event.log.logIndex),
		event.args.agentTokenId,
		event.args.executor
	);

	// Track user activity for sender, receiver, and operator
	await upsertUserActivity(db, chainId, event.args.sender, timestamp);
	await upsertUserActivity(db, chainId, event.args.receiver, timestamp);
	await upsertUserActivity(db, chainId, event.args.operator, timestamp);
}

export async function handleTransferLockedFrom({ event, context }: any) {
	await updateIndexerStatus(context, 'BalanceManager:TransferLockedFrom', event);
	const { db } = context;
	const chainId = context.network.chainId;
	const currency = getAddress(fromId(event.args.id));
	const timestamp = Number(event.block.timestamp);

	// Record lending transfer events for synthetic tokens
	await recordLendingTransferEvents(
		db,
		chainId,
		event.args.sender,
		event.args.receiver,
		currency,
		BigInt(event.args.amount),
		BigInt(event.args.feeAmount),
		timestamp,
		event.transaction.hash,
		BigInt(event.block.number),
		Number(event.log.logIndex),
		event.args.agentTokenId,
		event.args.executor
	);

	// Track user activity for sender, receiver, and operator
	await upsertUserActivity(db, chainId, event.args.sender, timestamp);
	await upsertUserActivity(db, chainId, event.args.receiver, timestamp);
	await upsertUserActivity(db, chainId, event.args.operator, timestamp);
}

export async function handleLock({ event, context }: any) {
	await updateIndexerStatus(context, 'BalanceManager:Lock', event);
	const { db } = context;
	const chainId = context.network.chainId;
	const userAddress = event.args.user;
	const currency = getAddress(fromId(event.args.id));
	const timestamp = Number(event.block.timestamp);

	// Record lock event (append-only)
	const lockEventId = `${event.transaction.hash}-${event.args.id}`;
	await db.insert(lockEvents).values({
		id: lockEventId,
		chainId: chainId,
		userAddress: userAddress,
		currency: currency,
		amount: BigInt(event.args.amount),
		timestamp: timestamp,
		transactionId: event.transaction.hash,
		blockNumber: BigInt(event.block.number),
		// ERC-8004 Agent tracking
		agentTokenId: event.args.agentTokenId ?? BigInt(0),
		executor: event.args.executor ?? null,
	});

	// Track user activity
	await upsertUserActivity(db, chainId, userAddress, timestamp);
}

export async function handleUnlock({ event, context }: any) {
	await updateIndexerStatus(context, 'BalanceManager:Unlock', event);
	const { db } = context;
	const chainId = context.network.chainId;
	const userAddress = event.args.user;
	const currency = getAddress(fromId(event.args.id));
	const timestamp = Number(event.block.timestamp);

	// Record unlock event (append-only)
	const unlockEventId = `${event.transaction.hash}-${event.args.id}`;
	await db.insert(unlockEvents).values({
		id: unlockEventId,
		chainId: chainId,
		userAddress: userAddress,
		currency: currency,
		amount: BigInt(event.args.amount),
		timestamp: timestamp,
		transactionId: event.transaction.hash,
		blockNumber: BigInt(event.block.number),
		// ERC-8004 Agent tracking
		agentTokenId: event.args.agentTokenId ?? BigInt(0),
		executor: event.args.executor ?? null,
	});

	// Track user activity
	await upsertUserActivity(db, chainId, userAddress, timestamp);
}
