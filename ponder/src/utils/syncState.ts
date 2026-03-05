import dotenv from "dotenv";
import { getCachedData } from "./redis";
import { createLogger, LogLabel } from "./logger";

dotenv.config();

// Create logger instance for this file
const logger = createLogger('syncState.ts');

let cachedEnabledBlockNumber: number | null = null;

export const shouldEnableWebSocket = async (currentBlockNumber: number, callerFunction: string = 'shouldEnableWebSocket'): Promise<boolean> => {
    try {
        const enabledWebSocket = process.env.ENABLE_WEBSOCKET === 'true';
        if (!enabledWebSocket) return false;

        if (cachedEnabledBlockNumber === null) {
            const envFallback = parseInt(process.env.START_WEBSOCKET_BLOCK || '0') || 34293825;
            cachedEnabledBlockNumber = (await getCachedData<number>('websocket:enable:block', currentBlockNumber, callerFunction)) || envFallback;
        }

        const enabledBlockNumber = cachedEnabledBlockNumber;
        if (!enabledBlockNumber) return true;

        return currentBlockNumber >= enabledBlockNumber;
    } catch (error) {
        logger.error('Error checking WebSocket enable status', LogLabel.SYSTEM, 'shouldEnableWebSocket', { error: error instanceof Error ? error.message : String(error), currentBlockNumber, callerFunction });
        return false;
    }
};

export async function executeIfInSync(
    eventBlockNumber: number,
    websocketOperations: () => Promise<void>,
    callerFunction: string
): Promise<void> {
    const shouldEnableWs = await shouldEnableWebSocket(eventBlockNumber, callerFunction || 'executeIfInSync');
    if (!shouldEnableWs) {
        return;
    }

    await websocketOperations();
}