import { crossChainTransfers, hyperlaneMessages, crossChainMessageLinks } from "ponder:schema";

export async function handleHyperlaneMailboxDispatchId({ event, context }: any) {
	const { db } = context;

	// Store the Hyperlane DISPATCH message
	const dispatchId = `${event.args.messageId}-DISPATCH`;
	try {
		await db.insert(hyperlaneMessages).values({
			id: dispatchId,
			chainId: context.network.chainId,
			sender: event.transaction.from,
			messageId: event.args.messageId,
			type: "DISPATCH",
			transactionHash: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
			timestamp: Number(event.block.timestamp),
		});
	} catch (error) {
		// Silently handle link record errors
	}

	// Create cross-chain message link record using conflict-based approach
	try {
		await db.insert(crossChainMessageLinks).values({
			messageId: event.args.messageId,
			sourceTransactionHash: event.transaction.hash,
			destinationTransactionHash: null, // Will be filled by Process handler
			sourceChainId: context.network.chainId,
			destinationChainId: null, // Will be filled by Process handler
			sourceTimestamp: Number(event.block.timestamp),
			destinationTimestamp: null, // Will be filled by Process handler
			status: "SENT", // Initial status
		}).onConflictDoUpdate({
			sourceTransactionHash: event.transaction.hash,
			sourceChainId: context.network.chainId,
			sourceTimestamp: Number(event.block.timestamp),
			status: "SENT",
		});
	} catch (error) {
	}

	// Update transfer record using sourceTransactionHash ID (same as deposit handler)
	try {
		const transferId = `transfer-${event.transaction.hash}`;

		await db.insert(crossChainTransfers).values({
			id: transferId, // Use same ID pattern as deposit handler (sourceTransactionHash)
			messageId: event.args.messageId,
			dispatchMessageId: `${event.args.messageId}-DISPATCH`, // Reference to DISPATCH message
			processMessageId: null, // Will be set by PROCESS handler
			status: "SENT",
			sourceChainId: context.network.chainId,
			destinationChainId: null, // Will be determined by PROCESS handler
			sender: "", // Will be preserved from existing deposit record
			recipient: "", // Will be preserved from existing deposit record
			sourceToken: "", // Will be preserved from existing deposit record
			amount: 0n, // Will be preserved from existing deposit record
			sourceTransactionHash: event.transaction.hash,
			sourceBlockNumber: BigInt(event.block.number),
			timestamp: Number(event.block.timestamp),
			direction: "DEPOSIT",
			destinationTransactionHash: null, // Will be set by PROCESS handler
			destinationBlockNumber: null,
			destinationTimestamp: null,
		}).onConflictDoUpdate({
			messageId: event.args.messageId,
			dispatchMessageId: `${event.args.messageId}-DISPATCH`,
			status: "SENT",
			sourceChainId: context.network.chainId,
			sourceTransactionHash: event.transaction.hash,
			sourceBlockNumber: BigInt(event.block.number),
			timestamp: Number(event.block.timestamp),
		});

	} catch (error) {
		// Silently handle transfer record errors
	}
}

export async function handleHyperlaneMailboxProcessId({ event, context }: any) {
	const { db } = context;

	// Store the Hyperlane PROCESS message
	const processId = `${event.args.messageId}-PROCESS`;
	try {
		await db.insert(hyperlaneMessages).values({
			id: processId,
			chainId: context.network.chainId,
			sender: event.transaction.from,
			messageId: event.args.messageId,
			type: "PROCESS",
			transactionHash: event.transaction.hash,
			blockNumber: BigInt(event.block.number),
			timestamp: Number(event.block.timestamp),
		});
	} catch (error) {
	}

	try {
		// Update the crossChainMessageLinks table using conflict-based approach
		await db.insert(crossChainMessageLinks).values({
			messageId: event.args.messageId,
			sourceTransactionHash: null, // Keep existing if any
			destinationTransactionHash: event.transaction.hash,
			sourceChainId: null, // Keep existing if any
			destinationChainId: context.network.chainId,
			sourceTimestamp: null, // Keep existing if any
			destinationTimestamp: Number(event.block.timestamp),
			status: "RELAYED",
		}).onConflictDoUpdate({
			destinationTransactionHash: event.transaction.hash,
			destinationChainId: context.network.chainId,
			destinationTimestamp: Number(event.block.timestamp),
			status: "RELAYED",
		});

	} catch (error) {
	}
}

