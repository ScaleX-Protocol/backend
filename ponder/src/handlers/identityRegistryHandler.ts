import { updateIndexerStatus } from "@/utils/indexerStatus";
import { createLogger, LogLabel } from "../utils/logger";
import { agentRegistry } from "ponder:schema";

const logger = createLogger('identityRegistryHandler.ts');

// =============================================================
//                   IDENTITY REGISTRY HANDLERS
// =============================================================

/**
 * Handle Registered event from IdentityRegistry
 * Emitted when a new agent identity is minted via register()
 */
export async function handleRegistered({ event, context }: any) {
	try {
		const { agentId, agentURI, owner } = event.args;
		const chainId = context.network.chainId;
		const id = `${chainId}-${agentId}`;

		logger.info(
			`Agent registered - ID: ${agentId}, Owner: ${owner}, URI: ${agentURI}`,
			LogLabel.EVENT_HANDLER,
			'handleRegistered'
		);

		await context.db
			.insert(agentRegistry)
			.values({
				id,
				chainId,
				tokenId: agentId,
				owner: owner as `0x${string}`,
				metadataURI: agentURI || null,
				registeredAt: Number(event.block.timestamp),
				transactionId: event.transaction.hash,
				blockNumber: BigInt(event.block.number),
			})
			.onConflictDoUpdate({
				metadataURI: agentURI || null,
				owner: owner as `0x${string}`,
			});

		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentRegistered"
		);
	} catch (error) {
		logger.error(
			`Failed to handle Registered event`,
			LogLabel.EVENT_HANDLER,
			'handleRegistered',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}

/**
 * Handle URIUpdated event from IdentityRegistry
 * Emitted when an agent's metadata URI is updated via setAgentURI()
 */
export async function handleURIUpdated({ event, context }: any) {
	try {
		const { agentId, newURI, updatedBy } = event.args;
		const chainId = context.network.chainId;
		const id = `${chainId}-${agentId}`;

		logger.info(
			`Agent URI updated - ID: ${agentId}, New URI: ${newURI}, Updated by: ${updatedBy}`,
			LogLabel.EVENT_HANDLER,
			'handleURIUpdated'
		);

		const existing = await context.db.find(agentRegistry, { id });
		if (existing) {
			await context.db
				.update(agentRegistry, { id })
				.set({
					metadataURI: newURI,
				});
		}

		await updateIndexerStatus(
			context.db,
			chainId,
			BigInt(event.block.number),
			Number(event.block.timestamp),
			"AgentURIUpdated"
		);
	} catch (error) {
		logger.error(
			`Failed to handle URIUpdated event`,
			LogLabel.EVENT_HANDLER,
			'handleURIUpdated',
			{ error: error instanceof Error ? error.message : String(error) }
		);
		throw error;
	}
}
