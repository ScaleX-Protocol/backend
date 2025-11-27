import { getEventPublisher } from "@/events/index";
import dotenv from "dotenv";
import { createLogger, LogLabel } from "../utils/logger";
import {
  chainBalanceDeposits,
  chainBalanceStates,
  chainBalanceTokenWhitelist,
  chainBalanceUnlocks,
  chainBalanceWithdrawals,
  crossChainTransfers
} from "ponder:schema";

dotenv.config();

// Create logger instance for this file
const logger = createLogger('chainBalanceManagerHandler.ts');

// Helper function to publish chain balance events
async function publishChainBalanceEvent(
  eventType: 'deposit' | 'withdraw' | 'unlock' | 'claim',
  user: string,
  token: string,
  amount: bigint,
  chainId: number,
  timestamp: number,
  transactionId: string,
  blockNumber: string
) {
  try {
    const eventPublisher = getEventPublisher();

    await eventPublisher.publishChainBalanceUpdate({
      eventType,
      userId: user.toLowerCase(),
      token: token.toLowerCase(),
      amount: amount.toString(),
      chainId: chainId.toString(),
      timestamp: timestamp.toString(),
      transactionId,
      blockNumber
    });
  } catch (error) {
    logger.error('Failed to publish chain balance event', LogLabel.EVENT_HANDLER, 'publishChainBalanceEvent', { error: error instanceof Error ? error.message : String(error), eventType, user, token, amount: amount.toString() });
  }
}

