import { createCurrencyId } from "@/utils";
import { currencies, tokenMappings } from "ponder:schema";
import { ERC20ABI } from "../../abis/ERC20";
import { createLogger, LogLabel, log, LogLevel, ServiceName } from "../utils/logger";

// Create logger instance for this file
const logger = createLogger('tokenRegistryHandler.ts');

// Helper function to fetch token data from blockchain
async function fetchTokenData(client: any, address: string) {
	try {
		const [symbol, name, decimals] = await client.multicall({
			contracts: [
				{ address, abi: ERC20ABI, functionName: "symbol" },
				{ address, abi: ERC20ABI, functionName: "name" },
				{ address, abi: ERC20ABI, functionName: "decimals" },
			],
			blockTag: "latest"
		});

		return {
			symbol: symbol.status === "success" ? symbol.result : "",
			name: name.status === "success" ? name.result : "",
			decimals: decimals.status === "success" ? Number(decimals.result) : 18,
		};
	} catch {
		try {
			return {
				symbol: await safeReadContract(client, address, "symbol"),
				name: await safeReadContract(client, address, "name"),
				decimals: (await safeReadContract(client, address, "decimals")) || 18,
			};
		} catch {
			return {
				symbol: "",
				name: "",
				decimals: 18,
			};
		}
	}
}

async function safeReadContract(client: any, address: string, functionName: string) {
	try {
		return await client.readContract({
			address,
			abi: ERC20ABI,
			functionName,
			blockTag: "latest"
		});
	} catch (e) {
		logger.error(`Failed to get ${functionName} for ${address}`, LogLabel.API, 'safeReadContract', { address, functionName, error: e instanceof Error ? e.message : String(e) });
		return functionName === "decimals" ? 18 : "";
	}
}

// Helper function to check if a chain should be excluded (cross-chain filtering)
function shouldExcludeChain(chainId: number): boolean {
	const excludedChainsEnv = process.env.EXCLUDED_CHAINS || "4661,1918988905";
	const EXCLUDED_CHAINS = excludedChainsEnv.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

	return EXCLUDED_CHAINS.includes(chainId);
}

// Helper function to check if a token mapping should be processed
function shouldProcessTokenMapping(sourceChainId: number, targetChainId: number): boolean {
	if (shouldExcludeChain(sourceChainId) || shouldExcludeChain(targetChainId)) {
		return false;
	}

	return true;
}

// Helper function to insert currencies when tokens are registered
async function insertCurrency(context: any, chainId: number, address: string, data: {
	symbol: string;
	name?: string;
	decimals: number;
	tokenType?: "underlying" | "synthetic";
	sourceChainId?: number;
	underlyingTokenAddress?: string;
	registeredAt?: number;
}) {
	try {
		const currencyId = createCurrencyId(chainId, address);

		await context.db
			.insert(currencies)
			.values({
				id: currencyId,
				chainId,
				address: address.toLowerCase(),
				name: data.name || data.symbol,
				symbol: data.symbol,
				decimals: data.decimals,
				tokenType: data.tokenType || "underlying",
				sourceChainId: data.sourceChainId,
				underlyingTokenAddress: data.underlyingTokenAddress?.toLowerCase(),
				isActive: true,
				registeredAt: data.registeredAt || Math.floor(Date.now() / 1000),
			})
			.onConflictDoUpdate({
				id: currencyId,
				chainId,
				address: address.toLowerCase(),
				name: data.name || data.symbol,
				symbol: data.symbol,
				decimals: data.decimals,
				tokenType: data.tokenType || "underlying",
				sourceChainId: data.sourceChainId,
				underlyingTokenAddress: data.underlyingTokenAddress?.toLowerCase(),
				isActive: true,
				registeredAt: data.registeredAt || Math.floor(Date.now() / 1000),
			});

		logger.info(`Recorded currency: ${data.symbol} (${address}) on chain ${chainId} [${data.tokenType || "underlying"}]`, LogLabel.DATABASE, 'insertCurrency', { symbol: data.symbol, address, chainId, tokenType: data.tokenType });
	} catch (error) {
		logger.error(`Failed to record currency ${data.symbol}`, LogLabel.DATABASE, 'insertCurrency', { symbol: data.symbol, error: error instanceof Error ? error.message : String(error) });
	}
}

