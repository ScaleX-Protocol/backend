import dotenv from "dotenv";
import { balances, deposits, withdrawals, users } from "ponder:schema";
import { createBalanceId } from "@/utils";
import { getAddress } from "viem";
import { executeIfInSync } from "../utils/syncState";
import { getEventPublisher } from "@/events/index";

dotenv.config();

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

async function fetchAndPushBalance(context: any, balanceId: string, timestamp: number, blockNumber: number) {
	await executeIfInSync(blockNumber, async () => {
		const balance = await context.db.find(balances, { id: balanceId });
		if (balance) {
			// Publish balance update event
			try {
				const eventPublisher = getEventPublisher();
				await eventPublisher.publishBalanceUpdate({
					userId: balance.user,
					token: balance.currency,
					available: (balance.amount - balance.lockedAmount).toString(),
					locked: balance.lockedAmount.toString(),
					timestamp: timestamp.toString()
				});
			} catch (error) {
				console.error('Failed to publish balance update event:', error);
			}

		}
	}, 'fetchAndPushBalance');
}

function fromId(id: number): string {
	return `0x${id.toString(16).padStart(40, "0")}`;
}

export async function handleDeposit({ event, context }: any) {
	const { db } = context;
	const chainId = context.network.chainId;
	const user = event.args.user;
	const currency = getAddress(fromId(event.args.id));
	const balanceId = createBalanceId(chainId, currency, user);
	const timestamp = Number(event.block.timestamp);

	// Update balances table
	await db
		.insert(balances)
		.values({
			id: balanceId,
			user: user,
			chainId: chainId,
			currency: currency,
			amount: BigInt(event.args.amount),
			lockedAmount: BigInt(0),
		})
		.onConflictDoUpdate((row: any) => ({
			amount: row.amount + BigInt(event.args.amount),
		}));

	// Record deposit event for analytics
	const depositId = `${event.transaction.hash}-${event.args.id}`;
	await db.insert(deposits).values({
		id: depositId,
		chainId: chainId,
		user: user,
		currency: currency,
		amount: BigInt(event.args.amount),
		timestamp: timestamp,
		transactionId: event.transaction.hash,
		blockNumber: BigInt(event.block.number),
	}).onConflictDoUpdate({
		id: depositId,
		chainId: chainId,
		user: user,
		currency: currency,
		amount: BigInt(event.args.amount),
		timestamp: timestamp,
		transactionId: event.transaction.hash,
		blockNumber: BigInt(event.block.number),
	});

	// Track user
	await upsertUserForDeposit(db, chainId, user, timestamp);

	await fetchAndPushBalance(context, balanceId, Number(event.block?.timestamp ?? Date.now()), Number(event.block.number));
}

export async function handleWithdrawal({ event, context }: any) {
	const { db } = context;
	const chainId = context.network.chainId;
	const user = event.args.user;
	const currency = getAddress(fromId(event.args.id));
	const balanceId = createBalanceId(chainId, currency, user);
	const timestamp = Number(event.block.timestamp);

	// Update balances table
	await db.update(balances, { id: balanceId }).set((row: any) => ({
		amount: row.amount - BigInt(event.args.amount),
	}));

	// Record withdrawal event for analytics
	const withdrawalId = `${event.transaction.hash}-${event.args.id}`;
	await db.insert(withdrawals).values({
		id: withdrawalId,
		chainId: chainId,
		user: user,
		currency: currency,
		amount: BigInt(event.args.amount),
		timestamp: timestamp,
		transactionId: event.transaction.hash,
		blockNumber: BigInt(event.block.number),
	}).onConflictDoUpdate({
		id: withdrawalId,
		chainId: chainId,
		user: user,
		currency: currency,
		amount: BigInt(event.args.amount),
		timestamp: timestamp,
		transactionId: event.transaction.hash,
		blockNumber: BigInt(event.block.number),
	});

	// Track user activity
	await upsertUserActivity(db, chainId, user, timestamp);

	await fetchAndPushBalance(context, balanceId, Number(event.block?.timestamp ?? Date.now()), Number(event.block.number));
}

export async function handleTransferFrom({ event, context }: any) {
	const { db } = context;
	const chainId = context.network.chainId;
	const netAmount = BigInt(event.args.amount) - BigInt(event.args.feeAmount);
	const currency = getAddress(fromId(event.args.id));
	const timestamp = Number(event.block.timestamp);

	// Update or insert sender balance
	const senderId = createBalanceId(chainId, currency, event.args.sender);
	await context.db.update(balances, { id: senderId }).set((row: any) => ({
		amount: row.amount - event.args.amount,
		user: event.args.sender,
		chainId: chainId,
	}));

	// Track sender user activity
	await upsertUserActivity(db, chainId, event.args.sender, timestamp);

	await fetchAndPushBalance(context, senderId, Number(event.block?.timestamp ?? Date.now()), Number(event.block.number));

	// Update or insert receiver balance
	const receiverId = createBalanceId(chainId, currency, event.args.receiver);

	await context.db
		.insert(balances)
		.values({
			id: receiverId,
			user: event.args.receiver,
			chainId: chainId,
			amount: netAmount,
			lockedAmount: BigInt(0),
			currency: currency,
		})
		.onConflictDoUpdate((row: any) => ({
			amount: row.amount + netAmount,
		}));

	// Track receiver user activity
	await upsertUserActivity(db, chainId, event.args.receiver, timestamp);

	await fetchAndPushBalance(context, receiverId, Number(event.block?.timestamp ?? Date.now()), Number(event.block.number));

	// // Update or insert operator balance
	const operatorId = createBalanceId(chainId, currency, event.args.operator);
	await context.db
		.insert(balances)
		.values({
			id: operatorId,
			user: event.args.operator,
			chainId: chainId,
			amount: BigInt(event.args.feeAmount),
			lockedAmount: BigInt(0),
			currency: currency,
		})
		.onConflictDoUpdate((row: any) => ({
			amount: row.amount + BigInt(event.args.feeAmount),
		}));

	// Track operator user activity
	await upsertUserActivity(db, chainId, event.args.operator, timestamp);

	await fetchAndPushBalance(context, operatorId, Number(event.block?.timestamp ?? Date.now()), Number(event.block.number));
}

