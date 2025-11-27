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
      console.error(`ERROR in ${eventType} handler:`, error, {
        txHash: event.transaction.hash,
        blockNumber: event.block.number,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  };
}