export async function handleTokenMappingRegistered({ event, context }: any) {
	try {
		const { sourceChainId, sourceToken, targetChainId, syntheticToken, symbol } = event.args;
		const { client, db } = context;
		const timestamp = Number(event.block.timestamp);

		if (!client) {
			log(LogLevel.ERROR, 'Client context is null or undefined', LogLabel.VALIDATION, ServiceName.CORE_CHAIN, {}, 'tokenRegistryHandler.ts', 'handleTokenMapped');
			return;
		}
		if (!db) {
			log(LogLevel.ERROR, 'Database context is null or undefined', LogLabel.DATABASE, ServiceName.CORE_CHAIN, {}, 'tokenRegistryHandler.ts', 'handleTokenMapped');
			return;
		}
		if (!event.transaction?.hash) {
			log(LogLevel.ERROR, 'Transaction hash is missing', LogLabel.VALIDATION, ServiceName.CORE_CHAIN, {}, 'tokenRegistryHandler.ts', 'handleTokenMapped');
			return;
		}

		// Exclude cross-chain mappings
		const sourceChainIdNum = Number(sourceChainId);
		const targetChainIdNum = Number(targetChainId);

		if (!shouldProcessTokenMapping(sourceChainIdNum, targetChainIdNum)) {
			return;
		}

		const id = `${sourceChainId}-${sourceToken}-${targetChainId}`;

		try {
			// Store token mapping record with conflict handling
			await db
				.insert(tokenMappings)
				.values({
					id,
					sourceChainId: Number(sourceChainId),
					sourceToken: sourceToken.toLowerCase(),
					targetChainId: Number(targetChainId),
					syntheticToken: syntheticToken.toLowerCase(),
					symbol: symbol,
					sourceDecimals: 0,
					syntheticDecimals: 0,
					isActive: true,
					registeredAt: timestamp,
					transactionId: event.transaction.hash,
					blockNumber: BigInt(event.block.number),
					timestamp: timestamp,
				})
				.onConflictDoUpdate({
					id,
					sourceChainId: Number(sourceChainId),
					sourceToken: sourceToken.toLowerCase(),
					targetChainId: Number(targetChainId),
					syntheticToken: syntheticToken.toLowerCase(),
					symbol: symbol,
					sourceDecimals: 0,
					syntheticDecimals: 0,
					isActive: true,
					registeredAt: timestamp,
					transactionId: event.transaction.hash,
					blockNumber: BigInt(event.block.number),
					timestamp: timestamp,
				});
			logger.info(`Stored/updated token mapping: ${symbol} from chain ${sourceChainId} to ${targetChainId}`, LogLabel.DATABASE, 'handleTokenMappingRegistered', { symbol, sourceChainId, targetChainId });

			// Fetch actual token data from blockchain for source token
			const sourceTokenData = await fetchTokenData(client, sourceToken);
			await insertCurrency(context, Number(sourceChainId), sourceToken, {
				symbol: sourceTokenData.symbol,
				name: sourceTokenData.name,
				decimals: sourceTokenData.decimals,
				tokenType: "underlying",
				registeredAt: timestamp,
			});

			// For synthetic token, we can't fetch from blockchain directly, so we use derived data
			await insertCurrency(context, Number(targetChainId), syntheticToken, {
				symbol: symbol,
				name: `ScaleX Synthetic ${sourceTokenData.symbol}`,
				decimals: sourceTokenData.decimals,
				tokenType: "synthetic",
				sourceChainId: Number(sourceChainId),
				underlyingTokenAddress: sourceToken,
				registeredAt: timestamp,
			});

		} catch (error) {
			logger.error('Token mapping insertion failed', LogLabel.DATABASE, 'handleTokenMappingRegistered', { error: error instanceof Error ? error.message : String(error) });
			log(LogLevel.ERROR, 'Failed to insert token mapping', LogLabel.DATABASE, ServiceName.CORE_CHAIN, { error: (error as Error).message }, 'tokenRegistryHandler.ts', 'handleTokenMapped');
			return;
		}
	} catch (error) {
		log(LogLevel.ERROR, 'TokenMappingRegistered handler error', LogLabel.EVENT_HANDLER, ServiceName.CORE_CHAIN, { error: error instanceof Error ? error.message : String(error) }, 'tokenRegistryHandler.ts', 'handleTokenMappingRegistered');
		return;
	}
}

