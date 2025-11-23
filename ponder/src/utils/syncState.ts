import dotenv from "dotenv";
import { getCachedData } from "./redis";

dotenv.config();

let cachedEnabledBlockNumber: number | null = null;

export const shouldEnableWebSocket = async (currentBlockNumber: number, callerFunction: string = 'shouldEnableWebSocket'): Promise<boolean> => {
    try {
        const enabledWebSocket = process.env.ENABLE_WEBSOCKET === 'true';
        if (!enabledWebSocket) return false;

        if (cachedEnabledBlockNumber === null) {
            cachedEnabledBlockNumber = await getCachedData<number>('websocket:enable:block', currentBlockNumber, callerFunction);
        }
        
        const enabledBlockNumber = cachedEnabledBlockNumber;
        if (!enabledBlockNumber) return true;

        return currentBlockNumber >= enabledBlockNumber;
    } catch (error) {
        console.error('Error checking WebSocket enable status:', error);
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