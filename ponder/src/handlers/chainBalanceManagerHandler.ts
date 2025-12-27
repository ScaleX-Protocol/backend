import { getEventPublisher } from "@/events/index";
import { updateIndexerStatus } from "@/utils/indexerStatus";
import dotenv from "dotenv";
import { createLogger, LogLabel, log, LogLevel } from "../utils/logger";
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
  await updateIndexerStatus(context, 'ChainBalanceManager:Deposit', event);
  try {
    const { depositor, recipient, token, amount } = event.args;
    const chainId = context.network.chainId;
    const db = context.db;
    const timestamp = Number(event.block.timestamp);

    if (!db) {
      log(LogLevel.ERROR, 'Database context is null or undefined', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleDeposit');
      return;
    }
    if (!chainId) {
      log(LogLevel.ERROR, 'Chain ID is missing from context', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleDeposit');
      return;
    }
    if (!event.transaction?.hash) {
      log(LogLevel.ERROR, 'Transaction hash is missing', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleDeposit');
      return;
    }

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
      log(LogLevel.ERROR, 'Failed to insert deposit', LogLabel.DATABASE, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleDeposit');
      return;
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
      log(LogLevel.ERROR, 'Failed to update balance state for deposit', LogLabel.DATABASE, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleDeposit');
      return;
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
    log(LogLevel.ERROR, 'Deposit handler error', LogLabel.EVENT_HANDLER, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleDeposit');
    return;
  }
}

export async function handleWithdraw({ event, context }: any) {
  await updateIndexerStatus(context, 'ChainBalanceManager:Withdraw', event);
  try {
    const { user, token, amount } = event.args;
    const chainId = context.network.chainId;
    const { block } = context;
    const db = context.db;
    const timestamp = Number(block.timestamp);

    if (!db) {
      log(LogLevel.ERROR, 'Database context is null or undefined', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleWithdraw');
      return;
    }
    if (!chainId) {
      log(LogLevel.ERROR, 'Chain ID is missing from context', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleWithdraw');
      return;
    }
    if (!event.transaction?.hash) {
      log(LogLevel.ERROR, 'Transaction hash is missing', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleWithdraw');
      return;
    }

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
      log(LogLevel.ERROR, 'Failed to insert withdrawal', LogLabel.DATABASE, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleWithdraw');
      return;
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
      log(LogLevel.ERROR, 'Failed to update balance state for withdraw', LogLabel.DATABASE, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleWithdraw');
      return;
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
    log(LogLevel.ERROR, 'Withdraw handler error', LogLabel.EVENT_HANDLER, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleWithdraw');
    return;
  }
}

export async function handleUnlock({ event, context }: any) {
  await updateIndexerStatus(context, 'ChainBalanceManager:Unlock', event);
  try {
    const { user, token, amount } = event.args;
    const chainId = context.network.chainId;
    const { block } = context;
    const db = context.db;
    const timestamp = Number(block.timestamp);

    if (!db) {
      log(LogLevel.ERROR, 'Database context is null or undefined', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleUnlock');
      return;
    }
    if (!chainId) {
      log(LogLevel.ERROR, 'Chain ID is missing from context', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleUnlock');
      return;
    }
    if (!event.transaction?.hash) {
      log(LogLevel.ERROR, 'Transaction hash is missing', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleUnlock');
      return;
    }

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
      log(LogLevel.ERROR, 'Failed to insert unlock', LogLabel.DATABASE, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleUnlock');
      return;
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
      log(LogLevel.ERROR, 'Failed to update balance state for unlock', LogLabel.DATABASE, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleUnlock');
      return;
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
    log(LogLevel.ERROR, 'Unlock handler error', LogLabel.EVENT_HANDLER, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleUnlock');
    return;
  }
}

export async function handleClaim({ event, context }: any) {
  await updateIndexerStatus(context, 'ChainBalanceManager:Claim', event);
  try {
    const { user, token, amount } = event.args;
    const chainId = context.network.chainId;
    const { block } = context;
    const db = context.db;
    const timestamp = Number(block.timestamp);

    if (!db) {
      log(LogLevel.ERROR, 'Database context is null or undefined', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleClaim');
      return;
    }
    if (!chainId) {
      log(LogLevel.ERROR, 'Chain ID is missing from context', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleClaim');
      return;
    }
    if (!event.transaction?.hash) {
      log(LogLevel.ERROR, 'Transaction hash is missing', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleClaim');
      return;
    }

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
      log(LogLevel.ERROR, 'Failed to insert claim', LogLabel.DATABASE, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleClaim');
      return;
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
      log(LogLevel.ERROR, 'Failed to update balance state for claim', LogLabel.DATABASE, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleClaim');
      return;
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
    log(LogLevel.ERROR, 'Claim handler error', LogLabel.EVENT_HANDLER, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleClaim');
    return;
  }
}

export async function handleTokenWhitelisted({ event, context }: any) {
  await updateIndexerStatus(context, 'ChainBalanceManager:TokenWhitelisted', event);
  try {
    const { token } = event.args;
    const chainId = context.network.chainId;
    const db = context.db;
    const timestamp = Number(event.block.timestamp);

    if (!db) {
      log(LogLevel.ERROR, 'Database context is null or undefined', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleTokenWhitelisted');
      return;
    }
    if (!chainId) {
      log(LogLevel.ERROR, 'Chain ID is missing from context', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleTokenWhitelisted');
      return;
    }
    if (!event.transaction?.hash) {
      log(LogLevel.ERROR, 'Transaction hash is missing', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleTokenWhitelisted');
      return;
    }

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
      log(LogLevel.ERROR, 'Failed to insert token whitelist', LogLabel.DATABASE, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleTokenWhitelisted');
      return;
    }
  } catch (error) {
    log(LogLevel.ERROR, 'TokenWhitelisted handler error', LogLabel.EVENT_HANDLER, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleTokenWhitelisted');
    return;
  }
}

export async function handleTokenRemoved({ event, context }: any) {
  await updateIndexerStatus(context, 'ChainBalanceManager:TokenRemoved', event);
  try {
    const { token } = event.args;
    const chainId = context.network.chainId;
    const db = context.db;
    const timestamp = Number(event.block.timestamp);

    if (!db) {
      log(LogLevel.ERROR, 'Database context is null or undefined', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleTokenRemoved');
      return;
    }
    if (!chainId) {
      log(LogLevel.ERROR, 'Chain ID is missing from context', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleTokenRemoved');
      return;
    }
    if (!event.transaction?.hash) {
      log(LogLevel.ERROR, 'Transaction hash is missing', LogLabel.VALIDATION, {}, 'chainBalanceManagerHandler.ts', 'handleTokenRemoved');
      return;
    }

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
      log(LogLevel.ERROR, 'Failed to insert token removal', LogLabel.DATABASE, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleTokenRemoved');
      return;
    }
  } catch (error) {
    log(LogLevel.ERROR, 'TokenRemoved handler error', LogLabel.EVENT_HANDLER, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleTokenRemoved');
    return;
  }
}

export async function handleOwnershipTransferred({ event, context }: any) {
  await updateIndexerStatus(context, 'ChainBalanceManager:OwnershipTransferred', event);
  try {
    const { previousOwner, newOwner } = event.args;
    const chainId = context.network.chainId;

    logger.info(`ChainBalanceManager ownership transferred on chain ${chainId}: ${previousOwner} -> ${newOwner} at block ${event.block.number}`, LogLabel.SYSTEM, 'handleOwnershipTransferred', { chainId, previousOwner, newOwner, blockNumber: event.block.number });
  } catch (error) {
    log(LogLevel.ERROR, 'OwnershipTransferred handler error', LogLabel.EVENT_HANDLER, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleOwnershipTransferred');
    return;
  }
}

export async function handleInitialized({ event, context }: any) {
  await updateIndexerStatus(context, 'ChainBalanceManager:Initialized', event);
  try {
    const { version } = event.args;
    const chainId = context.network.chainId;

    logger.info(`ChainBalanceManager initialized on chain ${chainId} with version ${version} at block ${event.block.number}`, LogLabel.SYSTEM, 'handleInitialized', { chainId, version, blockNumber: event.block.number });
  } catch (error) {
    log(LogLevel.ERROR, 'Initialized handler error', LogLabel.EVENT_HANDLER, { error: error instanceof Error ? error.message : String(error) }, 'chainBalanceManagerHandler.ts', 'handleInitialized');
    return;
  }
}