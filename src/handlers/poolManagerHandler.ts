import { createCurrencyId, createPoolId } from "@/utils";
import dotenv from "dotenv";
import { currencies, pools } from "ponder:schema";
import { Address, getAddress } from "viem";
import { ERC20ABI } from "../../abis/ERC20";
import { createPoolCacheKey, setChainCachedData } from "../utils/redis";
import { executeIfInSync } from "../utils/syncState";
import { pushMiniTicker } from "../websocket/broadcaster";
import { createLogger, LogLabel } from "../utils/logger";

const REDIS_CACHE_TTL = parseInt(process.env.REDIS_CACHE_TTL || '2147483647');
const USE_RAW_SQL = process.env.USE_RAW_SQL === 'true';
const USE_STATIC_TOKEN_DATA = process.env.USE_STATIC_TOKEN_DATA !== 'false';

dotenv.config();

// Create logger instance for this file
const logger = createLogger('poolManagerHandler.ts');

// Static token data mapping for core chain tokens to avoid RPC calls
const STATIC_TOKEN_DATA: Record<string, { symbol: string; name: string; decimals: number }> = {
	// Actual deployed token addresses from deployments/84532.json (all lowercase for comparison)
	"0x835c8aa033972e372865fcc933c9de0a48b6ae23": {
		symbol: "gsWETH",
		name: "ScaleX Synthetic WETH",
		decimals: 18
	},
	"0x22f9a3898c3db2a0008fe9a7524a4a41d8a789df": {
		symbol: "gsUSDC",
		name: "ScaleX Synthetic USDC",
		decimals: 6
	},
	"0xadfc4fca478e6fa614724bb3177afb8a8a7b5cc6": {
		symbol: "gsWBTC",
		name: "ScaleX Synthetic WBTC",
		decimals: 8
	},
	// Regular tokens
	"0x544ab44d27fd12b48caff00c61b3c7ad3f8d8401": {
		symbol: "WETH",
		name: "Wrapped Ether",
		decimals: 18
	},
	"0xca5fffa56d6d63f72b87ce0cd4894730149cf646": {
		symbol: "USDC",
		name: "USD Coin",
		decimals: 6
	},
	"0x325f62b6d1bdacc7ad0a602dc71aae150238635b": {
		symbol: "WBTC",
		name: "Wrapped Bitcoin",
		decimals: 8
	}
};

async function fetchTokenData(client: any, address: string) {
	// Check environment variable to decide whether to use static data
	if (USE_STATIC_TOKEN_DATA) {
		const normalizedAddress = address.toLowerCase();
		const staticData = STATIC_TOKEN_DATA[normalizedAddress];

		logger.debug(`Fetching token data for ${address}: ${staticData ? 'Using static data' : 'Using RPC call'}`, LogLabel.API, 'fetchTokenData', { address, useStatic: !!staticData });

		if (staticData) {
			logger.debug(`Using static token data for ${address}: ${staticData.symbol}`, LogLabel.API, 'fetchTokenData', { address, symbol: staticData.symbol });
			return staticData;
		}
	}

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
			decimals: decimals.status === "success" ? decimals.result : 18,
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

export async function handlePoolCreated({ event, context }: any) {
	try {
		const { client, db } = context;
		const chainId = context.network.chainId;

		if (!client) throw new Error('Client context is null or undefined');
		if (!db) throw new Error('Database context is null or undefined');
		if (!chainId) throw new Error('Chain ID is missing from context');

		if (!event.args.baseCurrency) throw new Error('Missing baseCurrency in event args');
		if (!event.args.quoteCurrency) throw new Error('Missing quoteCurrency in event args');
		if (!event.args.orderBook) throw new Error('Missing orderBook in event args');

		const baseCurrency = getAddress(event.args.baseCurrency);
		const quoteCurrency = getAddress(event.args.quoteCurrency);

			// Currencies are now recorded during token registration, not pool creation
		let baseData, quoteData;
		try {
			baseData = await fetchTokenData(client, baseCurrency)
		} catch (error) {
			baseData = {
				symbol: `BASE_${baseCurrency.slice(-6)}`,
				name: `Base Token`,
				decimals: 18
			};
		}

		try {
			quoteData = await fetchTokenData(client, quoteCurrency);
		} catch (error) {
			quoteData = {
				symbol: `QUOTE_${quoteCurrency.slice(-6)}`,
				name: `Quote Token`,
				decimals: 18
			};
		}

		const coin = `${baseData.symbol}/${quoteData.symbol}`;
		const orderBook = getAddress(event.args.orderBook);
		const poolId = createPoolId(chainId, orderBook);

		const timestamp = Number(event.block.timestamp);
		const poolData = {
			id: poolId,
			chainId,
			coin,
			orderBook,
			baseCurrency,
			quoteCurrency,
			baseDecimals: baseData.decimals,
			quoteDecimals: quoteData.decimals,
			volume: BigInt(0),
			volumeInQuote: BigInt(0),
			price: BigInt(0),
			timestamp,
		};

		try {
			await context.db
				.insert(pools)
				.values(poolData)
				.onConflictDoNothing();
		} catch (error) {
			throw new Error(`Failed to insert pool: ${(error as Error).message}`);
		}

		try {
			const cacheKey = createPoolCacheKey(orderBook, chainId);
			await setChainCachedData(cacheKey, poolData, chainId, REDIS_CACHE_TTL, Number(event.block.number), 'handlePoolCreated');
		} catch (error) {
			// Silently handle caching errors
		}

		try {
			await executeIfInSync(Number(event.block.number), async () => {
				const symbol = coin.replace("/", "").toLowerCase();
				try {
					pushMiniTicker(symbol, "0", "0", "0", "0");
				} catch (error) {
					throw new Error(`Failed to push MiniTicker: ${(error as Error).message}`);
				}
			}, 'handlePoolCreated');
		} catch (error) {
			throw new Error(`executeIfInSync failed: ${(error as Error).message}`);
		}

	} catch (error) {
		throw error;
	}
}