export async function handleTokenMappingUpdated({ event, context }: any) {
	try {
		const { sourceChainId, sourceToken, targetChainId, newSynthetic } = event.args;
		const db = context.db;
		const timestamp = Number(event.block.timestamp);

		if (!db) {
			log(LogLevel.ERROR, 'Database context is null or undefined', LogLabel.VALIDATION, ServiceName.CORE_CHAIN, {}, 'tokenRegistryHandler.ts', 'handleTokenMappingUpdated');
			return;
		}
		if (!event.transaction?.hash) {
			log(LogLevel.ERROR, 'Transaction hash is missing', LogLabel.VALIDATION, ServiceName.CORE_CHAIN, {}, 'tokenRegistryHandler.ts', 'handleTokenMappingUpdated');
			return;
		}

		// Exclude cross-chain mappings - only process local chain mappings
		const sourceChainIdNum = Number(sourceChainId);
		const targetChainIdNum = Number(targetChainId);

		if (!shouldProcessTokenMapping(sourceChainIdNum, targetChainIdNum)) {
			logger.debug(`Skipping cross-chain token mapping update: from chain ${sourceChainId} to ${targetChainId} (filtered out)`, LogLabel.VALIDATION, 'handleTokenMappingUpdated', { sourceChainId, targetChainId });
			return; // Skip processing cross-chain mappings
		}

		const id = `${sourceChainId}-${sourceToken}-${targetChainId}`;

		try {
			// Update existing token mapping
			const existingMapping = await db.find(tokenMappings, { id });

			if (existingMapping) {
				await db
					.update(tokenMappings, { id })
					.set({
						syntheticToken: newSynthetic.toLowerCase(),
						transactionId: event.transaction.hash,
						blockNumber: BigInt(event.block.number),
						timestamp: timestamp,
					});
				logger.info(`Updated token mapping: ${id} -> new synthetic: ${newSynthetic}`, LogLabel.DATABASE, 'handleTokenMappingUpdated', { id, newSynthetic });
			} else {
				logger.warn(`Token mapping not found for update: ${id}`, LogLabel.DATABASE, 'handleTokenMappingUpdated', { id });
			}
		} catch (error) {
			logger.error('Token mapping update failed', LogLabel.DATABASE, 'handleTokenMappingUpdated', { error: error instanceof Error ? error.message : String(error) });
			log(LogLevel.ERROR, 'Failed to update token mapping', LogLabel.DATABASE, ServiceName.CORE_CHAIN, { error: (error as Error).message }, 'tokenRegistryHandler.ts', 'handleTokenMappingUpdated');
		return;
		}
	} catch (error) {
		log(LogLevel.ERROR, 'TokenMappingUpdated handler error', LogLabel.EVENT_HANDLER, ServiceName.CORE_CHAIN, { error: error instanceof Error ? error.message : String(error) }, 'tokenRegistryHandler.ts', 'handleTokenMappingUpdated');
		return;
	}
}

export async function handleTokenMappingRemoved({ event, context }: any) {
	try {
		const { sourceChainId, sourceToken, targetChainId } = event.args;
		const db = context.db;
		const timestamp = Number(event.block.timestamp);

		if (!db) {
			log(LogLevel.ERROR, 'Database context is null or undefined', LogLabel.VALIDATION, ServiceName.CORE_CHAIN, {}, 'tokenRegistryHandler.ts', 'handleTokenMappingRemoved');
			return;
		}
		if (!event.transaction?.hash) {
			log(LogLevel.ERROR, 'Transaction hash is missing', LogLabel.VALIDATION, ServiceName.CORE_CHAIN, {}, 'tokenRegistryHandler.ts', 'handleTokenMappingRemoved');
			return;
		}

		// Exclude cross-chain mappings - only process local chain mappings
		const sourceChainIdNum = Number(sourceChainId);
		const targetChainIdNum = Number(targetChainId);

		if (!shouldProcessTokenMapping(sourceChainIdNum, targetChainIdNum)) {
			logger.debug(`Skipping cross-chain token mapping removal: from chain ${sourceChainId} to ${targetChainId} (filtered out)`, LogLabel.VALIDATION, 'handleTokenMappingRemoved', { sourceChainId, targetChainId });
			return; // Skip processing cross-chain mappings
		}

		const id = `${sourceChainId}-${sourceToken}-${targetChainId}`;

		try {
			// Deactivate token mapping instead of removing for historical purposes
			const existingMapping = await db.find(tokenMappings, { id });

			if (existingMapping) {
				await db
					.update(tokenMappings, { id })
					.set({
						isActive: false,
						transactionId: event.transaction.hash,
						blockNumber: BigInt(event.block.number),
						timestamp: timestamp,
					});
				logger.info(`Deactivated token mapping: ${id}`, LogLabel.DATABASE, 'handleTokenMappingRemoved', { id });
			} else {
				logger.warn(`Token mapping not found for removal: ${id}`, LogLabel.DATABASE, 'handleTokenMappingRemoved', { id });
			}
		} catch (error) {
			logger.error('Token mapping removal failed', LogLabel.DATABASE, 'handleTokenMappingRemoved', { error: error instanceof Error ? error.message : String(error) });
			log(LogLevel.ERROR, 'Failed to remove token mapping', LogLabel.DATABASE, ServiceName.CORE_CHAIN, { error: error instanceof Error ? error.message : String(error) }, 'tokenRegistryHandler.ts', 'handleTokenMappingRemoved');
			return;
		}
	} catch (error) {
		log(LogLevel.ERROR, 'TokenMappingRemoved handler error', LogLabel.EVENT_HANDLER, ServiceName.CORE_CHAIN, { error: error instanceof Error ? error.message : String(error) }, 'tokenRegistryHandler.ts', 'handleTokenMappingRemoved');
		return;
	}
}

