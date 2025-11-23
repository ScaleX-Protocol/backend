import { createCurrencyId } from "@/utils";
import { currencies, tokenMappings } from "ponder:schema";
import { ERC20ABI } from "../../../abis/ERC20";

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
		console.error(`Failed to get ${functionName} for ${address}:`, e);
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

		console.log(`✅ Recorded currency: ${data.symbol} (${address}) on chain ${chainId} [${data.tokenType || "underlying"}]`);
	} catch (error) {
		console.error(`❌ Failed to record currency ${data.symbol}:`, error);
	}
}

export async function handleTokenMappingRegistered({ event, context }: any) {
	try {
		const { sourceChainId, sourceToken, targetChainId, syntheticToken, symbol } = event.args;
		const { client, db } = context;
		const timestamp = Number(event.block.timestamp);

		if (!client) throw new Error('Client context is null or undefined');
		if (!db) throw new Error('Database context is null or undefined');
		if (!event.transaction?.hash) throw new Error('Transaction hash is missing');

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
			console.log(`✅ Stored/updated token mapping: ${symbol} from chain ${sourceChainId} to ${targetChainId}`);

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
			console.error('Token mapping insertion failed:', error);
			throw new Error(`Failed to insert token mapping: ${(error as Error).message}`);
		}
	} catch (error) {
		console.error('TokenMappingRegistered handler error:', error);
		throw error;
	}
}

export async function handleTokenMappingUpdated({ event, context }: any) {
	try {
		const { sourceChainId, sourceToken, targetChainId, newSynthetic } = event.args;
		const db = context.db;
		const timestamp = Number(event.block.timestamp);

		if (!db) throw new Error('Database context is null or undefined');
		if (!event.transaction?.hash) throw new Error('Transaction hash is missing');

		// Exclude cross-chain mappings - only process local chain mappings
		const sourceChainIdNum = Number(sourceChainId);
		const targetChainIdNum = Number(targetChainId);

		if (!shouldProcessTokenMapping(sourceChainIdNum, targetChainIdNum)) {
			console.log(`⏭️  Skipping cross-chain token mapping update: from chain ${sourceChainId} to ${targetChainId} (filtered out)`);
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
				console.log(`✅ Updated token mapping: ${id} -> new synthetic: ${newSynthetic}`);
			} else {
				console.log(`⚠️ Token mapping not found for update: ${id}`);
			}
		} catch (error) {
			console.error('Token mapping update failed:', error);
			throw new Error(`Failed to update token mapping: ${(error as Error).message}`);
		}
	} catch (error) {
		console.error('TokenMappingUpdated handler error:', error);
		throw error;
	}
}

export async function handleTokenMappingRemoved({ event, context }: any) {
	try {
		const { sourceChainId, sourceToken, targetChainId } = event.args;
		const db = context.db;
		const timestamp = Number(event.block.timestamp);

		if (!db) throw new Error('Database context is null or undefined');
		if (!event.transaction?.hash) throw new Error('Transaction hash is missing');

		// Exclude cross-chain mappings - only process local chain mappings
		const sourceChainIdNum = Number(sourceChainId);
		const targetChainIdNum = Number(targetChainId);

		if (!shouldProcessTokenMapping(sourceChainIdNum, targetChainIdNum)) {
			console.log(`⏭️  Skipping cross-chain token mapping removal: from chain ${sourceChainId} to ${targetChainId} (filtered out)`);
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
				console.log(`✅ Deactivated token mapping: ${id}`);
			} else {
				console.log(`⚠️ Token mapping not found for removal: ${id}`);
			}
		} catch (error) {
			console.error('Token mapping removal failed:', error);
			throw new Error(`Failed to remove token mapping: ${(error as Error).message}`);
		}
	} catch (error) {
		console.error('TokenMappingRemoved handler error:', error);
		throw error;
	}
}

export async function handleTokenStatusChanged({ event, context }: any) {
	try {
		const { sourceChainId, sourceToken, targetChainId, isActive } = event.args;
		const db = context.db;
		const timestamp = Number(event.block.timestamp);

		if (!db) throw new Error('Database context is null or undefined');
		if (!event.transaction?.hash) throw new Error('Transaction hash is missing');

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
				console.log(`✅ Updated token mapping status: ${id} -> ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
			} else {
				console.log(`⚠️ Token mapping not found for status change: ${id}`);
			}
		} catch (error) {
			console.error('Token mapping status update failed:', error);
			throw new Error(`Failed to update token mapping status: ${(error as Error).message}`);
		}
	} catch (error) {
		console.error('TokenStatusChanged handler error:', error);
		throw error;
	}
}

export async function handleOwnershipTransferred({ event, context }: any) {
	try {
		const { previousOwner, newOwner } = event.args;
		const chainId = context.network.chainId;

		console.log(`TokenRegistry ownership transferred on chain ${chainId}: ${previousOwner} -> ${newOwner} at block ${event.block.number}`);
	} catch (error) {
		console.error('OwnershipTransferred handler error:', error);
		throw error;
	}
}

export async function handleInitialized({ event, context }: any) {
	try {
		const { version } = event.args;
		const chainId = context.network.chainId;

		console.log(`TokenRegistry initialized on chain ${chainId} with version ${version} at block ${event.block.number}`);
	} catch (error) {
		console.error('Initialized handler error:', error);
		throw error;
	}
}