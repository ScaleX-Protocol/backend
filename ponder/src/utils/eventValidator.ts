import { createLogger, LogLabel } from './logger';

// Create logger instance for this file
const logger = createLogger('eventValidator.ts');

/**
 * Validates event has required transaction data before executing handler
 * @param handler - The actual event handler function
 * @param eventType - Type of event for logging purposes
 * @returns Wrapped handler function
 */
export function withEventValidator(handler: Function, eventType: string) {
  return async (context: any) => {
    const startTime = Date.now();
    const { event } = context;

    // Validate required transaction data
    if (!event.transaction?.hash) {
      logger.warn(
        `Event validation failed: Missing transaction hash`,
        LogLabel.VALIDATION,
        'withEventValidator',
        {
          eventType,
          blockNumber: event.block?.number,
          blockHash: event.block?.hash,
          logIndex: event.logIndex,
          eventArgs: event.args
        }
      );
      return;
    }

    if (!event.block?.number) {
      logger.warn(
        `Event validation failed: Missing block number`,
        LogLabel.VALIDATION,
        'withEventValidator',
        {
          eventType,
          txHash: event.transaction.hash,
          blockHash: event.block?.hash,
          logIndex: event.logIndex,
          eventArgs: event.args
        }
      );
      return;
    }

    // Execute the actual handler if validation passes
    try {
      await handler(context);

      // Log successful processing (COMMENTED OUT - creates too much log spam)
      // const processingTime = Date.now() - startTime;
      // logger.debug(
      //   `Event processed successfully`,
      //   LogLabel.EVENT_HANDLER,
      //   'withEventValidator',
      //   {
      //     eventType,
      //     txHash: event.transaction.hash,
      //     blockNumber: event.block.number,
      //     processingTimeMs: processingTime
      //   }
      // );
    } catch (error) {
      const errorInfo = {
        eventType,
        txHash: event.transaction.hash,
        blockNumber: event.block.number,
        timestamp: new Date().toISOString(),
        eventArgs: event.args
      };

      // Check if this is a database shutdown/connection error
      if (error instanceof Error && (
        error.message.includes('ShutdownError') ||
        error.message.includes('Connection terminated') ||
        error.message.includes('database connection')
      )) {
        logger.error(
          `FATAL: Database connection error - ${error.message}`,
          LogLabel.DATABASE,
          'withEventValidator',
          {
            ...errorInfo,
            errorType: 'DatabaseConnection',
            errorMessage: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n')
          }
        );
        throw error; // Re-throw database errors as they need immediate attention
      }

      // For business logic errors, log but don't crash the indexer
      if (error instanceof Error && (
        error.message.includes('Failed to insert') ||
        error.message.includes('duplicate key') ||
        error.message.includes('constraint')
      )) {
        logger.warn(
          `Business logic error - event skipped: ${error.message}`,
          LogLabel.EVENT_HANDLER,
          'withEventValidator',
          {
            ...errorInfo,
            errorType: 'BusinessLogic',
            errorMessage: error.message,
            action: 'event_skipped'
          }
        );
        return; // Skip this event but continue processing others
      }

      // For unknown errors, log with full context and re-throw
      logger.error(
        `Unknown error in event handler: ${error instanceof Error ? error.message : String(error)}`,
        LogLabel.EVENT_HANDLER,
        'withEventValidator',
        {
          ...errorInfo,
          errorType: 'Unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : 'no stack'
        }
      );
      throw error;
    }
  };
}