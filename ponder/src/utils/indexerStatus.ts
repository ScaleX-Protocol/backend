import { indexerStatus } from "ponder:schema";

const MAX_RECENT_EVENTS = 100;

interface RecentEvent {
	blockNumber: string;
	blockTimestamp: number;
	eventName: string;
	createdAt: number;
}

/**
 * Tracks indexer progress by updating a single row per chain.
 * Stores the latest block info and maintains an array of recent events (max 100).
 * This is efficient as it only does a single upsert per event.
 *
 * @param context - Ponder context object containing db and network info
 * @param eventName - Name of the event being processed
 * @param event - The event object containing block info (optional, falls back to context.block)
 */
export async function updateIndexerStatus(
	context: any,
	eventName: string,
	event?: any
) {
	// Get block info from event or context
	const block = event?.block || context.block;
	if (!block) {
		// Skip if no block info available
		return;
	}

	const chainId = context.network.chainId;
	const blockNumber = BigInt(block.number);
	const blockTimestamp = Number(block.timestamp);
	const now = Math.floor(Date.now() / 1000);

	// Create new event entry
	const newEvent: RecentEvent = {
		blockNumber: blockNumber.toString(),
		blockTimestamp,
		eventName,
		createdAt: now,
	};

	// Try to get existing record
	const existing = await context.db.find(indexerStatus, { id: chainId });

	if (existing) {
		// Update existing record
		let recentEvents: RecentEvent[] = existing.recentEvents || [];

		// Add new event to the beginning
		recentEvents.unshift(newEvent);

		// Keep only the last MAX_RECENT_EVENTS
		if (recentEvents.length > MAX_RECENT_EVENTS) {
			recentEvents = recentEvents.slice(0, MAX_RECENT_EVENTS);
		}

		await context.db
			.update(indexerStatus, { id: chainId })
			.set({
				latestBlockNumber: blockNumber,
				latestBlockTimestamp: blockTimestamp,
				latestEventName: eventName,
				updatedAt: now,
				recentEvents,
			});
	} else {
		// Insert new record
		await context.db
			.insert(indexerStatus)
			.values({
				id: chainId,
				latestBlockNumber: blockNumber,
				latestBlockTimestamp: blockTimestamp,
				latestEventName: eventName,
				updatedAt: now,
				recentEvents: [newEvent],
			});
	}
}