export async function handleDeposit({ event, context }: any) {
  try {
    const { depositor, recipient, token, amount } = event.args;
    const chainId = context.network.chainId;
    const db = context.db;
    const timestamp = Number(event.block.timestamp);

    if (!db) throw new Error('Database context is null or undefined');
    if (!chainId) throw new Error('Chain ID is missing from context');
    if (!event.transaction?.hash) throw new Error('Transaction hash is missing');

    const id = `${chainId}-${event.transaction.hash}-${event.logIndex}`;

    try {
      // Store deposit record
      await db.insert(chainBalanceDeposits).values({
        id,
        chainId: Number(chainId),
        depositor: depositor.toLowerCase(),
        recipient: recipient.toLowerCase(),
        token: token.toLowerCase(),
        amount: amount,
        timestamp,
        transactionId: event.transaction.hash,
        blockNumber: event.block.number.toString(),
      });
    } catch (error) {
      logger.error('Deposit insertion failed', LogLabel.DATABASE, 'handleDeposit', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to insert deposit: ${(error as Error).message}`);
    }

    // Create cross-chain transfer record using sourceTransactionHash with conflict-based approach
    try {
      const transferId = `transfer-${event.transaction.hash}`;

      await db.insert(crossChainTransfers).values({
        id: transferId,
        sourceChainId: Number(chainId),
        destinationChainId: null,
        sender: depositor,
        recipient: recipient,
        sourceToken: token,
        amount: BigInt(amount),
        messageId: null,
        sourceTransactionHash: event.transaction.hash,
        destinationTransactionHash: null,
        sourceBlockNumber: BigInt(event.block.number),
        destinationBlockNumber: null,
        timestamp: timestamp,
        destinationTimestamp: null,
        status: "PENDING",
        direction: "DEPOSIT",
      }).onConflictDoUpdate({
        sourceChainId: Number(chainId),
        sender: depositor,
        recipient: recipient,
        sourceToken: token,
        amount: BigInt(amount),
        sourceTransactionHash: event.transaction.hash,
        sourceBlockNumber: BigInt(event.block.number),
        timestamp: timestamp,
        status: "PENDING",
      });

      logger.info(`Created transfer record from deposit: ${transferId}`, LogLabel.DATABASE, 'handleDeposit', { transferId });
    } catch (error) {
      logger.warn('Cross-chain transfer creation failed', LogLabel.DATABASE, 'handleDeposit', { error: error instanceof Error ? error.message : String(error) });
      // Don't throw error here as it's not critical for deposit processing
    }

    // Update or create balance state
    const stateId = `${chainId}-${recipient.toLowerCase()}-${token.toLowerCase()}`;

    try {
      // Try to get existing state
      const existingState = await db.find(chainBalanceStates, {
        id: stateId
      });

      if (existingState) {
        // Update existing state
        await db
          .update(chainBalanceStates, { id: stateId })
          .set({
            balance: existingState.balance + amount,
            lastUpdated: timestamp,
          });
      } else {
        // Create new state
        await db.insert(chainBalanceStates).values({
          id: stateId,
          chainId: Number(chainId),
          user: recipient.toLowerCase(),
          token: token.toLowerCase(),
          balance: amount,
          unlockedBalance: 0n,
          lastUpdated: timestamp,
        });
      }
    } catch (error) {
      logger.error('Balance state update failed', LogLabel.DATABASE, 'handleDeposit', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to update balance state for deposit: ${(error as Error).message}`);
    }

    // Publish chain balance event
    try {
      await publishChainBalanceEvent(
        'deposit',
        recipient,
        token,
        amount,
        Number(chainId),
        timestamp,
        event.transaction.hash,
        event.block.number.toString()
      );
    } catch (error) {
      logger.error('Failed to publish deposit event', LogLabel.EVENT_HANDLER, 'handleDeposit', { error: error instanceof Error ? error.message : String(error) });
    }
  } catch (error) {
    logger.error('Deposit handler error', LogLabel.EVENT_HANDLER, 'handleDeposit', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function handleWithdraw({ event, context }: any) {
  try {
    const { user, token, amount } = event.args;
    const chainId = context.network.chainId;
    const { block } = context;
    const db = context.db;
    const timestamp = Number(block.timestamp);

    if (!db) throw new Error('Database context is null or undefined');
    if (!chainId) throw new Error('Chain ID is missing from context');
    if (!event.transaction?.hash) throw new Error('Transaction hash is missing');

    const id = `${chainId}-${event.transaction.hash}-${event.logIndex}`;

    try {
      // Store withdrawal record
      await db.insert(chainBalanceWithdrawals).values({
        id,
        chainId: Number(chainId),
        user: user.toLowerCase(),
        token: token.toLowerCase(),
        amount: amount,
        timestamp,
        transactionId: event.transaction.hash,
        blockNumber: block.number.toString(),
        withdrawalType: 'withdraw', // Traditional seamless withdrawal
      });
    } catch (error) {
      logger.error('Withdrawal insertion failed', LogLabel.DATABASE, 'handleWithdraw', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to insert withdrawal: ${(error as Error).message}`);
    }

    // Update balance state
    const stateId = `${chainId}-${user.toLowerCase()}-${token.toLowerCase()}`;

    try {
      const existingState = await db.find(chainBalanceStates, {
        id: stateId
      });

      if (existingState) {
        await db
          .update(chainBalanceStates, { id: stateId })
          .set({
            balance: existingState.balance - amount,
            lastUpdated: timestamp,
          });
      }
    } catch (error) {
      logger.error('Balance state update failed', LogLabel.DATABASE, 'handleWithdraw', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to update balance state for withdraw: ${(error as Error).message}`);
    }

    // Publish chain balance event
    try {
      await publishChainBalanceEvent(
        'withdraw',
        user,
        token,
        amount,
        Number(chainId),
        timestamp,
        event.transaction.hash,
        block.number.toString()
      );
    } catch (error) {
      logger.error('Failed to publish withdraw event', LogLabel.EVENT_HANDLER, 'handleWithdraw', { error: error instanceof Error ? error.message : String(error) });
    }
  } catch (error) {
    logger.error('Withdraw handler error', LogLabel.EVENT_HANDLER, 'handleWithdraw', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function handleUnlock({ event, context }: any) {
  try {
    const { user, token, amount } = event.args;
    const chainId = context.network.chainId;
    const { block } = context;
    const db = context.db;
    const timestamp = Number(block.timestamp);

    if (!db) throw new Error('Database context is null or undefined');
    if (!chainId) throw new Error('Chain ID is missing from context');
    if (!event.transaction?.hash) throw new Error('Transaction hash is missing');

    const id = `${chainId}-${event.transaction.hash}-${event.logIndex}`;

    try {
      // Store unlock record
      await db.insert(chainBalanceUnlocks).values({
        id,
        chainId: Number(chainId),
        user: user.toLowerCase(),
        token: token.toLowerCase(),
        amount: amount,
        timestamp,
        transactionId: event.transaction.hash,
        blockNumber: block.number.toString(),
      });
    } catch (error) {
      logger.error('Unlock insertion failed', LogLabel.DATABASE, 'handleUnlock', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to insert unlock: ${(error as Error).message}`);
    }

    // Update balance state (move from balance to unlockedBalance)
    const stateId = `${chainId}-${user.toLowerCase()}-${token.toLowerCase()}`;

    try {
      const existingState = await db.find(chainBalanceStates, {
        id: stateId
      });

      if (existingState) {
        await db
          .update(chainBalanceStates, { id: stateId })
          .set({
            balance: existingState.balance - amount,
            unlockedBalance: existingState.unlockedBalance + amount,
            lastUpdated: timestamp,
          });
      }
    } catch (error) {
      logger.error('Balance state update failed', LogLabel.DATABASE, 'handleUnlock', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to update balance state for unlock: ${(error as Error).message}`);
    }

    // Publish chain balance event
    try {
      await publishChainBalanceEvent(
        'unlock',
        user,
        token,
        amount,
        Number(chainId),
        timestamp,
        event.transaction.hash,
        block.number.toString()
      );
    } catch (error) {
      logger.error('Failed to publish unlock event', LogLabel.EVENT_HANDLER, 'handleUnlock', { error: error instanceof Error ? error.message : String(error) });
    }
  } catch (error) {
    logger.error('Unlock handler error', LogLabel.EVENT_HANDLER, 'handleUnlock', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function handleClaim({ event, context }: any) {
  try {
    const { user, token, amount } = event.args;
    const chainId = context.network.chainId;
    const { block } = context;
    const db = context.db;
    const timestamp = Number(block.timestamp);

    if (!db) throw new Error('Database context is null or undefined');
    if (!chainId) throw new Error('Chain ID is missing from context');
    if (!event.transaction?.hash) throw new Error('Transaction hash is missing');

    const id = `${chainId}-${event.transaction.hash}-${event.logIndex}`;

    try {
      // Store claim record as a withdrawal
      await db.insert(chainBalanceWithdrawals).values({
        id,
        chainId: Number(chainId),
        user: user.toLowerCase(),
        token: token.toLowerCase(),
        amount: amount,
        timestamp,
        transactionId: event.transaction.hash,
        blockNumber: block.number.toString(),
        withdrawalType: 'claim', // User-initiated claim
      });
    } catch (error) {
      logger.error('Claim insertion failed', LogLabel.DATABASE, 'handleClaim', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to insert claim: ${(error as Error).message}`);
    }

    // Update balance state (reduce unlockedBalance)
    const stateId = `${chainId}-${user.toLowerCase()}-${token.toLowerCase()}`;

    try {
      const existingState = await db.find(chainBalanceStates, {
        id: stateId
      });

      if (existingState) {
        await db
          .update(chainBalanceStates, { id: stateId })
          .set({
            unlockedBalance: existingState.unlockedBalance - amount,
            lastUpdated: timestamp,
          });
      }
    } catch (error) {
      logger.error('Balance state update failed', LogLabel.DATABASE, 'handleClaim', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to update balance state for claim: ${(error as Error).message}`);
    }

    // Publish chain balance event
    try {
      await publishChainBalanceEvent(
        'claim',
        user,
        token,
        amount,
        Number(chainId),
        timestamp,
        event.transaction.hash,
        block.number.toString()
      );
    } catch (error) {
      logger.error('Failed to publish claim event', LogLabel.EVENT_HANDLER, 'handleClaim', { error: error instanceof Error ? error.message : String(error) });
    }
  } catch (error) {
    logger.error('Claim handler error', LogLabel.EVENT_HANDLER, 'handleClaim', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function handleTokenWhitelisted({ event, context }: any) {
  try {
    const { token } = event.args;
    const chainId = context.network.chainId;
    const db = context.db;
    const timestamp = Number(event.block.timestamp);

    if (!db) throw new Error('Database context is null or undefined');
    if (!chainId) throw new Error('Chain ID is missing from context');
    if (!event.transaction?.hash) throw new Error('Transaction hash is missing');

    const id = `${chainId}-${event.transaction.hash}-${event.logIndex}`;

    try {
      await db.insert(chainBalanceTokenWhitelist).values({
        id,
        chainId: Number(chainId),
        token: token.toLowerCase(),
        isWhitelisted: true,
        timestamp,
        transactionId: event.transaction.hash,
        blockNumber: event.block.number.toString(),
        action: 'added',
      });
    } catch (error) {
      logger.error('Token whitelist insertion failed', LogLabel.DATABASE, 'handleTokenWhitelisted', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to insert token whitelist: ${(error as Error).message}`);
    }
  } catch (error) {
    logger.error('TokenWhitelisted handler error', LogLabel.EVENT_HANDLER, 'handleTokenWhitelisted', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function handleTokenRemoved({ event, context }: any) {
  try {
    const { token } = event.args;
    const chainId = context.network.chainId;
    const db = context.db;
    const timestamp = Number(event.block.timestamp);

    if (!db) throw new Error('Database context is null or undefined');
    if (!chainId) throw new Error('Chain ID is missing from context');
    if (!event.transaction?.hash) throw new Error('Transaction hash is missing');

    const id = `${chainId}-${event.transaction.hash}-${event.logIndex}`;

    try {
      await db.insert(chainBalanceTokenWhitelist).values({
        id,
        chainId: Number(chainId),
        token: token.toLowerCase(),
        isWhitelisted: false,
        timestamp,
        transactionId: event.transaction.hash,
        blockNumber: event.block.number.toString(),
        action: 'removed',
      });
    } catch (error) {
      logger.error('Token removal insertion failed', LogLabel.DATABASE, 'handleTokenRemoved', { error: error instanceof Error ? error.message : String(error) });
      throw new Error(`Failed to insert token removal: ${(error as Error).message}`);
    }
  } catch (error) {
    logger.error('TokenRemoved handler error', LogLabel.EVENT_HANDLER, 'handleTokenRemoved', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function handleOwnershipTransferred({ event, context }: any) {
  try {
    const { previousOwner, newOwner } = event.args;
    const chainId = context.network.chainId;

    logger.info(`ChainBalanceManager ownership transferred on chain ${chainId}: ${previousOwner} -> ${newOwner} at block ${event.block.number}`, LogLabel.SYSTEM, 'handleOwnershipTransferred', { chainId, previousOwner, newOwner, blockNumber: event.block.number });
  } catch (error) {
    logger.error('OwnershipTransferred handler error', LogLabel.EVENT_HANDLER, 'handleOwnershipTransferred', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function handleInitialized({ event, context }: any) {
  try {
    const { version } = event.args;
    const chainId = context.network.chainId;

    logger.info(`ChainBalanceManager initialized on chain ${chainId} with version ${version} at block ${event.block.number}`, LogLabel.SYSTEM, 'handleInitialized', { chainId, version, blockNumber: event.block.number });
  } catch (error) {
    logger.error('Initialized handler error', LogLabel.EVENT_HANDLER, 'handleInitialized', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}