export async function handleTokenStatusChanged({ event, context }: any) {
	try {
		const { sourceChainId, sourceToken, targetChainId, isActive } = event.args;
		const db = context.db;
		const timestamp = Number(event.block.timestamp);

		if (!db) {
			log(LogLevel.ERROR, 'Database context is null or undefined', LogLabel.VALIDATION, ServiceName.CORE_CHAIN, {}, 'tokenRegistryHandler.ts', 'handleTokenStatusChanged');
			return;
		}
		if (!event.transaction?.hash) {
			log(LogLevel.ERROR, 'Transaction hash is missing', LogLabel.VALIDATION, ServiceName.CORE_CHAIN, {}, 'tokenRegistryHandler.ts', 'handleTokenStatusChanged');
			return;
		}

		const id = `${sourceChainId}-${sourceToken}-${targetChainId}`;

		try {
			// Update token mapping status
			const existingMapping = await db.find(tokenMappings, { id });

			if (existingMapping) {
				await db
					.update(tokenMappings, { id })
					.set({
						isActive: isActive,
						transactionId: event.transaction.hash,
						blockNumber: BigInt(event.block.number),
						timestamp: timestamp,
					});
				logger.info(`Updated token mapping status: ${id} -> ${isActive ? 'ACTIVE' : 'INACTIVE'}`, LogLabel.DATABASE, 'handleTokenStatusChanged', { id, isActive });
			} else {
				logger.warn(`Token mapping not found for status change: ${id}`, LogLabel.DATABASE, 'handleTokenStatusChanged', { id });
			}
		} catch (error) {
			logger.error('Token mapping status update failed', LogLabel.DATABASE, 'handleTokenStatusChanged', { error: error instanceof Error ? error.message : String(error) });
			log(LogLevel.ERROR, 'Failed to update token mapping status', LogLabel.DATABASE, ServiceName.CORE_CHAIN, { error: error instanceof Error ? error.message : String(error) }, 'tokenRegistryHandler.ts', 'handleTokenStatusChanged');
			return;
		}
	} catch (error) {
		log(LogLevel.ERROR, 'TokenStatusChanged handler error', LogLabel.EVENT_HANDLER, ServiceName.CORE_CHAIN, { error: error instanceof Error ? error.message : String(error) }, 'tokenRegistryHandler.ts', 'handleTokenStatusChanged');
		return;
	}
}

export async function handleOwnershipTransferred({ event, context }: any) {
	try {
		const { previousOwner, newOwner } = event.args;
		const chainId = context.network.chainId;

		logger.info(`TokenRegistry ownership transferred on chain ${chainId}: ${previousOwner} -> ${newOwner} at block ${event.block.number}`, LogLabel.SYSTEM, 'handleOwnershipTransferred', { chainId, previousOwner, newOwner, blockNumber: event.block.number });
	} catch (error) {
		log(LogLevel.ERROR, 'OwnershipTransferred handler error', LogLabel.EVENT_HANDLER, ServiceName.CORE_CHAIN, { error: error instanceof Error ? error.message : String(error) }, 'tokenRegistryHandler.ts', 'handleOwnershipTransferred');
		return;
	}
}

export async function handleInitialized({ event, context }: any) {
	try {
		const { version } = event.args;
		const chainId = context.network.chainId;

		logger.info(`TokenRegistry initialized on chain ${chainId} with version ${version} at block ${event.block.number}`, LogLabel.SYSTEM, 'handleInitialized', { chainId, version, blockNumber: event.block.number });
	} catch (error) {
		log(LogLevel.ERROR, 'Initialized handler error', LogLabel.EVENT_HANDLER, ServiceName.CORE_CHAIN, { error: error instanceof Error ? error.message : String(error) }, 'tokenRegistryHandler.ts', 'handleInitialized');
		return;
	}
}