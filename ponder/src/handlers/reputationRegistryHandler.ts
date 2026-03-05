import { createLogger, LogLabel } from "../utils/logger";
import { agentReputation } from "ponder:schema";

const logger = createLogger('reputationRegistryHandler.ts');

// =============================================================
//                   REPUTATION REGISTRY HANDLERS
// =============================================================

/**
 * Handle NewFeedback event from ReputationRegistry (ERC-8004)
 * Emitted when giveFeedback() is called (e.g., after agent trades)
 */
export async function handleNewFeedback({ event, context }: any) {
	try {
		const { agentId, clientAddress, feedbackIndex, value, valueDecimals, tag1, tag2 } = event.args;
		const chainId = context.network.chainId;
		const id = `${chainId}-${agentId}-${clientAddress}-${feedbackIndex}`;

		logger.info(
			`New feedback - Agent: ${agentId}, Client: ${clientAddress}, Value: ${value}, Tags: ${tag1}/${tag2}`,
			LogLabel.EVENT_HANDLER,
			'handleNewFeedback'
		);

		await context.db
			.insert(agentReputation)
			.values({
				id,
				chainId,
				agentId: BigInt(agentId),
				clientAddress: clientAddress as `0x${string}`,
				feedbackIndex: BigInt(feedbackIndex),
				value: BigInt(value),
				valueDecimals: Number(valueDecimals),
				tag1: tag1 || '',
				tag2: tag2 || '',
				isRevoked: false,
				timestamp: Number(event.block.timestamp),
				transactionHash: event.transaction.hash,
				blockNumber: BigInt(event.block.number),
			})
			.onConflictDoUpdate({
				value: BigInt(value),
				valueDecimals: Number(valueDecimals),
				tag1: tag1 || '',
				tag2: tag2 || '',
				isRevoked: false,
			});
	} catch (error) {
		logger.error(
			`Failed to handle NewFeedback event`,
			LogLabel.EVENT_HANDLER,
			'handleNewFeedback',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

/**
 * Handle FeedbackRevoked event from ReputationRegistry (ERC-8004)
 * Emitted when a client revokes their feedback
 */
export async function handleFeedbackRevoked({ event, context }: any) {
	try {
		const { agentId, clientAddress, feedbackIndex } = event.args;
		const chainId = context.network.chainId;
		const id = `${chainId}-${agentId}-${clientAddress}-${feedbackIndex}`;

		logger.info(
			`Feedback revoked - Agent: ${agentId}, Client: ${clientAddress}, Index: ${feedbackIndex}`,
			LogLabel.EVENT_HANDLER,
			'handleFeedbackRevoked'
		);

		const existing = await context.db.find(agentReputation, { id });
		if (existing) {
			await context.db
				.update(agentReputation, { id })
				.set({ isRevoked: true });
		}
	} catch (error) {
		logger.error(
			`Failed to handle FeedbackRevoked event`,
			LogLabel.EVENT_HANDLER,
			'handleFeedbackRevoked',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}
