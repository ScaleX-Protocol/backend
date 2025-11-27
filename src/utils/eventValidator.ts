/**
 * Validates event has required transaction data before executing handler
 * @param handler - The actual event handler function
 * @param eventType - Type of event for logging purposes
 * @returns Wrapped handler function
 */
export function withEventValidator(handler: Function, eventType: string) {
  return async (context: any) => {
    const { event } = context;

    // Validate required transaction data
    if (!event.transaction?.hash) {
      console.error(`SKIPPED: Missing transaction hash for ${eventType} event`, {
        blockNumber: event.block?.number,
        blockHash: event.block?.hash,
        logIndex: event.logIndex,
        eventArgs: event.args,
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!event.block?.number) {
      console.error(`SKIPPED: Missing block number for ${eventType} event`, {
        txHash: event.transaction.hash,
        blockHash: event.block?.hash,
        logIndex: event.logIndex,
        eventArgs: event.args,
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Execute the actual handler if validation passes
    try {
      await handler(context);
    } catch (error) {
      const errorInfo = {
        txHash: event.transaction.hash,
        blockNumber: event.block.number,
        timestamp: new Date().toISOString()
      };

      // Check if this is a database shutdown/connection error
      if (error instanceof Error && (
        error.message.includes('ShutdownError') ||
        error.message.includes('Connection terminated') ||
        error.message.includes('database connection')
      )) {
        console.error(`💀 FATAL: Database connection error in ${eventType} handler:`, error.message, errorInfo);
      }

      // For business logic errors, log but don't crash the indexer
      if (error instanceof Error && (
        error.message.includes('Failed to insert') ||
        error.message.includes('duplicate key') ||
        error.message.includes('constraint')
      )) {
        console.error(`⚠️  BUSINESS LOGIC ERROR in ${eventType} handler (event skipped):`, error.message, errorInfo);
        return; // Skip this event but continue processing others
      }

      // For unknown errors, log with full context and re-throw
      console.error(`❌ ERROR in ${eventType} handler:`, error, errorInfo);

      // TODO :: Store error
    }
  };
}