export async function handleTransferLockedFrom({ event, context }: any) {
	const { db } = context;
	const chainId = context.network.chainId;
	const netAmount = BigInt(event.args.amount) - BigInt(event.args.feeAmount);
	const currency = getAddress(fromId(event.args.id));
	const timestamp = Number(event.block.timestamp);

	// Update sender locked balance
	const senderId = createBalanceId(chainId, currency, event.args.sender);
	await context.db.update(balances, { id: senderId }).set((row: any) => ({
		lockedAmount: row.lockedAmount - event.args.amount,
		user: event.args.sender,
		chainId: chainId,
	}));

	// Track sender user activity
	await upsertUserActivity(db, chainId, event.args.sender, timestamp);

	await fetchAndPushBalance(context, senderId, Number(event.block?.timestamp ?? Date.now()), Number(event.block.number));

	// Update or insert receiver balance (unlocked)
	const receiverId = createBalanceId(chainId, currency, event.args.receiver);
	await context.db
		.insert(balances)
		.values({
			id: receiverId,
			user: event.args.receiver,
			chainId: chainId,
			amount: netAmount,
			lockedAmount: BigInt(0),
			currency: currency,
		})
		.onConflictDoUpdate((row: any) => ({
			amount: row.amount + netAmount,
		}));

	// Track receiver user activity
	await upsertUserActivity(db, chainId, event.args.receiver, timestamp);

	await fetchAndPushBalance(context, receiverId, Number(event.block?.timestamp ?? Date.now()), Number(event.block.number));

	// Update or insert operator balance (unlocked)
	const operatorId = createBalanceId(chainId, currency, event.args.operator);
	await context.db
		.insert(balances)
		.values({
			id: operatorId,
			user: event.args.operator,
			chainId: chainId,
			amount: BigInt(event.args.feeAmount),
			lockedAmount: BigInt(0),
			currency: currency,
		})
		.onConflictDoUpdate((row: any) => ({
			amount: row.amount + BigInt(event.args.feeAmount),
		}));

	// Track operator user activity
	await upsertUserActivity(db, chainId, event.args.operator, timestamp);

	await fetchAndPushBalance(context, operatorId, Number(event.block?.timestamp ?? Date.now()), Number(event.block.number));
}

export async function handleLock({ event, context }: any) {
	const { db } = context;
	const chainId = context.network.chainId;
	const user = event.args.user;
	const currency = getAddress(fromId(event.args.id));
	const balanceId = createBalanceId(chainId, currency, user);
	const timestamp = Number(event.block.timestamp);

	await context.db
		.insert(balances)
		.values({
			id: balanceId,
			user: user,
			chainId: chainId,
			amount: BigInt(0),
			lockedAmount: BigInt(event.args.amount),
			currency: currency,
		})
		.onConflictDoUpdate((row: any) => ({
			amount: row.amount - BigInt(event.args.amount),
			lockedAmount: row.lockedAmount + BigInt(event.args.amount),
		}));

	// Track user activity
	await upsertUserActivity(db, chainId, user, timestamp);

	await fetchAndPushBalance(context, balanceId, Number(event.block?.timestamp ?? Date.now()), Number(event.block.number));
}

export async function handleUnlock({ event, context }: any) {
	const { db } = context;
	const chainId = context.network.chainId;
	const user = event.args.user;
	const currency = getAddress(fromId(event.args.id));
	const balanceId = createBalanceId(chainId, currency, user);
	const timestamp = Number(event.block.timestamp);

	await context.db
		.insert(balances)
		.values({
			id: balanceId,
			user: user,
			chainId: chainId,
			amount: BigInt(event.args.amount),
			lockedAmount: BigInt(0),
			currency: currency,
		})
		.onConflictDoUpdate((row: any) => ({
			lockedAmount: row.lockedAmount - BigInt(event.args.amount),
			amount: row.amount + BigInt(event.args.amount),
		}));

	// Track user activity
	await upsertUserActivity(db, chainId, user, timestamp);

	await fetchAndPushBalance(context, balanceId, Number(event.block?.timestamp ?? Date.now()), Number(event.block.number));
}
