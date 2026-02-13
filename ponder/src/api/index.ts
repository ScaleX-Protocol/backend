import { initializeEventPublisher } from "@/events";
import { initIORedisClient } from "@/utils/redis";
import { getWalletNameByAddress } from "@/utils/walletMapper";
import dotenv from "dotenv";
import { Hono } from "hono";
import { and, asc, client, desc, eq, graphql, gt, gte, inArray, lte, or, sql } from "ponder";
import { db } from "ponder:api";
import schema, {
	agentCircuitBreakers,
	agentInstallations,
	agentLendingEvents,
	agentPolicyViolations,
	agentStats,
	assetConfigurations,
	balances,
	chainBalanceDeposits,
	currencies,
	dailyBuckets,
	deposits,
	fiveMinuteBuckets,
	hourBuckets,
	hyperlaneMessages,
	indexerStatus,
	interestRateParameters,
	lendingEvents,
	lendingPositions,
	lockEvents,
	minuteBuckets,
	orderBookDepth,
	orderBookTrades,
	orders,
	poolLendingStats,
	pools,
	thirtyMinuteBuckets,
	tokenMappings,
	unlockEvents,
	withdrawals
} from "ponder:schema";
import { createPublicClient, http } from "viem";
import { base, baseSepolia, mainnet, sepolia } from "viem/chains";
import { systemMonitor } from "../utils/systemMonitor";

dotenv.config();

const app = new Hono();

// Formatting helper functions
function formatAmount(rawAmount: string | bigint, decimals: number): string {
	const amount = Number(rawAmount) / Math.pow(10, decimals);

	// For very small amounts (< 0.01), show more precision
	if (amount < 0.01 && amount > 0) {
		return amount.toLocaleString('en-US', {
			minimumFractionDigits: 6,
			maximumFractionDigits: 6
		});
	}

	// For normal amounts, show 2-6 decimal places
	return amount.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 6
	});
}

function formatUSD(value: string | bigint, decimals: number): string {
	const amount = Number(value) / Math.pow(10, decimals);
	return `$${amount.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;
}

function formatAPY(apyDecimal: string | number): string {
	const apy = Number(apyDecimal);
	// Input is already in basis points (e.g., 150 = 1.5%), so divide by 100
	return `${(apy / 100).toFixed(1)}%`;
}

function formatSymbol(symbol: string): string {
	// Convert synthetic token symbols to clean underlying symbols
	if (symbol.startsWith('gs')) {
		return symbol.substring(2);
	}
	return symbol;
}

// Format USD with price conversion
// Price decimals depend on the quote currency decimals in the pool
function formatUSDWithPrice(value: string | bigint, tokenDecimals: number, price: number, quoteDecimals: number): string {
	const amount = Number(value) / Math.pow(10, tokenDecimals);
	const usdValue = amount * (price / Math.pow(10, quoteDecimals));
	return `$${usdValue.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;
}

// Helper function to fetch token prices from pools
// Maps underlying tokens (WETH) to their synthetic counterparts (gsWETH) to find pool prices
async function getTokenPricesFromTrades(tokenAddresses: string[], chainId: number): Promise<Map<string, { price: bigint, quoteDecimals: number }>> {
	const priceMap = new Map<string, { price: bigint, quoteDecimals: number }>();

	if (tokenAddresses.length === 0) return priceMap;

	try {
		// Get all currencies with their decimals
		const allCurrencies = await db
			.select({
				address: currencies.address,
				decimals: currencies.decimals,
				underlyingAddress: currencies.underlyingTokenAddress,
				tokenType: currencies.tokenType,
			})
			.from(currencies)
			.where(eq(currencies.chainId, chainId))
			.execute();

		// Create underlying -> synthetic mapping and address -> decimals mapping
		const underlyingToSynthetic = new Map<string, string>();
		const addressToDecimals = new Map<string, number>();

		for (const currency of allCurrencies) {
			if (currency.decimals) {
				addressToDecimals.set(currency.address.toLowerCase(), currency.decimals);
			}
			if (currency.tokenType === "synthetic" && currency.underlyingAddress) {
				underlyingToSynthetic.set(
					currency.underlyingAddress.toLowerCase(),
					currency.address.toLowerCase()
				);
			}
		}

		// Get all pools with their prices
		const poolsData = await db
			.select({
				id: pools.id,
				baseCurrency: pools.baseCurrency,
				quoteCurrency: pools.quoteCurrency,
				price: pools.price,
			})
			.from(pools)
			.where(eq(pools.chainId, chainId))
			.execute();

		// Map pool prices to underlying tokens
		for (const pool of poolsData) {
			// Get actual quote decimals from currencies table
			const quoteDecimals = addressToDecimals.get(pool.quoteCurrency.toLowerCase()) || 6;

			if (pool.price && pool.price > 0n) {
				const syntheticBaseAddr = pool.baseCurrency.toLowerCase();

				// Find the underlying token for this synthetic base currency
				const underlyingAddr = [...underlyingToSynthetic.entries()]
					.find(([_, synthetic]) => synthetic === syntheticBaseAddr)?.[0];

				if (underlyingAddr && !priceMap.has(underlyingAddr)) {
					priceMap.set(underlyingAddr, {
						price: pool.price,
						quoteDecimals: quoteDecimals
					});
				}
			}
		}

		// For stablecoins (quote currencies), set price to 1 USD
		for (const tokenAddr of tokenAddresses) {
			const tokenLower = tokenAddr.toLowerCase();
			if (!priceMap.has(tokenLower)) {
				// Get synthetic token for this underlying
				const syntheticAddr = underlyingToSynthetic.get(tokenLower);
				if (syntheticAddr) {
					// Check if this synthetic is used as quote currency in any pool
					const poolWithToken = poolsData.find(p => p.quoteCurrency.toLowerCase() === syntheticAddr);
					if (poolWithToken) {
						const quoteDecimals = addressToDecimals.get(syntheticAddr) || 6;
						// Stablecoin = $1 (price in its own decimals)
						priceMap.set(tokenLower, {
							price: BigInt(Math.pow(10, quoteDecimals)),
							quoteDecimals: quoteDecimals
						});
					}
				}
			}
		}
	} catch (error) {
		console.error("Error fetching token prices:", error);
	}

	return priceMap;
}

// Helper function to fetch multiple token information at once
async function getMultipleTokenInfo(tokenAddresses: string[], chainId?: number) {
	try {
		const tokenInfoMap = new Map();

		if (tokenAddresses.length === 0) return tokenInfoMap;

		const tokenInfos = await db
			.select({
				address: currencies.address,
				symbol: currencies.symbol,
				name: currencies.name,
				decimals: currencies.decimals,
			})
			.from(currencies)
			.where(and(
				inArray(currencies.address, tokenAddresses as `0x${string}`[]),
				chainId ? eq(currencies.chainId, chainId) : sql`1=1`
			))
			.execute();

		tokenInfos.forEach(info => {
			tokenInfoMap.set(info.address.toLowerCase(), info);
		});

		return tokenInfoMap;
	} catch (error) {
		console.error("Error fetching multiple token info:", error);
		return new Map();
	}
}

// ERC20 balanceOf ABI for viem
const erc20BalanceOfABI = [
	{
		inputs: [
			{
				internalType: "address",
				name: "account",
				type: "address",
			},
		],
		name: "balanceOf",
		outputs: [
			{
				internalType: "uint256",
				name: "",
				type: "uint256",
			},
		],
		stateMutability: "view",
		type: "function",
	},
] as const;


// Helper function to create or get Viem client for a chain
function getViemClient() {
	const envChainId = Number(process.env.CHAIN_ID);

	// Determine the correct chain and RPC URL based on CHAIN_ID
	let client;

	switch (envChainId) {
		case 84532: // Base Sepolia
			client = createPublicClient({
				chain: baseSepolia,
				transport: http("https://sepolia.base.org"),
			});
			break;
		case 8453: // Base Mainnet
			client = createPublicClient({
				chain: base, // Need to import base for this
				transport: http("https://mainnet.base.org"),
			});
			break;
		case 1: // Ethereum Mainnet
			client = createPublicClient({
				chain: mainnet, // Need to import mainnet for this
				transport: http("https://eth.llamarpc.com"),
			});
			break;
		case 11155111: // Sepolia Testnet
			client = createPublicClient({
				chain: sepolia, // Need to import sepolia for this
				transport: http("https://sepolia.llamarpc.com"),
			});
			break;
		default:
			throw new Error(`Unsupported CHAIN_ID: ${envChainId}. Please add support for this chain.`);
	}

	return client;
}

// Helper function to fetch ERC20 balance using Viem
async function getERC20Balance(userAddress: `0x${string}`, tokenAddress: `0x${string}`, chainId?: number): Promise<string> {
	try {
		const client = getViemClient();
		const balance = await client.readContract({
			address: tokenAddress,
			abi: erc20BalanceOfABI,
			functionName: "balanceOf",
			args: [userAddress],
		});
		return balance.toString();
	} catch (error) {
		console.error(`Error fetching ERC20 balance for ${tokenAddress}:`, error);
		return "0";
	}
}

// Helper function to fetch native balance using Viem
async function getNativeBalance(userAddress: `0x${string}`, chainId?: number): Promise<string> {
	try {
		const client = getViemClient();
		const balance = await client.getBalance({ address: userAddress });
		return balance.toString();
	} catch (error) {
		console.error(`Error fetching native balance for ${userAddress}:`, error);
		return "0";
	}
}

// Real-time Interest Calculation Functions (based on LendingManager.sol logic)

/**
 * Constants matching the smart contract
 */
const SECONDS_PER_YEAR = 31536000; // 365 days
const BASIS_POINTS = 10000; // 100%

/**
 * Calculate utilization rate based on smart contract logic
 * utilizationRate = (totalBorrowed * BASIS_POINTS) / totalLiquidity
 */
function calculateUtilizationRate(totalBorrowed: bigint, totalLiquidity: bigint): number {
	if (totalLiquidity === 0n) return 0;
	return Number((totalBorrowed * BigInt(BASIS_POINTS)) / totalLiquidity);
}

/**
 * Calculate borrow rate based on utilization and interest rate parameters
 * Replicates the _calculateBorrowRate function from LendingManager.sol
 */
function calculateBorrowRate(
	utilizationRate: number,
	baseRate: number,
	optimalUtilization: number,
	rateSlope1: number,
	rateSlope2: number
): number {
	// Use default parameters if not properly initialized
	if (optimalUtilization === 0) {
		optimalUtilization = 8000; // 80% default
		baseRate = 200; // 2% default
		rateSlope1 = 1000; // 10% default
		rateSlope2 = 2000; // 20% default
	}

	if (utilizationRate <= optimalUtilization) {
		return baseRate + (utilizationRate * rateSlope1) / optimalUtilization;
	} else {
		const excessUtilization = utilizationRate - optimalUtilization;
		const denominator = BASIS_POINTS - optimalUtilization;
		if (denominator === 0) {
			return baseRate + rateSlope1; // Fallback
		}
		const excessRate = (excessUtilization * rateSlope2) / denominator;
		return baseRate + rateSlope1 + excessRate;
	}
}

/**
 * Calculate supply rate from borrow rate
 * supplyRate = (borrowRate * utilizationRate * (1 - reserveFactor)) / BASIS_POINTS
 */
function calculateSupplyRate(
	borrowRate: number,
	utilizationRate: number,
	reserveFactor: number
): number {
	if (utilizationRate === 0) return 0;
	return (borrowRate * utilizationRate * (BASIS_POINTS - reserveFactor)) / (BASIS_POINTS * BASIS_POINTS);
}

/**
 * Calculate projected interest accrual over time period
 * interest = (principal * rate * timeDelta) / (SECONDS_PER_YEAR * BASIS_POINTS)
 */
function calculateProjectedInterest(
	principal: bigint,
	rate: number,
	timeInSeconds: number
): bigint {
	if (principal === 0n || rate === 0 || timeInSeconds <= 0) return 0n;
	// Round rate to integer since it can be a decimal from calculateSupplyRate
	const roundedRate = Math.round(rate);
	return (principal * BigInt(roundedRate) * BigInt(timeInSeconds)) / (BigInt(SECONDS_PER_YEAR) * BigInt(BASIS_POINTS));
}

/**
 * Calculate APY from rate (in basis points)
 */
function calculateAPY(rate: number): number {
	return rate; // Already in basis points (APY in basis points)
}

/**
 * Calculate APR from APY (compounded annually)
 * APR = (1 + APY/100)^(1/365) - 1 in basis points
 */
function calculateAPR(apy: number): number {
	const apyDecimal = apy / 10000; // Convert basis points to decimal
	const aprDecimal = Math.pow(1 + apyDecimal, 1 / 365) - 1;
	return Math.round(aprDecimal * 10000); // Convert back to basis points
}

/**
 * Get real-time lending rates with projections
 * This function combines pool stats with real-time calculations
 */
async function getRealTimeLendingRates(
	tokenAddress: string,
	totalLiquidity: bigint,
	totalBorrowed: bigint,
	interestRateParams: any,
	assetConfig: any
) {
	// Calculate utilization rate
	const utilizationRate = calculateUtilizationRate(totalBorrowed, totalLiquidity);

	// Calculate borrow rate using smart contract logic
	const borrowRateBP = calculateBorrowRate(
		utilizationRate,
		interestRateParams?.baseRate || 200, // 2% default
		interestRateParams?.optimalUtilization || 8000, // 80% default
		interestRateParams?.rateSlope1 || 1000, // 10% default
		interestRateParams?.rateSlope2 || 2000 // 20% default
	);

	// Calculate supply rate
	const supplyRateBP = calculateSupplyRate(
		borrowRateBP,
		utilizationRate,
		assetConfig?.reserveFactor || 1000 // 10% default
	);

	// Calculate APYs
	const borrowAPY = calculateAPY(borrowRateBP);
	const supplyAPY = calculateAPY(supplyRateBP);

	// Calculate APRs
	const borrowAPR = calculateAPR(borrowAPY);
	const supplyAPR = calculateAPR(supplyAPY);

	return {
		utilizationRate,
		borrowRate: borrowRateBP,
		supplyRate: supplyRateBP,
		borrowAPY,
		supplyAPY,
		borrowAPR,
		supplyAPR,
		// Projections for different time periods
		projections: {
			hourly: {
				borrowInterest: calculateProjectedInterest(totalBorrowed, borrowRateBP, 3600), // 1 hour
				supplyEarnings: calculateProjectedInterest(totalLiquidity, supplyRateBP, 3600)
			},
			daily: {
				borrowInterest: calculateProjectedInterest(totalBorrowed, borrowRateBP, 86400), // 1 day
				supplyEarnings: calculateProjectedInterest(totalLiquidity, supplyRateBP, 86400)
			},
			weekly: {
				borrowInterest: calculateProjectedInterest(totalBorrowed, borrowRateBP, 604800), // 1 week
				supplyEarnings: calculateProjectedInterest(totalLiquidity, supplyRateBP, 604800)
			},
			monthly: {
				borrowInterest: calculateProjectedInterest(totalBorrowed, borrowRateBP, 2592000), // 30 days
				supplyEarnings: calculateProjectedInterest(totalLiquidity, supplyRateBP, 2592000)
			},
			yearly: {
				borrowInterest: calculateProjectedInterest(totalBorrowed, borrowRateBP, SECONDS_PER_YEAR), // 1 year
				supplyEarnings: calculateProjectedInterest(totalLiquidity, supplyRateBP, SECONDS_PER_YEAR)
			}
		}
	};
}

// Helper function to fetch lending rates from indexed data
async function getIndexedLendingRates(tokenAddress: `0x${string}`, chainId?: number): Promise<{ supplyRate: number, borrowRate: number, utilizationRate: number }> {
	try {
		const targetChainId = chainId || Number(process.env.CHAIN_ID) || 84532;

		const poolStats = await db
			.select()
			.from(poolLendingStats)
			.where(and(
				eq(poolLendingStats.token, tokenAddress),
				eq(poolLendingStats.chainId, targetChainId)
			))
			.execute();

		if (poolStats.length > 0) {
			const stats = poolStats[0]!;
			return {
				supplyRate: Number(stats.supplyRate || 0),
				borrowRate: Number(stats.borrowRate || 0),
				utilizationRate: Number(stats.utilizationRate || 0)
			};
		}

		console.warn(`No pool stats found for token ${tokenAddress} on chain ${targetChainId}`);
		return { supplyRate: 0, borrowRate: 0, utilizationRate: 0 };
	} catch (error) {
		console.error(`Error fetching indexed rates for ${tokenAddress}:`, error);
		return { supplyRate: 0, borrowRate: 0, utilizationRate: 0 };
	}
}

app.use("/sql/*", client({ db, schema }));

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

type BinanceKlineData = [
	number, // Open time
	string, // Open price
	string, // High price
	string, // Low price
	string, // Close price
	string, // Volume (base asset)
	number, // Close time
	string, // Quote asset volume
	number, // Number of trades
	string, // Taker buy base asset volume
	string, // Taker buy quote asset volume
	string, // Unused field (ignored)
];

// Interface for our bucket data
interface BucketData {
	id: string;
	openTime: number;
	closeTime: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	quoteVolume: number;
	average: number;
	count: number;
	takerBuyBaseVolume: number;
	takerBuyQuoteVolume: number;
	poolId: string;
}

type IntervalType = "1m" | "5m" | "30m" | "1h" | "1d";

app.get("/api/kline", async c => {
	const symbol = c.req.query("symbol");
	const interval = c.req.query("interval") || "1m";
	const startTime = parseInt(c.req.query("startTime") || "0");
	const endTime = parseInt(c.req.query("endTime") || Date.now().toString());
	const limit = parseInt(c.req.query("limit") || "1000");

	if (!symbol) {
		return c.json({ error: "Symbol parameter is required" }, 400);
	}

	const queriedPools = await db.select().from(pools).where(eq(pools.coin, symbol)).orderBy(desc(pools.timestamp));

	if (!queriedPools || queriedPools.length === 0) {
		return c.json({ error: "Pool not found" }, 404);
	}

	const intervalTableMap = {
		"1m": minuteBuckets,
		"5m": fiveMinuteBuckets,
		"30m": thirtyMinuteBuckets,
		"1h": hourBuckets,
		"1d": dailyBuckets,
	};

	const bucketTable = intervalTableMap[interval as IntervalType] || minuteBuckets;

	try {
		const poolId = queriedPools[0]?.orderBook;

		const klineData = await db
			.select()
			.from(bucketTable)
			.where(
				and(
					eq(bucketTable.poolId, poolId),
					gte(bucketTable.openTime, Math.floor(startTime / 1000)),
					lte(bucketTable.openTime, Math.floor(endTime / 1000))
				)
			)
			.orderBy(bucketTable.openTime)
			.limit(limit)
			.execute();

		const formattedData = klineData.map((bucket: BucketData) => formatKlineData(bucket));

		return c.json(formattedData);
	} catch (error) {
		return c.json({ error: `Failed to fetch kline data: ${error}` }, 500);
	}
});

// Sync status endpoint - returns indexer sync status vs chain head
app.get("/api/sync-status", async c => {
	try {
		const client = getViemClient();
		const chainId = Number(process.env.CHAIN_ID);

		// Get latest block from chain
		const latestBlock = await client.getBlock();

		// Get indexer status (single row per chain)
		const status = await db.select()
			.from(indexerStatus)
			.where(eq(indexerStatus.id, chainId))
			.limit(1)
			.execute();

		const indexerData = status[0];
		const indexedTimestamp = indexerData?.latestBlockTimestamp ?? 0;
		const indexedBlockNumber = indexerData?.latestBlockNumber ? Number(indexerData.latestBlockNumber) : 0;
		const lastEventName = indexerData?.latestEventName || null;
		const recentEvents = indexerData?.recentEvents || [];

		const chainTimestamp = Number(latestBlock.timestamp);
		const chainBlockNumber = Number(latestBlock.number);

		const lagSeconds = chainTimestamp - indexedTimestamp;
		const lagBlocks = chainBlockNumber - indexedBlockNumber;

		return c.json({
			indexed: {
				timestamp: indexedTimestamp,
				blockNumber: indexedBlockNumber,
				time: indexedTimestamp > 0 ? new Date(indexedTimestamp * 1000).toISOString() : null,
				lastEvent: lastEventName
			},
			chain: {
				timestamp: chainTimestamp,
				blockNumber: chainBlockNumber,
				time: new Date(chainTimestamp * 1000).toISOString()
			},
			lag: {
				seconds: lagSeconds,
				blocks: lagBlocks,
				formatted: lagSeconds > 60
					? `${Math.floor(lagSeconds / 60)}m ${lagSeconds % 60}s`
					: `${lagSeconds}s`
			},
			isSynced: lagSeconds < 30,
			chainId: chainId,
			recentEvents: recentEvents.slice(0, 10).map((e: any) => ({
				blockNumber: Number(e.blockNumber),
				blockTimestamp: e.blockTimestamp,
				eventName: e.eventName,
				time: new Date(e.blockTimestamp * 1000).toISOString()
			}))
		});
	} catch (error) {
		return c.json({ error: `Failed to fetch sync status: ${error}` }, 500);
	}
});

app.get("/api/depth", async c => {
	const symbol = c.req.query("symbol");
	const limit = parseInt(c.req.query("limit") || "100");

	if (!symbol) {
		return c.json({ error: "Symbol parameter is required" }, 400);
	}

	try {
		const queriedPools = await db.select().from(pools).where(eq(pools.coin, symbol)).orderBy(desc(pools.timestamp));

		if (!queriedPools || queriedPools.length === 0) {
			return c.json({ error: "Pool not found" }, 404);
		}

		const poolId = queriedPools[0]?.orderBook;

		if (!poolId) {
			return c.json({ error: "Pool order book address not found" }, 404);
		}

		// Use the new util common service for bids and asks
		// Bids: Buy, OPEN or PARTIALLY_FILLED, price desc
		const bids = await db
			.select({
				price: orders.price,
				quantity: sql`SUM(${orders.quantity})`.as("quantity"),
				filled: sql`SUM(${orders.filled})`.as("filled"),
			})
			.from(orders)
			.where(
				and(
					gt(orders.price, 0),
					gt(orders.quantity, 0),
					eq(orders.poolId, poolId),
					eq(orders.side, "Buy"),
					or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
				)
			)
			.groupBy(orders.price)
			.orderBy(desc(orders.price))
			.limit(limit)
			.execute();

		// Asks: Sell, OPEN or PARTIALLY_FILLED, price asc
		const asks = await db
			.select({
				price: orders.price,
				quantity: sql`SUM(${orders.quantity})`.as("quantity"),
				filled: sql`SUM(${orders.filled})`.as("filled"),
			})
			.from(orders)
			.where(
				and(
					gt(orders.price, 0),
					gt(orders.quantity, 0),
					eq(orders.poolId, poolId),
					eq(orders.side, "Sell"),
					or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
				)
			)
			.orderBy(asc(orders.price))
			.groupBy(orders.price)
			.limit(limit)
			.execute();

		const response = {
			lastUpdateId: Date.now(),
			bids: bids.map((o: any) => [o.price.toString(), (o.quantity - o.filled).toString()]),
			asks: asks.map((o: any) => [o.price.toString(), (o.quantity - o.filled).toString()])
		};

		return c.json(response);
	} catch (error) {
		return c.json({ error: `Failed to fetch depth data: ${error}` }, 500);
	}
});

app.get("/api/depth-orders", async c => {
	const symbol = c.req.query("symbol");
	const limit = parseInt(c.req.query("limit") || "100");

	if (!symbol) {
		return c.json({ error: "Symbol parameter is required" }, 400);
	}

	try {
		const queriedPools = await db.select().from(pools).where(eq(pools.coin, symbol)).orderBy(desc(pools.timestamp));

		if (!queriedPools || queriedPools.length === 0) {
			return c.json({ error: "Pool not found" }, 404);
		}

		const poolId = queriedPools[0]?.orderBook;

		if (!poolId) {
			return c.json({ error: "Pool order book address not found" }, 404);
		}

		// Get all active orders grouped by price (bids)
		const bidOrders = await db
			.select({
				price: orders.price,
				quantity: sql`SUM(${orders.quantity})`.as("quantity"),
				filled: sql`SUM(${orders.filled})`.as("filled")
			})
			.from(orders)
			.where(
				and(
					gt(orders.price, 0),
					gt(orders.quantity, 0),
					eq(orders.poolId, poolId),
					eq(orders.side, "Buy"),
					or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
				)
			)
			.groupBy(orders.price)
			.orderBy(desc(orders.price))
			.limit(limit)
			.execute();

		// Get all active orders grouped by price (asks)
		const askOrders = await db
			.select({
				price: orders.price,
				quantity: sql`SUM(${orders.quantity})`.as("quantity"),
				filled: sql`SUM(${orders.filled})`.as("filled")
			})
			.from(orders)
			.where(
				and(
					gt(orders.price, 0),
					gt(orders.quantity, 0),
					eq(orders.poolId, poolId),
					eq(orders.side, "Sell"),
					or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
				)
			)
			.groupBy(orders.price)
			.orderBy(asc(orders.price))
			.limit(limit)
			.execute();

		// Get individual orders for each price level
		const bidPriceLevels = bidOrders.map(bid => bid.price.toString());
		const askPriceLevels = askOrders.map(ask => ask.price.toString());

		const [individualBids, individualAsks] = await Promise.all([
			// Get all individual bid orders
			bidPriceLevels.length > 0 ? db
				.select()
				.from(orders)
				.where(
					and(
						gt(orders.price, 0),
						gt(orders.quantity, 0),
						eq(orders.poolId, poolId),
						eq(orders.side, "Buy"),
						or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED")),
						inArray(orders.price, bidPriceLevels)
					)
				)
				.execute() : [],

			// Get all individual ask orders
			// Filter out invalid orders (price=0, quantity=0)
			askPriceLevels.length > 0 ? db
				.select()
				.from(orders)
				.where(
					and(
						gt(orders.price, 0),
						gt(orders.quantity, 0),
						eq(orders.poolId, poolId),
						eq(orders.side, "Sell"),
						or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED")),
						inArray(orders.price, askPriceLevels)
					)
				)
				.execute() : []
		]);

		// Group individual orders by price
		const bidsByPrice = new Map<string, any[]>();
		individualBids.forEach(order => {
			const price = order.price.toString();
			if (!bidsByPrice.has(price)) {
				bidsByPrice.set(price, []);
			}
			bidsByPrice.get(price)!.push({
				orderId: order.orderId.toString(),
				user: order.userAddress,
				price: price,
				quantity: order.quantity.toString(),
				filled: order.filled.toString(),
				remaining: (BigInt(order.quantity) - BigInt(order.filled)).toString(),
				status: order.status,
				type: order.type,
				timestamp: Number(order.timestamp) * 1000,
				side: order.side.toLowerCase(),
				tag: getWalletNameByAddress(order.userAddress)
			});
		});

		const asksByPrice = new Map<string, any[]>();
		individualAsks.forEach(order => {
			const price = order.price.toString();
			if (!asksByPrice.has(price)) {
				asksByPrice.set(price, []);
			}
			asksByPrice.get(price)!.push({
				orderId: order.orderId.toString(),
				user: order.userAddress,
				price: price,
				quantity: order.quantity.toString(),
				filled: order.filled.toString(),
				remaining: (BigInt(order.quantity) - BigInt(order.filled)).toString(),
				status: order.status,
				type: order.type,
				timestamp: Number(order.timestamp) * 1000,
				side: order.side.toLowerCase(),
				tag: getWalletNameByAddress(order.userAddress)
			});
		});

		// Format grouped orders to match depth endpoint structure
		const formatGroupedOrders = (groupedOrders: any[], ordersByPrice: Map<string, any[]>) =>
			groupedOrders.map(group => ({
				price: group.price.toString(),
				quantity: (BigInt(group.quantity) - BigInt(group.filled)).toString(),
				orders: ordersByPrice.get(group.price.toString()) || []
			}));

		const formattedBids = formatGroupedOrders(bidOrders, bidsByPrice);
		const formattedAsks = formatGroupedOrders(askOrders, asksByPrice);

		// Count orders by wallet type
		const walletSummary: { [key: string]: number } = {};
		const allOrders = [...individualBids, ...individualAsks];

		for (const order of allOrders) {
			const walletTag = getWalletNameByAddress(order.userAddress);
			walletSummary[walletTag] = (walletSummary[walletTag] || 0) + 1;
		}

		// Count individual orders (not price levels) for accurate totals
		const totalBidOrders = individualBids.length;
		const totalAskOrders = individualAsks.length;

		const response = {
			lastUpdateId: Date.now(),
			symbol: symbol,
			poolId: poolId,
			bids: formattedBids,
			asks: formattedAsks,
			summary: {
				totalBidOrders: totalBidOrders,
				totalAskOrders: totalAskOrders,
				totalBidQuantity: formattedBids.reduce((sum: bigint, level: any) => sum + BigInt(level.quantity), 0n).toString(),
				totalAskQuantity: formattedAsks.reduce((sum: bigint, level: any) => sum + BigInt(level.quantity), 0n).toString(),
				highestBid: formattedBids.length > 0 ? formattedBids[0]?.price : "0",
				lowestAsk: formattedAsks.length > 0 ? formattedAsks[0]?.price : "0",
				walletSummary: walletSummary
			}
		};

		return c.json(response);
	} catch (error) {
		return c.json({ error: `Failed to fetch depth orders: ${error}` }, 500);
	}
});

app.get("/api/trades", async c => {
	const symbol = c.req.query("symbol");
	const limit = parseInt(c.req.query("limit") || "500");
	const user = c.req.query("user");
	const orderBy = c.req.query("orderBy") || "desc"; // "asc" for FIFO, "desc" for recent first

	if (!symbol) {
		return c.json({ error: "Symbol parameter is required" }, 400);
	}

	try {
		const queriedPools = await db.select().from(pools).where(eq(pools.coin, symbol)).orderBy(desc(pools.timestamp));

		if (!queriedPools || queriedPools.length === 0) {
			return c.json({ error: "Pool not found" }, 404);
		}

		const poolId = queriedPools[0]?.orderBook;

		if (!poolId) {
			return c.json({ error: "Pool order book address not found" }, 404);
		}

		let recentTrades;

		if (user) {
			const timeoutPromise = new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Query timeout')), 10000)
			);

			try {
				const userTradesPromise = db
					.select({
						trade: orderBookTrades,
						order: orders,
					})
					.from(orderBookTrades)
					.innerJoin(orders, eq(orderBookTrades.poolId, orders.poolId))
					.where(and(
						eq(orderBookTrades.poolId, poolId),
						eq(orders.userAddress, user.toLowerCase())
					))
					.orderBy(desc(orderBookTrades.timestamp))
					.limit(Math.min(limit, 100))
					.execute();

				const userTrades = await Promise.race([userTradesPromise, timeoutPromise]);
				recentTrades = (userTrades as any).map((result: any) => result.trade);
			} catch (error: any) {
				if (error?.message === 'Query timeout') {
					return c.json({ error: "Query took too long, try reducing limit or use general trades endpoint" }, 408);
				}
				throw error;
			}
		} else {
			recentTrades = await db
				.select()
				.from(orderBookTrades)
				.where(eq(orderBookTrades.poolId, poolId))
				.orderBy(orderBy === "asc" ? asc(orderBookTrades.timestamp) : desc(orderBookTrades.timestamp))
				.limit(limit)
				.execute();
		}

		const formattedTrades = recentTrades.map((trade: any) => ({
			id: trade.id || "",
			price: trade.price ? trade.price.toString() : "0",
			qty: trade.quantity ? trade.quantity.toString() : "0",
			time: trade.timestamp ? trade.timestamp * 1000 : Date.now(),
			isBuyerMaker: trade.side === "Sell",
			isBestMatch: true,
		}));

		return c.json(formattedTrades);
	} catch (error) {
		return c.json({ error: `Failed to fetch trades data: ${error}` }, 500);
	}
});

app.get("/api/ticker/24hr", async c => {
	const symbol = c.req.query("symbol");

	if (!symbol) {
		return c.json({ error: "Symbol parameter is required" }, 400);
	}

	try {
		const queriedPools = await db.select().from(pools).where(eq(pools.coin, symbol)).orderBy(desc(pools.timestamp));

		if (!queriedPools || queriedPools.length === 0) {
			return c.json({ error: "Pool not found" }, 404);
		}

		const poolId = queriedPools[0]?.orderBook;

		if (!poolId) {
			return c.json({ error: "Pool order book address not found" }, 404);
		}

		const now = Math.floor(Date.now() / 1000);
		const oneDayAgo = now - 86400;

		// Execute all queries in parallel for better performance
		const [dailyStats, latestTrade, bestBids, bestAsks] = await Promise.all([
			db
				.select()
				.from(dailyBuckets)
				.where(and(eq(dailyBuckets.poolId, poolId), gte(dailyBuckets.openTime, oneDayAgo)))
				.orderBy(desc(dailyBuckets.openTime))
				.limit(1)
				.execute(),

			db
				.select()
				.from(orderBookTrades)
				.where(eq(orderBookTrades.poolId, poolId))
				.orderBy(desc(orderBookTrades.timestamp))
				.limit(1)
				.execute(),

			db
				.select()
				.from(orderBookDepth)
				.where(and(eq(orderBookDepth.poolId, poolId), eq(orderBookDepth.side, "Buy")))
				.orderBy(desc(orderBookDepth.price))
				.limit(1)
				.execute(),

			db
				.select()
				.from(orderBookDepth)
				.where(and(eq(orderBookDepth.poolId, poolId), eq(orderBookDepth.side, "Sell")))
				.orderBy(asc(orderBookDepth.price))
				.limit(1)
				.execute()
		]);

		interface DailyStats {
			open?: bigint | null;
			high?: bigint | null;
			low?: bigint | null;
			volume?: bigint | null;
			quoteVolume?: bigint | null;
			openTime?: number | null;
			count?: number | null;
			average?: bigint | null;
		}

		const stats = (dailyStats[0] || {}) as DailyStats;
		const lastPrice = latestTrade[0]?.price?.toString() || "0";

		const openPrice = stats.open?.toString() ?? "0";
		const highPrice = stats.high?.toString() ?? "0";
		const lowPrice = stats.low?.toString() ?? "0";
		const volumeValue = stats.volume?.toString() ?? "0";
		const quoteVolumeValue = stats.quoteVolume?.toString() ?? "0";
		const openTimeValue = stats.openTime ? stats.openTime * 1000 : oneDayAgo * 1000;
		const countValue = stats.count ?? 0;
		const averageValue = stats.average?.toString() ?? "0";

		const prevClosePrice = openPrice || lastPrice;

		const priceChange = (parseFloat(lastPrice) - parseFloat(prevClosePrice)).toString();
		const priceChangePercent =
			parseFloat(prevClosePrice) > 0
				? (((parseFloat(lastPrice) - parseFloat(prevClosePrice)) / parseFloat(prevClosePrice)) * 100).toFixed(2)
				: "0.00";

		const response = {
			symbol: symbol,
			priceChange: priceChange,
			priceChangePercent: priceChangePercent,
			weightedAvgPrice: averageValue,
			prevClosePrice: prevClosePrice,
			lastPrice: lastPrice,
			lastQty: latestTrade[0]?.quantity?.toString() || "0",
			bidPrice: bestBids[0]?.price?.toString() || "0",
			askPrice: bestAsks[0]?.price?.toString() || "0",
			openPrice: openPrice,
			highPrice: highPrice,
			lowPrice: lowPrice,
			volume: volumeValue,
			quoteVolume: quoteVolumeValue,
			openTime: openTimeValue,
			closeTime: now * 1000,
			firstId: "0",
			lastId: latestTrade[0]?.id || "0",
			count: countValue,
		};

		return c.json(response);
	} catch (error) {
		return c.json({ error: `Failed to fetch 24hr ticker data: ${error}` }, 500);
	}
});

app.get("/api/ticker/price", async c => {
	const symbol = c.req.query("symbol");

	if (!symbol) {
		return c.json({ error: "Symbol parameter is required" }, 400);
	}

	try {
		const queriedPools = await db.select().from(pools).where(eq(pools.coin, symbol)).orderBy(desc(pools.timestamp));

		if (!queriedPools || queriedPools.length === 0) {
			return c.json({ error: "Pool not found" }, 404);
		}

		const poolId = queriedPools[0]?.orderBook;

		if (!poolId) {
			return c.json({ error: "Pool order book address not found" }, 404);
		}

		const latestTrade = await db
			.select()
			.from(orderBookTrades)
			.where(eq(orderBookTrades.poolId, poolId))
			.orderBy(desc(orderBookTrades.timestamp))
			.limit(1)
			.execute();

		let price = "0";
		if (latestTrade.length > 0 && latestTrade[0]?.price) {
			price = latestTrade[0].price.toString();
		} else if (queriedPools[0]?.price) {
			price = queriedPools[0].price.toString();
		}

		const response = {
			symbol: symbol,
			price: price,
		};

		return c.json(response);
	} catch (error) {
		return c.json({ error: `Failed to fetch price data: ${error}` }, 500);
	}
});
app.get("/api/allOrders", async c => {
	const symbol = c.req.query("symbol");
	const limit = parseInt(c.req.query("limit") || "500");
	const address = c.req.query("address");

	if (!address) {
		return c.json({ error: "Address parameter is required" }, 400);
	}

	try {
		const baseQuery = db.select().from(orders);
		let query = baseQuery.where(eq(orders.userAddress, address as `0x${string}`));

		if (symbol) {
			const queriedPools = await db.select().from(pools).where(eq(pools.coin, symbol)).orderBy(desc(pools.timestamp));

			if (!queriedPools || queriedPools.length === 0) {
				return c.json({ error: "Pool not found" }, 404);
			}

			const poolId = queriedPools[0]?.orderBook;
			if (poolId) {
				query = baseQuery.where(and(eq(orders.userAddress, address as `0x${string}`), eq(orders.poolId, poolId)));
			}
		}

		const effectiveLimit = Math.min(limit, 1000);
		const userOrders = await query.orderBy(desc(orders.timestamp)).limit(effectiveLimit).execute();

		// Collect all unique poolIds to avoid N+1 queries
		const uniquePoolIds = [...new Set(userOrders.map(order => order.poolId).filter(Boolean))];

		// Fetch all pool data in a single query
		const poolsData = await db
			.select()
			.from(pools)
			.where(inArray(pools.orderBook, uniquePoolIds as `0x${string}`[]))
			.execute();

		// Create a map for quick lookup
		const poolsMap = new Map(poolsData.map(pool => [pool.orderBook, pool]));

		const formattedOrders = userOrders.map(order => {
			let decimals = 18;
			let orderSymbol = "UNKNOWN";

			if (order.poolId && poolsMap.has(order.poolId as `0x${string}`)) {
				const pool = poolsMap.get(order.poolId as `0x${string}`);
				if (pool?.quoteDecimals) {
					decimals = Number(pool.quoteDecimals);
				}
				if (pool?.coin) {
					orderSymbol = pool.coin;
				}
			}

			// Use the symbol from query parameter if provided and no pool symbol was found
			if (orderSymbol === "UNKNOWN" && symbol) {
				orderSymbol = symbol;
			}

			// For market orders, quantity is in quote currency but filled is in base currency
			// origQty should be base quantity, origQuoteOrderQty should be quote quantity
			const isMarketOrder = order.type === "Market";
			const filledBase = order.filled ? BigInt(order.filled) : BigInt(0);
			const orderPrice = order.price ? BigInt(order.price) : BigInt(0);

			// For market orders: quantity is quote amount, filled is base amount
			// For limit orders: both quantity and filled are in base currency
			const origQty = isMarketOrder ? filledBase.toString() : order.quantity.toString();
			const origQuoteOrderQty = isMarketOrder ? order.quantity.toString() : "0";
			const cumulativeQuoteQty = filledBase > 0n && orderPrice > 0n
				? ((filledBase * orderPrice) / BigInt(10 ** decimals)).toString()
				: "0";

			return {
				symbol: orderSymbol,
				orderId: order.orderId.toString(),
				orderListId: -1,
				clientOrderId: order.id,
				price: order.price.toString(),
				origQty,
				executedQty: order.filled.toString(),
				cumulativeQuoteQty,
				status: order.status,
				timeInForce: order.timeInForce,
				type: order.type,
				side: order.side.toUpperCase(),
				stopPrice: "0",
				icebergQty: "0",
				time: Number(order.timestamp) * 1000,
				updateTime: Number(order.timestamp) * 1000,
				isWorking: order.status === "OPEN" || order.status === "PARTIALLY_FILLED",
				origQuoteOrderQty,
			};
		});

		return c.json(formattedOrders);
	} catch (error) {
		return c.json({ error: `Failed to fetch orders: ${error}` }, 500);
	}
});

app.get("/api/openOrders", async c => {
	const symbol = c.req.query("symbol");
	const address = c.req.query("address");

	if (!address) {
		return c.json({ error: "Address parameter is required" }, 400);
	}

	try {
		const baseQuery = db.select().from(orders);
		let query = baseQuery.where(
			and(
				eq(orders.userAddress, address as `0x${string}`),
				or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
			)
		);

		if (symbol) {
			const queriedPools = await db.select().from(pools).where(eq(pools.coin, symbol)).orderBy(desc(pools.timestamp));

			if (!queriedPools || queriedPools.length === 0) {
				return c.json({ error: "Pool not found" }, 404);
			}

			const poolId = queriedPools[0]?.orderBook;
			if (poolId) {
				query = baseQuery.where(
					and(
						eq(orders.userAddress, address as `0x${string}`),
						or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED")),
						eq(orders.poolId, poolId)
					)
				);
			}
		}

		const openOrders = await query.orderBy(desc(orders.timestamp)).limit(500).execute();

		// Collect all unique poolIds to avoid N+1 queries
		const uniquePoolIds = [...new Set(openOrders.map(order => order.poolId).filter(Boolean))];

		// Fetch all pool data in a single query
		const poolsData = await db
			.select()
			.from(pools)
			.where(inArray(pools.orderBook, uniquePoolIds as `0x${string}`[]))
			.execute();

		// Create a map for quick lookup
		const poolsMap = new Map(poolsData.map(pool => [pool.orderBook, pool]));

		const formattedOrders = openOrders.map(order => {
			let orderSymbol = symbol;
			let decimals = 18;

			if (order.poolId && poolsMap.has(order.poolId as `0x${string}`)) {
				const pool = poolsMap.get(order.poolId as `0x${string}`);
				orderSymbol = pool?.coin || "UNKNOWN";
				if (pool?.quoteDecimals) {
					decimals = Number(pool.quoteDecimals);
				}
			}

			// For market orders, quantity is in quote currency but filled is in base currency
			// origQty should be base quantity, origQuoteOrderQty should be quote quantity
			const isMarketOrder = order.type === "Market";
			const filledBase = order.filled ? BigInt(order.filled) : BigInt(0);
			const orderPrice = order.price ? BigInt(order.price) : BigInt(0);

			// For market orders: quantity is quote amount, filled is base amount
			// For limit orders: both quantity and filled are in base currency
			const origQty = isMarketOrder ? filledBase.toString() : order.quantity.toString();
			const origQuoteOrderQty = isMarketOrder ? order.quantity.toString() : "0";
			const cumulativeQuoteQty = filledBase > 0n && orderPrice > 0n
				? ((filledBase * orderPrice) / BigInt(10 ** decimals)).toString()
				: "0";

			return {
				symbol: orderSymbol,
				orderId: order.orderId.toString(),
				orderListId: -1,
				clientOrderId: order.id,
				price: order.price.toString(),
				origQty,
				executedQty: order.filled.toString(),
				cumulativeQuoteQty,
				status: order.status,
				timeInForce: order.timeInForce,
				type: order.type,
				side: order.side.toUpperCase(),
				stopPrice: "0",
				icebergQty: "0",
				time: Number(order.timestamp) * 1000,
				updateTime: Number(order.timestamp) * 1000,
				isWorking: true,
				origQuoteOrderQty,
			};
		});

		return c.json(formattedOrders);
	} catch (error) {
		return c.json({ error: `Failed to fetch open orders: ${error}` }, 500);
	}
});

app.get("/api/pairs", async c => {
	try {
		const allPools = await db.select().from(pools).execute();

		const pairs = allPools.map(pool => {
			const symbol = pool.coin || "";
			const symbolParts = symbol.split("/");

			return {
				symbol: symbol.replace("/", ""),
				baseAsset: symbolParts[0] || symbol,
				quoteAsset: symbolParts[1] || "USDT",
				poolId: pool.id,
				baseDecimals: pool.baseDecimals,
				quoteDecimals: pool.quoteDecimals,
			};
		});

		return c.json(pairs);
	} catch (error) {
		return c.json({ error: `Failed to fetch pairs data: ${error}` }, 500);
	}
});


app.get("/api/pairs", async c => {
	try {
		const allPools = await db.select().from(pools).execute();

		const pairs = allPools.map(pool => {
			const symbol = pool.coin || "";
			const symbolParts = symbol.split("/");

			return {
				symbol: symbol.replace("/", ""),
				baseAsset: symbolParts[0] || symbol,
				quoteAsset: symbolParts[1] || "USDT",
				poolId: pool.id,
				baseDecimals: pool.baseDecimals,
				quoteDecimals: pool.quoteDecimals,
			};
		});

		return c.json(pairs);
	} catch (error) {
		return c.json({ error: `Failed to fetch pairs data: ${error}` }, 500);
	}
});

app.get("/api/markets", async c => {
	try {
		const allPools = await db.select().from(pools).execute();

		const pairs = await Promise.all(allPools.map(async pool => {
			const symbol = pool.coin || "";
			const symbolParts = symbol.split("/");

			// Calculate market age in seconds
			const currentTime = Math.floor(Date.now() / 1000);
			const marketAge = pool.timestamp ? currentTime - pool.timestamp : 0;

			// Calculate liquidity from order book depth (separate buy and sell sides)
			let bidLiquidity = "0";
			let askLiquidity = "0";
			let totalLiquidityInQuote = "0";

			if (pool.orderBook) {
				// Get bid side liquidity (Buy orders - in base asset)
				const bidData = await db
					.select({
						totalQuantity: sql`SUM(${orderBookDepth.quantity})`.as("totalQuantity")
					})
					.from(orderBookDepth)
					.where(and(
						eq(orderBookDepth.poolId, pool.orderBook as `0x${string}`),
						eq(orderBookDepth.side, "Buy")
					))
					.execute();

				bidLiquidity = bidData[0]?.totalQuantity?.toString() || "0";

				// Get ask side liquidity (Sell orders - in base asset)
				const askData = await db
					.select({
						totalQuantity: sql`SUM(${orderBookDepth.quantity})`.as("totalQuantity")
					})
					.from(orderBookDepth)
					.where(and(
						eq(orderBookDepth.poolId, pool.orderBook as `0x${string}`),
						eq(orderBookDepth.side, "Sell")
					))
					.execute();

				askLiquidity = askData[0]?.totalQuantity?.toString() || "0";

				// Calculate total liquidity in quote asset (sum of bid_quantity * price for buy orders)
				const quoteLiquidityData = await db
					.select({
						totalValue: sql`SUM(${orderBookDepth.quantity} * ${orderBookDepth.price})`.as("totalValue")
					})
					.from(orderBookDepth)
					.where(and(
						eq(orderBookDepth.poolId, pool.orderBook as `0x${string}`),
						eq(orderBookDepth.side, "Buy")
					))
					.execute();

				totalLiquidityInQuote = quoteLiquidityData[0]?.totalValue?.toString() || "0";
			}

			return {
				symbol: symbol.replace("/", ""),
				baseAsset: symbolParts[0] || symbol,
				quoteAsset: symbolParts[1] || "USDT",
				poolId: pool.id,
				baseDecimals: pool.baseDecimals,
				quoteDecimals: pool.quoteDecimals,
				volume: pool.volume?.toString() || "0",
				volumeInQuote: pool.volumeInQuote?.toString() || "0",
				latestPrice: pool.price?.toString() || "0",
				age: marketAge,
				bidLiquidity: bidLiquidity,
				askLiquidity: askLiquidity,
				totalLiquidityInQuote: totalLiquidityInQuote,
				createdAt: pool.timestamp,
			};
		}));

		return c.json(pairs);
	} catch (error) {
		return c.json({ error: `Failed to fetch pairs data: ${error}` }, 500);
	}
});

app.get("/api/cross-chain-deposits", async c => {
	const user = c.req.query("user");
	const status = c.req.query("status");
	const limit = parseInt(c.req.query("limit") || "100");

	if (!user) {
		return c.json({ error: "User parameter is required" }, 400);
	}

	try {
		// Step 1: Find all ChainBalanceManager deposits for the user
		const deposits = await db
			.select()
			.from(chainBalanceDeposits)
			.where(eq(chainBalanceDeposits.recipient, user as `0x${string}`))
			.orderBy(desc(chainBalanceDeposits.timestamp))
			.limit(limit)
			.execute();

		if (!deposits || deposits.length === 0) {
			return c.json({ items: [] });
		}

		// Step 2: For each deposit, find the corresponding dispatch message using transaction hash
		const transactionHashes = deposits.map(deposit => deposit.transactionId);
		const dispatchMessages = await db
			.select()
			.from(hyperlaneMessages)
			.where(and(
				inArray(hyperlaneMessages.transactionHash, transactionHashes),
				eq(hyperlaneMessages.type, "DISPATCH")
			))
			.execute();

		// Create a map for quick lookup of dispatch messages by transaction hash
		const dispatchMessageMap = new Map(
			dispatchMessages.map(msg => [msg.transactionHash, msg])
		);

		// Step 3: For each dispatch message, find the corresponding process message by message ID
		const messageIds = dispatchMessages.map(msg => msg.messageId);
		let processMessages: any[] = [];

		if (messageIds.length > 0) {
			processMessages = await db
				.select()
				.from(hyperlaneMessages)
				.where(and(
					inArray(hyperlaneMessages.messageId, messageIds),
					eq(hyperlaneMessages.type, "PROCESS")
				))
				.execute();
		}

		// Create a map for quick lookup of process messages by message ID
		const processMessageMap = new Map(
			processMessages.map(msg => [msg.messageId, msg])
		);

		// Step 4: Compose the response in the same format as the existing GraphQL structure
		const composedTransfers = deposits.map(deposit => {
			const dispatchMessage = dispatchMessageMap.get(deposit.transactionId);
			const processMessage = dispatchMessage ? processMessageMap.get(dispatchMessage.messageId) : null;

			// Determine status based on message availability
			let transferStatus = "PENDING";
			let destinationChainId = null;
			let destinationTransactionHash = null;
			let destinationBlockNumber = null;
			let destinationTimestamp = null;

			if (processMessage) {
				transferStatus = "RELAYED";
				destinationChainId = processMessage.chainId;
				destinationTransactionHash = processMessage.transactionHash;
				destinationBlockNumber = processMessage.blockNumber;
				destinationTimestamp = processMessage.timestamp;
			} else if (dispatchMessage) {
				transferStatus = "SENT";
			}

			return {
				id: `transfer-${deposit.transactionId}`,
				amount: deposit.amount?.toString() || "0",
				destinationBlockNumber: destinationBlockNumber?.toString() || null,
				destinationChainId: destinationChainId,
				destinationTimestamp: destinationTimestamp,
				destinationToken: null, // Synthetic token info not available in separate schemas
				destinationTransactionHash: destinationTransactionHash,
				dispatchMessage: dispatchMessage ? {
					blockNumber: dispatchMessage.blockNumber?.toString() || null,
					chainId: dispatchMessage.chainId,
					id: dispatchMessage.id,
					messageId: dispatchMessage.messageId,
					sender: dispatchMessage.sender,
					timestamp: dispatchMessage.timestamp,
					type: dispatchMessage.type,
					transactionHash: dispatchMessage.transactionHash
				} : null,
				direction: "DEPOSIT",
				messageId: dispatchMessage?.messageId || null,
				processMessage: processMessage ? {
					blockNumber: processMessage.blockNumber?.toString() || null,
					chainId: processMessage.chainId,
					id: processMessage.id,
					messageId: processMessage.messageId,
					sender: processMessage.sender,
					timestamp: processMessage.timestamp,
					transactionHash: processMessage.transactionHash,
					type: processMessage.type
				} : null,
				sourceToken: deposit.token,
				sourceChainId: deposit.chainId,
				sourceBlockNumber: deposit.blockNumber,
				sender: deposit.depositor,
				recipient: deposit.recipient,
				sourceTransactionHash: deposit.transactionId,
				status: transferStatus,
				timestamp: deposit.timestamp
			};
		});

		// Filter by status if provided
		const filteredTransfers = status
			? composedTransfers.filter(transfer => transfer.status === status)
			: composedTransfers;

		return c.json({ items: filteredTransfers });
	} catch (error) {
		console.error("Error fetching cross-chain transfers:", error);
		return c.json({ error: `Failed to fetch cross-chain transfers: ${error}` }, 500);
	}
});

app.get("/api/token-mappings", async c => {
	const sourceChainId = c.req.query("sourceChainId");
	const targetChainId = c.req.query("targetChainId");
	const symbol = c.req.query("symbol");
	const isActive = c.req.query("isActive");
	const limit = parseInt(c.req.query("limit") || "100");

	try {
		let query = db.select().from(tokenMappings);

		// Apply filters
		const conditions = [];
		if (sourceChainId) {
			conditions.push(eq(tokenMappings.sourceChainId, parseInt(sourceChainId)));
		}
		if (targetChainId) {
			conditions.push(eq(tokenMappings.targetChainId, parseInt(targetChainId)));
		}
		if (symbol) {
			conditions.push(eq(tokenMappings.symbol, symbol));
		}
		if (isActive !== undefined) {
			conditions.push(eq(tokenMappings.isActive, isActive === 'true'));
		}

		if (conditions.length > 0) {
			query = query.where(and(...conditions));
		}

		const mappings = await query
			.orderBy(desc(tokenMappings.timestamp))
			.limit(limit)
			.execute();

		const formattedMappings = mappings.map(mapping => ({
			id: mapping.id,
			sourceChainId: mapping.sourceChainId,
			sourceToken: mapping.sourceToken,
			targetChainId: mapping.targetChainId,
			syntheticToken: mapping.syntheticToken,
			symbol: mapping.symbol,
			sourceDecimals: mapping.sourceDecimals,
			syntheticDecimals: mapping.syntheticDecimals,
			isActive: mapping.isActive,
			registeredAt: mapping.registeredAt,
			transactionId: mapping.transactionId,
			blockNumber: mapping.blockNumber?.toString(),
			timestamp: mapping.timestamp,
		}));

		return c.json({ items: formattedMappings });
	} catch (error) {
		console.error("Error fetching token mappings:", error);
		return c.json({ error: `Failed to fetch token mappings: ${error}` }, 500);
	}
});

app.get("/api/account", async c => {
	const address = c.req.query("address");

	if (!address) {
		return c.json({ error: "Address parameter is required" }, 400);
	}

	try {
		// Fetch all balance events for the user from event tables
		const [depositEvents, withdrawalEvents, lendingEventsData, lockEventsData, unlockEventsData] = await Promise.all([
			db.select().from(deposits).where(eq(deposits.userAddress, address as `0x${string}`)).execute(),
			db.select().from(withdrawals).where(eq(withdrawals.userAddress, address as `0x${string}`)).execute(),
			db.select().from(lendingEvents).where(eq(lendingEvents.userAddress, address as `0x${string}`)).execute(),
			db.select().from(lockEvents).where(eq(lockEvents.userAddress, address as `0x${string}`)).execute(),
			db.select().from(unlockEvents).where(eq(unlockEvents.userAddress, address as `0x${string}`)).execute(),
		]);

		// Calculate balances from events for each currency
		const currencyBalances = new Map<string, { total: bigint, locked: bigint, chainId: number }>();

		// Process deposits (increase total balance)
		depositEvents.forEach(event => {
			const key = `${event.currency}-${event.chainId}`;
			const current = currencyBalances.get(key) || { total: 0n, locked: 0n, chainId: event.chainId };
			current.total += BigInt(event.amount);
			currencyBalances.set(key, current);
		});

		// Process withdrawals (decrease total balance)
		withdrawalEvents.forEach(event => {
			const key = `${event.currency}-${event.chainId}`;
			const current = currencyBalances.get(key) || { total: 0n, locked: 0n, chainId: event.chainId };
			current.total -= BigInt(event.amount);
			currencyBalances.set(key, current);
		});

		// Get all currency mappings to map underlying tokens to synthetic tokens
		const allCurrencies = await db
			.select()
			.from(currencies)
			.where(eq(currencies.chainId, 84532))
			.execute();

		// Create mapping: underlyingToken -> syntheticToken
		const underlyingToSynthetic = new Map<string, string>();
		allCurrencies.forEach(currency => {
			if (currency.tokenType === 'synthetic' && currency.underlyingTokenAddress) {
				underlyingToSynthetic.set(currency.underlyingTokenAddress.toLowerCase(), currency.address.toLowerCase());
			}
		});

		// Process lending events (TRANSFER_IN increases, TRANSFER_OUT decreases)
		// Note: lending_events use the underlying token, so we need to map to synthetic
		lendingEventsData.forEach(event => {
			const underlyingToken = event.token.toLowerCase();
			// Map underlying token to synthetic token (e.g., USDC -> gsUSDC)
			const syntheticToken = underlyingToSynthetic.get(underlyingToken) || underlyingToken;
			const key = `${syntheticToken}-${event.chainId}`;
			const current = currencyBalances.get(key) || { total: 0n, locked: 0n, chainId: event.chainId };

			if (event.action === 'TRANSFER_IN') {
				current.total += BigInt(event.amount);
			} else if (event.action === 'TRANSFER_OUT') {
				current.total -= BigInt(event.amount);
			}
			currencyBalances.set(key, current);
		});

		// Process lock events (increase locked balance)
		lockEventsData.forEach(event => {
			const key = `${event.currency}-${event.chainId}`;
			const current = currencyBalances.get(key) || { total: 0n, locked: 0n, chainId: event.chainId };
			current.locked += BigInt(event.amount);
			currencyBalances.set(key, current);
		});

		// Process unlock events (decrease locked balance)
		unlockEventsData.forEach(event => {
			const key = `${event.currency}-${event.chainId}`;
			const current = currencyBalances.get(key) || { total: 0n, locked: 0n, chainId: event.chainId };
			current.locked -= BigInt(event.amount);
			currencyBalances.set(key, current);
		});

		// Get currency info for each balance
		const balancesWithInfo = await Promise.all(
			Array.from(currencyBalances.entries()).map(async ([key, balance]) => {
				const [currencyAddress] = key.split('-');
				const currency = await db
					.select()
					.from(currencies)
					.where(
						and(eq(currencies.address, currencyAddress as `0x${string}`), eq(currencies.chainId, balance.chainId))
					)
					.execute();

				const symbol = currency[0]?.symbol || "UNKNOWN";
				const free = balance.total >= balance.locked ? (balance.total - balance.locked).toString() : "0";

				return {
					asset: symbol,
					free: free,
					locked: balance.locked.toString(),
				};
			})
		);

		const orderCount = await db
			.select({ count: sql`count(*)` })
			.from(orders)
			.where(eq(orders.userAddress, address as `0x${string}`))
			.execute();

		const response = {
			makerCommission: 10, // 0.1% = 10 basis points
			takerCommission: 20, // 0.2% = 20 basis points
			buyerCommission: 0,
			sellerCommission: 0,
			canTrade: true,
			canWithdraw: true,
			canDeposit: true,
			updateTime: Date.now(),
			accountType: "SPOT",
			balances: balancesWithInfo,
			permissions: ["SPOT"],
		};

		return c.json(response);
	} catch (error) {
		return c.json({ error: `Failed to fetch account information: ${error}` }, 500);
	}
});

// Personal Lending Dashboard API
app.get("/api/lending/dashboard/:user", async c => {
	const { user } = c.req.param();
	const { chainId } = c.req.query();

	if (!user) {
		return c.json({ error: "User address is required" }, 400);
	}

	const targetChainId = chainId ? Number(chainId) : 84532;

	try {
		// Get user's lending events and calculate positions from them
		const userLendingEvents = await db
			.select()
			.from(lendingEvents)
			.where(and(
				eq(lendingEvents.userAddress, user as `0x${string}`),
				eq(lendingEvents.chainId, targetChainId)
			))
			.execute();

		// Calculate net positions from events
		const calculatedPositions = calculatePositionsFromEvents(userLendingEvents);

		// Execute remaining queries in parallel with proper error handling
		const [poolStats, assetConfigs, interestRateParams, userActivityHistory, indexedPositions] = await Promise.allSettled([
			db.select({
				token: poolLendingStats.token,
				totalSupply: poolLendingStats.totalSupply,
				totalBorrow: poolLendingStats.totalBorrow,
				supplyRate: poolLendingStats.supplyRate,
				borrowRate: poolLendingStats.borrowRate,
				utilizationRate: poolLendingStats.utilizationRate,
			})
				.from(poolLendingStats)
				.where(eq(poolLendingStats.chainId, targetChainId))
				.execute(),
			db.select({
				token: assetConfigurations.token,
				collateralFactor: assetConfigurations.collateralFactor,
				liquidationThreshold: assetConfigurations.liquidationThreshold,
				liquidationBonus: assetConfigurations.liquidationBonus,
				reserveFactor: assetConfigurations.reserveFactor,
				isActive: assetConfigurations.isActive,
				timestamp: assetConfigurations.timestamp,
			})
				.from(assetConfigurations)
				.where(and(
					eq(assetConfigurations.chainId, targetChainId),
					eq(assetConfigurations.isActive, true)
				))
				.execute(),
			db.select({
				token: interestRateParameters.token,
				baseRate: interestRateParameters.baseRate,
				optimalUtilization: interestRateParameters.optimalUtilization,
				rateSlope1: interestRateParameters.rateSlope1,
				rateSlope2: interestRateParameters.rateSlope2,
				timestamp: interestRateParameters.timestamp,
			})
				.from(interestRateParameters)
				.where(and(
					eq(interestRateParameters.chainId, targetChainId),
					eq(interestRateParameters.isActive, true)
				))
				.execute(),
			db.select({
				action: lendingEvents.action,
				amount: lendingEvents.amount,
				token: lendingEvents.token,
				timestamp: lendingEvents.timestamp,
				blockNumber: lendingEvents.blockNumber,
				transactionId: lendingEvents.transactionId,
			})
				.from(lendingEvents)
				.where(and(
					eq(lendingEvents.userAddress, user as `0x${string}`),
					eq(lendingEvents.chainId, targetChainId)
				))
				.orderBy(desc(lendingEvents.timestamp))
				.limit(50)
				.execute(),
			// Fetch indexed lending positions with lastUpdated (checkpoint timestamp)
			db.select({
				id: lendingPositions.id,
				collateralToken: lendingPositions.collateralToken,
				debtToken: lendingPositions.debtToken,
				collateralAmount: lendingPositions.collateralAmount,
				debtAmount: lendingPositions.debtAmount,
				lastUpdated: lendingPositions.lastUpdated,
				isActive: lendingPositions.isActive,
			})
				.from(lendingPositions)
				.where(and(
					eq(lendingPositions.userAddress, user as `0x${string}`),
					eq(lendingPositions.chainId, targetChainId),
					eq(lendingPositions.isActive, true)
				))
				.execute()
		]);

		// Use calculated positions instead of empty lendingPositions
		const positions = calculatedPositions;
		const stats = poolStats.status === 'fulfilled' ? poolStats.value : [];
		const configs = assetConfigs.status === 'fulfilled' ? assetConfigs.value : [];
		const rateParams = interestRateParams.status === 'fulfilled' ? interestRateParams.value : [];
		const activityHistory = userActivityHistory.status === 'fulfilled' ? userActivityHistory.value : [];
		// Indexed positions with lastUpdated checkpoint
		const indexedPositionsList = indexedPositions.status === 'fulfilled' ? indexedPositions.value : [];

		// Create a map of token -> lastUpdated from indexed positions for quick lookup
		const positionCheckpoints = new Map<string, number>();
		indexedPositionsList.forEach(pos => {
			if (pos.collateralToken && pos.lastUpdated) {
				positionCheckpoints.set(pos.collateralToken.toLowerCase(), pos.lastUpdated);
			}
			if (pos.debtToken && pos.lastUpdated) {
				positionCheckpoints.set(pos.debtToken.toLowerCase(), pos.lastUpdated);
			}
		});

		// Log any errors but continue processing
		if (poolStats.status === 'rejected') {
			console.error("Error fetching pool stats:", poolStats.reason);
		}
		if (assetConfigs.status === 'rejected') {
			console.error("Error fetching asset configs:", assetConfigs.reason);
		}
		if (interestRateParams.status === 'rejected') {
			console.error("Error fetching interest rate parameters:", interestRateParams.reason);
		}
		if (userActivityHistory.status === 'rejected') {
			console.error("Error fetching user activity history:", userActivityHistory.reason);
		}

		// Create maps for efficient lookup
		const ratesMap = new Map();
		const assetConfigMap: Record<string, { collateralFactor: number, liquidationThreshold: number }> = {};

		// Process asset configurations
		configs.forEach(config => {
			const tokenLower = config.token.toLowerCase();
			assetConfigMap[tokenLower] = {
				collateralFactor: config.collateralFactor / 10000,
				liquidationThreshold: config.liquidationThreshold / 10000
			};
		});

		// Process pool stats
		stats.forEach(stat => {
			const assetConfig = assetConfigMap[stat.token.toLowerCase()];
			ratesMap.set(stat.token, {
				supplyRate: Number(stat.supplyRate || 0),
				borrowRate: Number(stat.borrowRate || 0),
				collateralFactor: assetConfig?.collateralFactor || 0,
				liquidationThreshold: assetConfig?.liquidationThreshold || 0,
			});
		});

		// Create interest rate parameters map
		const interestRateMap: Record<string, {
			baseRate: number,
			optimalUtilization: number,
			rateSlope1: number,
			rateSlope2: number,
			lastUpdated: number
		}> = {};
		rateParams.forEach(param => {
			const tokenLower = param.token.toLowerCase();
			interestRateMap[tokenLower] = {
				baseRate: param.baseRate,
				optimalUtilization: param.optimalUtilization,
				rateSlope1: param.rateSlope1,
				rateSlope2: param.rateSlope2,
				lastUpdated: param.timestamp
			};
		});

		// Collect unique token addresses for batch lookup
		const uniqueTokenAddresses = new Set<string>();
		positions.forEach(position => {
			if (position.collateralToken) uniqueTokenAddresses.add(position.collateralToken);
			if (position.debtToken) uniqueTokenAddresses.add(position.debtToken);
		});
		configs.forEach(config => {
			uniqueTokenAddresses.add(config.token);
		});
		rateParams.forEach(param => {
			uniqueTokenAddresses.add(param.token);
		});

		// Fetch token information with error handling
		let tokenInfoMap = new Map();
		if (uniqueTokenAddresses.size > 0) {
			try {
				tokenInfoMap = await getMultipleTokenInfo(Array.from(uniqueTokenAddresses), targetChainId);
			} catch (tokenError) {
				console.error("Error fetching token info:", tokenError);
			}
		}

		// Fetch token prices from latest trades for USD value conversion
		let tokenPriceMap = new Map<string, { price: bigint, quoteDecimals: number }>();
		if (uniqueTokenAddresses.size > 0) {
			try {
				tokenPriceMap = await getTokenPricesFromTrades(Array.from(uniqueTokenAddresses), targetChainId);
			} catch (priceError) {
				console.error("Error fetching token prices from trades:", priceError);
			}
		}

		// Format activity history for response (now that tokenInfoMap is available)
		const formattedActivityHistory = await Promise.all(activityHistory.map(async (activity) => {
			const tokenInfo = tokenInfoMap.get(activity.token.toLowerCase()) || { decimals: 18, symbol: "UNKNOWN" };
			const cleanSymbol = formatSymbol(tokenInfo.symbol);

			return {
				action: activity.action,
				amount: formatAmount(activity.amount.toString(), tokenInfo.decimals),
				token: cleanSymbol,
				tokenAddress: activity.token,
				timestamp: activity.timestamp,
				blockNumber: activity.blockNumber.toString(),
				transactionId: activity.transactionId,
				// Add human-readable timestamp
				createdAt: new Date(activity.timestamp * 1000).toISOString()
			};
		}));

		// Process positions into supplies and borrows with real contract rates
		const positionPromises = positions.map(async (position, index) => {
			const result: { supplies: any[], borrows: any[] } = { supplies: [], borrows: [] };

			try {
				// Process supplies
				if (position.collateralAmount && Number(position.collateralAmount) > 0) {
					const collateralTokenInfo = tokenInfoMap.get(position.collateralToken.toLowerCase()) || { decimals: 18, symbol: "UNKNOWN" };
					const cleanSymbol = formatSymbol(collateralTokenInfo.symbol);
					const collateralAmount = position.collateralAmount.toString();

					// Get pool stats for this token
					const poolStat = stats.find(stat => stat.token.toLowerCase() === position.collateralToken.toLowerCase());
					const totalLiquidity = poolStat?.totalSupply || BigInt(0);
					const totalBorrowed = poolStat?.totalBorrow || BigInt(0);

					// Get interest rate parameters for this token
					const irParam = rateParams.find(param => param.token.toLowerCase() === position.collateralToken.toLowerCase());
					const interestRateParam = irParam ? {
						baseRate: irParam.baseRate,
						optimalUtilization: irParam.optimalUtilization,
						rateSlope1: irParam.rateSlope1,
						rateSlope2: irParam.rateSlope2
					} : null;

					// Get asset configuration for this token
					const assetConfig = configs.find(config => config.token.toLowerCase() === position.collateralToken.toLowerCase());

					// Calculate real-time rates
					let realTimeRates = null;
					try {
						if (totalLiquidity > 0n || totalBorrowed > 0n) {
							realTimeRates = await getRealTimeLendingRates(
								position.collateralToken,
								totalLiquidity,
								totalBorrowed,
								interestRateParam,
								assetConfig
							);
						}
					} catch (rateError) {
						console.error(`Error calculating real-time rates for supply ${position.collateralToken}:`, rateError);
					}

					// Fallback to indexed data if real-time calculation fails
					let realRates = { supplyRate: 0, borrowRate: 0, utilizationRate: 0 };
					if (!realTimeRates) {
						try {
							realRates = await getIndexedLendingRates(position.collateralToken as `0x${string}`, targetChainId);
						} catch (rateError) {
							console.error(`Error fetching indexed rates for supply ${position.collateralToken}:`, rateError);
						}
					}

					const supplyRateBP = realTimeRates?.supplyRate || realRates.supplyRate;
					const utilizationRateValue = realTimeRates?.utilizationRate || realRates.utilizationRate;

					// Calculate projected earnings for different time periods
					const projectedEarnings = {
						hourly: realTimeRates ? formatUSD(realTimeRates.projections.hourly.supplyEarnings.toString(), collateralTokenInfo.decimals) : "$0.00",
						daily: realTimeRates ? formatUSD(realTimeRates.projections.daily.supplyEarnings.toString(), collateralTokenInfo.decimals) : "$0.00",
						weekly: realTimeRates ? formatUSD(realTimeRates.projections.weekly.supplyEarnings.toString(), collateralTokenInfo.decimals) : "$0.00",
						monthly: realTimeRates ? formatUSD(realTimeRates.projections.monthly.supplyEarnings.toString(), collateralTokenInfo.decimals) : "$0.00"
					};

					// Use indexed checkpoint from lendingPositions.lastUpdated
					// This mirrors the contract's lastYieldUpdate and is updated on every supply/withdraw event
					const indexedCheckpoint = positionCheckpoints.get(position.collateralToken.toLowerCase());
					const checkpointTimestamp = indexedCheckpoint || position.firstSupplyTimestamp;

					// Calculate accrued yield since checkpoint
					// yield = (principal * supplyRate * timeDelta) / (SECONDS_PER_YEAR * BASIS_POINTS)
					const accruedYield = calculateAccruedSupplyYield(
						BigInt(collateralAmount),
						supplyRateBP,
						checkpointTimestamp
					);

					const accruedYieldFormatted = formatAmount(accruedYield.toString(), collateralTokenInfo.decimals);
					const accruedYieldUSD = formatUSD(accruedYield.toString(), collateralTokenInfo.decimals);

					// Calculate time since checkpoint for context
					const currentTime = Math.floor(Date.now() / 1000);
					const supplyDurationSeconds = checkpointTimestamp ? currentTime - checkpointTimestamp : 0;
					const supplyDurationDays = supplyDurationSeconds > 0 ? Math.floor(supplyDurationSeconds / 86400) : 0;
					const supplyDurationHours = supplyDurationSeconds > 0 ? Math.floor((supplyDurationSeconds % 86400) / 3600) : 0;

					// Get token price from pools for USD conversion
					const tokenPrice = tokenPriceMap.get(position.collateralToken.toLowerCase());
					const currentValueUSD = tokenPrice
						? formatUSDWithPrice(collateralAmount, collateralTokenInfo.decimals, Number(tokenPrice.price), tokenPrice.quoteDecimals)
						: formatUSD(collateralAmount, collateralTokenInfo.decimals); // fallback to 1:1 if no pool price

					result.supplies.push({
						id: position.id || `supply-${index}`,
						asset: cleanSymbol,
						assetAddress: position.collateralToken,
						suppliedAmount: formatAmount(collateralAmount, collateralTokenInfo.decimals),
						currentValue: currentValueUSD,
						apy: formatAPY(supplyRateBP.toString()),
						earnings: formatUSD("0", collateralTokenInfo.decimals),
						projectedEarnings,
						// Accrued yield calculated from indexed checkpoint (lendingPositions.lastUpdated)
						accruedYield: {
							amount: accruedYieldFormatted,
							value: accruedYieldUSD,
							sinceTimestamp: checkpointTimestamp,
							duration: supplyDurationSeconds > 0 ? `${supplyDurationDays}d ${supplyDurationHours}h` : "0h"
						},
						canWithdraw: position.isActive !== false,
						collateralUsed: formatAmount(collateralAmount, collateralTokenInfo.decimals),
						utilizationRate: (utilizationRateValue / 100).toFixed(1) + "%",
						realTimeRates: realTimeRates ? {
							supplyAPY: (realTimeRates.supplyAPY / 100).toFixed(2) + "%",
							borrowAPY: (realTimeRates.borrowAPY / 100).toFixed(2) + "%",
							utilizationRate: (realTimeRates.utilizationRate / 100).toFixed(1) + "%"
						} : null
					});
				}

				// Process borrows
				if (position.debtAmount && Number(position.debtAmount) > 0) {
					const debtTokenInfo = tokenInfoMap.get(position.debtToken.toLowerCase()) || { decimals: 18, symbol: "UNKNOWN" };
					const cleanSymbol = formatSymbol(debtTokenInfo.symbol);
					const debtAmount = position.debtAmount.toString();

					// Get pool stats for this token
					const poolStat = stats.find(stat => stat.token.toLowerCase() === position.debtToken.toLowerCase());
					const totalLiquidity = poolStat?.totalSupply || BigInt(0);
					const totalBorrowed = poolStat?.totalBorrow || BigInt(0);

					// Get interest rate parameters for this token
					const irParam = rateParams.find(param => param.token.toLowerCase() === position.debtToken.toLowerCase());
					const interestRateParam = irParam ? {
						baseRate: irParam.baseRate,
						optimalUtilization: irParam.optimalUtilization,
						rateSlope1: irParam.rateSlope1,
						rateSlope2: irParam.rateSlope2
					} : null;

					// Get asset configuration for this token
					const assetConfig = configs.find(config => config.token.toLowerCase() === position.debtToken.toLowerCase());

					// Calculate real-time rates
					let realTimeRates = null;
					try {
						if (totalLiquidity > 0n || totalBorrowed > 0n) {
							realTimeRates = await getRealTimeLendingRates(
								position.debtToken,
								totalLiquidity,
								totalBorrowed,
								interestRateParam,
								assetConfig
							);
						}
					} catch (rateError) {
						console.error(`Error calculating real-time rates for borrow ${position.debtToken}:`, rateError);
					}

					// Fallback to indexed data if real-time calculation fails
					let realRates = { supplyRate: 0, borrowRate: 0, utilizationRate: 0 };
					if (!realTimeRates) {
						try {
							realRates = await getIndexedLendingRates(position.debtToken as `0x${string}`, targetChainId);
						} catch (rateError) {
							console.error(`Error fetching indexed rates for borrow ${position.debtToken}:`, rateError);
						}
					}

					const borrowRateBP = realTimeRates?.borrowRate || realRates.borrowRate;
					const utilizationRateValue = realTimeRates?.utilizationRate || realRates.utilizationRate;

					// Calculate projected interest accrual for different time periods
					const projectedInterest = {
						hourly: realTimeRates ? formatUSD(realTimeRates.projections.hourly.borrowInterest.toString(), debtTokenInfo.decimals) : "$0.00",
						daily: realTimeRates ? formatUSD(realTimeRates.projections.daily.borrowInterest.toString(), debtTokenInfo.decimals) : "$0.00",
						weekly: realTimeRates ? formatUSD(realTimeRates.projections.weekly.borrowInterest.toString(), debtTokenInfo.decimals) : "$0.00",
						monthly: realTimeRates ? formatUSD(realTimeRates.projections.monthly.borrowInterest.toString(), debtTokenInfo.decimals) : "$0.00"
					};

					// Use indexed checkpoint from lendingPositions.lastUpdated
					// This mirrors the contract's lastYieldUpdate and is updated on every borrow/repay event
					const indexedCheckpoint = positionCheckpoints.get(position.debtToken.toLowerCase());
					const checkpointTimestamp = indexedCheckpoint || position.firstBorrowTimestamp;

					// Calculate accrued interest since checkpoint
					// Uses same formula as _calculateUserDebt in smart contract:
					// accruedInterest = (borrowed * borrowRate * timeDelta) / (SECONDS_PER_YEAR * BASIS_POINTS)
					const accruedInterest = calculateAccruedBorrowInterest(
						BigInt(debtAmount),
						borrowRateBP,
						checkpointTimestamp
					);

					const accruedInterestFormatted = formatAmount(accruedInterest.toString(), debtTokenInfo.decimals);
					const accruedInterestUSD = formatUSD(accruedInterest.toString(), debtTokenInfo.decimals);

					// Calculate time since checkpoint for context
					const currentTime = Math.floor(Date.now() / 1000);
					const borrowDurationSeconds = checkpointTimestamp ? currentTime - checkpointTimestamp : 0;
					const borrowDurationDays = borrowDurationSeconds > 0 ? Math.floor(borrowDurationSeconds / 86400) : 0;
					const borrowDurationHours = borrowDurationSeconds > 0 ? Math.floor((borrowDurationSeconds % 86400) / 3600) : 0;

					// Calculate total debt including accrued interest (same as contract's _calculateUserDebt)
					const principalAmount = BigInt(debtAmount);
					const totalDebtWithInterest = principalAmount + accruedInterest;
					const totalDebtFormatted = formatAmount(totalDebtWithInterest.toString(), debtTokenInfo.decimals);

					// Get token price from pools for USD conversion
					const debtTokenPrice = tokenPriceMap.get(position.debtToken.toLowerCase());
					const currentDebtUSD = debtTokenPrice
						? formatUSDWithPrice(debtAmount, debtTokenInfo.decimals, Number(debtTokenPrice.price), debtTokenPrice.quoteDecimals)
						: formatUSD(debtAmount, debtTokenInfo.decimals);
					const totalDebtUSD = debtTokenPrice
						? formatUSDWithPrice(totalDebtWithInterest.toString(), debtTokenInfo.decimals, Number(debtTokenPrice.price), debtTokenPrice.quoteDecimals)
						: formatUSD(totalDebtWithInterest.toString(), debtTokenInfo.decimals);

					// Placeholder health factor - will be calculated correctly after all positions are processed
					let healthFactor = 999999;

					let healthStatus: 'safe' | 'warning' | 'danger' = 'safe';
					if (healthFactor < 1.5) healthStatus = 'danger';
					else if (healthFactor < 2.0) healthStatus = 'warning';

					result.borrows.push({
						id: position.id || `borrow-${index}`,
						asset: cleanSymbol,
						assetAddress: position.debtToken,
						borrowedAmount: formatAmount(debtAmount, debtTokenInfo.decimals),
						currentDebt: currentDebtUSD,
						apy: formatAPY(borrowRateBP.toString()),
						interestAccrued: formatUSD("0", debtTokenInfo.decimals),
						projectedInterest,
						// Accrued interest calculated from indexed checkpoint (lendingPositions.lastUpdated)
						accruedInterest: {
							amount: accruedInterestFormatted,
							value: accruedInterestUSD,
							sinceTimestamp: checkpointTimestamp,
							duration: borrowDurationSeconds > 0 ? `${borrowDurationDays}d ${borrowDurationHours}h` : "0h"
						},
						// Total debt including accrued interest (matches _calculateUserDebt)
						totalDebtWithInterest: {
							amount: totalDebtFormatted,
							value: totalDebtUSD
						},
						collateralRatio: (assetConfigMap[position.debtToken.toLowerCase()]?.collateralFactor || 0).toString(),
						healthFactor: healthFactor.toFixed(2),
						healthStatus,
						canRepay: position.isActive !== false,
						utilizationRate: (utilizationRateValue / 100).toFixed(1) + "%",
						realTimeRates: realTimeRates ? {
							supplyAPY: (realTimeRates.supplyAPY / 100).toFixed(2) + "%",
							borrowAPY: (realTimeRates.borrowAPY / 100).toFixed(2) + "%",
							utilizationRate: (realTimeRates.utilizationRate / 100).toFixed(1) + "%"
						} : null
					});
				}
			} catch (processError) {
				console.error(`Error processing position ${index}:`, processError);
			}

			return result;
		});

		// Wait for all position processing to complete
		const positionResults = await Promise.all(positionPromises);
		const supplies = positionResults.flatMap(result => result.supplies);
		const borrows = positionResults.flatMap(result => result.borrows);

		// Generate available assets to supply with on-chain balance fetching and real-time rates
		const availableToSupplyPromises = configs.map(async (config) => {
			try {
				const tokenInfo = tokenInfoMap.get(config.token.toLowerCase()) || { decimals: 18, symbol: "UNKNOWN" };
				const cleanSymbol = formatSymbol(tokenInfo.symbol);
				const existingSupply = supplies.find(s => s.assetAddress?.toLowerCase() === config.token.toLowerCase());

				// Get pool stats for this token
				const poolStat = stats.find(stat => stat.token.toLowerCase() === config.token.toLowerCase());
				const totalLiquidity = poolStat?.totalSupply || BigInt(0);
				const totalBorrowed = poolStat?.totalBorrow || BigInt(0);

				// Get interest rate parameters for this token
				const irParam = rateParams.find(param => param.token.toLowerCase() === config.token.toLowerCase());
				const interestRateParam = irParam ? {
					baseRate: irParam.baseRate,
					optimalUtilization: irParam.optimalUtilization,
					rateSlope1: irParam.rateSlope1,
					rateSlope2: irParam.rateSlope2
				} : null;

				// Calculate real-time rates
				let realTimeRates = null;
				try {
					if (totalLiquidity > 0n || totalBorrowed > 0n) {
						realTimeRates = await getRealTimeLendingRates(
							config.token,
							totalLiquidity,
							totalBorrowed,
							interestRateParam,
							config
						);
					}
				} catch (rateError) {
					console.error(`Error calculating real-time rates for ${config.token}:`, rateError);
				}

				// Fallback to indexed data if real-time calculation fails
				let realRates = { supplyRate: 0, borrowRate: 0, utilizationRate: 0 };
				if (!realTimeRates) {
					try {
						realRates = await getIndexedLendingRates(config.token as `0x${string}`, targetChainId);
					} catch (rateError) {
						console.error(`Error fetching indexed rates for ${config.token}:`, rateError);
					}
				}

				const supplyRateBP = realTimeRates?.supplyRate || realRates.supplyRate;
				const utilizationRateValue = realTimeRates?.utilizationRate || realRates.utilizationRate;

				// Fetch on-chain balance
				let userRawBalance = "0";
				try {
					// Check if it's native ETH (common addresses or symbol)
					if (cleanSymbol === "ETH" || cleanSymbol === "WETH") {
						userRawBalance = await getNativeBalance(user as `0x${string}`, targetChainId);
					} else {
						userRawBalance = await getERC20Balance(user as `0x${string}`, config.token as `0x${string}`, targetChainId);
					}
				} catch (balanceError) {
					console.error(`Error fetching on-chain balance for ${config.token}:`, balanceError);
					userRawBalance = "0";
				}

				const availableBalance = BigInt(userRawBalance);

				// Calculate projected earnings for user's available balance
				let projectedEarnings = null;
				if (realTimeRates && availableBalance > 0n) {
					projectedEarnings = {
						hourly: formatUSD(calculateProjectedInterest(availableBalance, realTimeRates.supplyRate, 3600).toString(), tokenInfo.decimals),
						daily: formatUSD(calculateProjectedInterest(availableBalance, realTimeRates.supplyRate, 86400).toString(), tokenInfo.decimals),
						weekly: formatUSD(calculateProjectedInterest(availableBalance, realTimeRates.supplyRate, 604800).toString(), tokenInfo.decimals),
						monthly: formatUSD(calculateProjectedInterest(availableBalance, realTimeRates.supplyRate, 2592000).toString(), tokenInfo.decimals)
					};
				}

				return {
					asset: cleanSymbol,
					assetAddress: config.token,
					userBalance: formatAmount(userRawBalance, tokenInfo.decimals),
					suppliedAmount: existingSupply?.suppliedAmount || "0",
					availableAmount: formatAmount(availableBalance.toString(), tokenInfo.decimals),
					apy: formatAPY(supplyRateBP.toString()),
					utilizationRate: (utilizationRateValue / 100).toFixed(1) + "%",
					projectedEarnings,
					canSupply: true,
					recommended: cleanSymbol === "USDC",
					realTimeRates: realTimeRates ? {
						supplyAPY: (realTimeRates.supplyAPY / 100).toFixed(2) + "%",
						borrowAPY: (realTimeRates.borrowAPY / 100).toFixed(2) + "%",
						utilizationRate: (realTimeRates.utilizationRate / 100).toFixed(1) + "%"
					} : null
				};
			} catch (processError) {
				console.error(`Error processing supply config for ${config.token}:`, processError);
				return null;
			}
		});

		// Wait for all balance fetches to complete
		const availableToSupply = (await Promise.all(availableToSupplyPromises)).filter(Boolean);

		// Calculate borrowing power
		const totalCollateralValueRaw = supplies.reduce((sum, s) => sum + Number(s.currentValue.replace(/[$,]/g, '')), 0);

		// Show all available assets to borrow with real-time rates
		const availableToBorrowPromises = configs.map(async (config) => {
			try {
				const tokenInfo = tokenInfoMap.get(config.token.toLowerCase()) || { decimals: 18, symbol: "UNKNOWN" };
				const cleanSymbol = formatSymbol(tokenInfo.symbol);
				const ltv = config.collateralFactor / 10000;

				// Get pool stats for this token
				const poolStat = stats.find(stat => stat.token.toLowerCase() === config.token.toLowerCase());
				const totalLiquidity = poolStat?.totalSupply || BigInt(0);
				const totalBorrowed = poolStat?.totalBorrow || BigInt(0);

				// Get interest rate parameters for this token
				const irParam = rateParams.find(param => param.token.toLowerCase() === config.token.toLowerCase());
				const interestRateParam = irParam ? {
					baseRate: irParam.baseRate,
					optimalUtilization: irParam.optimalUtilization,
					rateSlope1: irParam.rateSlope1,
					rateSlope2: irParam.rateSlope2
				} : null;

				// Calculate real-time rates
				let realTimeRates = null;
				try {
					if (totalLiquidity > 0n || totalBorrowed > 0n) {
						realTimeRates = await getRealTimeLendingRates(
							config.token,
							totalLiquidity,
							totalBorrowed,
							interestRateParam,
							config
						);
					}
				} catch (rateError) {
					console.error(`Error calculating real-time rates for borrow ${config.token}:`, rateError);
				}

				const borrowRateBP = realTimeRates?.borrowRate || 0;
				const utilizationRateValue = realTimeRates?.utilizationRate || 0;

				// Calculate borrowing power based on collateral (in USD)
				let borrowingPowerUSD = 0;
				let canBorrow = false;

				if (ltv > 0 && totalCollateralValueRaw > 0) {
					borrowingPowerUSD = Math.floor(totalCollateralValueRaw * ltv);
					canBorrow = true;
				}

				// Calculate available liquidity in the pool (in token units)
				const availableLiquidity = totalLiquidity > totalBorrowed ? totalLiquidity - totalBorrowed : BigInt(0);
				const availableLiquidityFormatted = formatAmount(availableLiquidity.toString(), tokenInfo.decimals);

				const recommended = cleanSymbol === "USDC" || cleanSymbol.includes("USD");

				// Calculate projected interest for maximum borrowing power
				let projectedInterest = null;
				if (realTimeRates && borrowingPowerUSD > 0) {
					// For interest projection, use the USD borrowing power converted to token units
					const borrowingPowerInTokens = BigInt(Math.floor(borrowingPowerUSD * Math.pow(10, tokenInfo.decimals)));
					projectedInterest = {
						hourly: formatUSD(calculateProjectedInterest(borrowingPowerInTokens, realTimeRates.borrowRate, 3600).toString(), tokenInfo.decimals),
						daily: formatUSD(calculateProjectedInterest(borrowingPowerInTokens, realTimeRates.borrowRate, 86400).toString(), tokenInfo.decimals),
						weekly: formatUSD(calculateProjectedInterest(borrowingPowerInTokens, realTimeRates.borrowRate, 604800).toString(), tokenInfo.decimals),
						monthly: formatUSD(calculateProjectedInterest(borrowingPowerInTokens, realTimeRates.borrowRate, 2592000).toString(), tokenInfo.decimals)
					};
				}

				// Format borrowing power as USD
				const borrowingPowerFormatted = `$${borrowingPowerUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

				return {
					asset: cleanSymbol,
					assetAddress: config.token,
					availableAmount: borrowingPowerFormatted,
					availableLiquidity: availableLiquidityFormatted,
					currentBorrowed: formatAmount("0", tokenInfo.decimals),
					apy: formatAPY(borrowRateBP.toString()),
					utilizationRate: (utilizationRateValue / 100).toFixed(1) + "%",
					projectedInterest,
					collateralFactor: (ltv * 100).toString(),
					liquidationThreshold: ((config.liquidationThreshold / 10000) * 100).toString(),
					canBorrow,
					recommended,
					realTimeRates: realTimeRates ? {
						supplyAPY: (realTimeRates.supplyAPY / 100).toFixed(2) + "%",
						borrowAPY: (realTimeRates.borrowAPY / 100).toFixed(2) + "%",
						utilizationRate: (realTimeRates.utilizationRate / 100).toFixed(1) + "%"
					} : null
				};
			} catch (processError) {
				console.error(`Error processing borrow config for ${config.token}:`, processError);
				return null;
			}
		});

		// Wait for all borrow calculations to complete
		const availableToBorrow = (await Promise.all(availableToBorrowPromises)).filter(Boolean);

		// Calculate summary statistics
		const parseCurrency = (currencyString: string) => Number(currencyString.replace(/[$,]/g, '')) || 0;

		const totalSuppliedRaw = supplies.reduce((sum, s) => sum + parseCurrency(s.currentValue), 0);
		const totalBorrowedRaw = borrows.reduce((sum, b) => sum + parseCurrency(b.currentDebt), 0);
		const totalEarningsRaw = supplies.reduce((sum, s) => sum + parseCurrency(s.earnings), 0);

		// Calculate total weighted supply earnings (amount × APY)
		const totalWeightedSupplyRate = supplies.reduce((sum, supply) => {
			const apyMatch = supply.apy.match(/([\d.]+)%/);
			if (apyMatch) {
				const apyValue = parseFloat(apyMatch[1]);
				const supplyValue = parseCurrency(supply.currentValue);
				return sum + apyValue * supplyValue;
			}
			return sum;
		}, 0);

		// Calculate weighted average supply APY
		const weightedSupplyAPY = totalSuppliedRaw > 0 ? totalWeightedSupplyRate / totalSuppliedRaw : 0;

		// Calculate total weighted borrow costs (amount × APY)
		const totalWeightedBorrowRate = borrows.reduce((sum, borrow) => {
			const apyMatch = borrow.apy.match(/([\d.]+)%/);
			if (apyMatch) {
				const apyValue = parseFloat(apyMatch[1]);
				const borrowValue = parseCurrency(borrow.currentDebt);
				return sum + apyValue * borrowValue;
			}
			return sum;
		}, 0);

		// Calculate weighted average borrow APY
		const weightedBorrowAPY = totalBorrowedRaw > 0 ? totalWeightedBorrowRate / totalBorrowedRaw : 0;

		// Calculate net APY = (supply earnings - borrow costs) / supplied capital
		// NetAPY shows the net return on the user's supplied capital after borrow costs
		// Formula: (Σ(supply_amount × supply_apy) - Σ(borrow_amount × borrow_apy)) / total_supplied
		let netAPY = 0;
		if (totalSuppliedRaw > 0) {
			netAPY = (totalWeightedSupplyRate - totalWeightedBorrowRate) / totalSuppliedRaw;
		}

		// Calculate correct health factor based on real collateral and debt values
		const calculateRealHealthFactor = () => {
			// Sum all collateral values with liquidation thresholds
			const totalCollateralValueUSD = supplies.reduce((sum, supply) => {
				const supplyValue = parseCurrency(supply.currentValue);
				const assetConfig = assetConfigMap[supply.assetAddress?.toLowerCase() || ''];
				const liquidationThreshold = assetConfig?.liquidationThreshold || 0.8; // 80% default
				return sum + (supplyValue * liquidationThreshold);
			}, 0);

			// Sum all debt values
			const totalDebtValueUSD = borrows.reduce((sum, borrow) => {
				return sum + parseCurrency(borrow.currentDebt);
			}, 0);

			// Health Factor = (Total Collateral × Liquidation Threshold) / Total Debt
			return totalDebtValueUSD > 0 ? totalCollateralValueUSD / totalDebtValueUSD : 999999;
		};

		const realHealthFactor = calculateRealHealthFactor();

		// Update individual borrow positions with the correct health factor
		borrows.forEach(borrow => {
			borrow.healthFactor = realHealthFactor.toFixed(2);
			// Update health status based on real health factor
			if (realHealthFactor < 1.5) {
				borrow.healthStatus = 'danger';
			} else if (realHealthFactor < 2.0) {
				borrow.healthStatus = 'warning';
			} else {
				borrow.healthStatus = 'safe';
			}
		});

		const healthFactor = realHealthFactor.toFixed(2);

		// Create interest rate parameters summary for all tokens
		const interestRateParamsSummary = Object.entries(interestRateMap).map(([tokenAddress, params]) => {
			const tokenInfo = tokenInfoMap.get(tokenAddress) || { decimals: 18, symbol: "UNKNOWN" };
			const cleanSymbol = formatSymbol(tokenInfo.symbol);

			return {
				token: cleanSymbol,
				tokenAddress,
				baseRate: (params.baseRate / 100).toFixed(2) + '%',
				optimalUtilization: (params.optimalUtilization / 100).toFixed(1) + '%',
				rateSlope1: (params.rateSlope1 / 100).toFixed(2) + '%',
				rateSlope2: (params.rateSlope2 / 100).toFixed(2) + '%',
				lastUpdated: new Date(params.lastUpdated * 1000).toISOString()
			};
		});

		// Create asset configurations summary for all tokens
		const assetConfigurationsSummary = configs.map(config => {
			const tokenInfo = tokenInfoMap.get(config.token) || { decimals: 18, symbol: "UNKNOWN" };
			const cleanSymbol = formatSymbol(tokenInfo.symbol);

			return {
				token: cleanSymbol,
				tokenAddress: config.token,
				collateralFactor: (config.collateralFactor / 100).toFixed(2) + '%',
				liquidationThreshold: (config.liquidationThreshold / 100).toFixed(2) + '%',
				liquidationBonus: (config.liquidationBonus / 100).toFixed(2) + '%',
				reserveFactor: (config.reserveFactor / 100).toFixed(2) + '%',
				isActive: config.isActive,
				lastUpdated: new Date(config.timestamp * 1000).toISOString()
			};
		});

		return c.json({
			supplies,
			borrows,
			availableToSupply,
			availableToBorrow,
			activityHistory: formattedActivityHistory,
			interestRateParams: interestRateParamsSummary,
			assetConfigurations: assetConfigurationsSummary,
			summary: {
				totalSupplied: totalSuppliedRaw.toFixed(2),
				totalBorrowed: totalBorrowedRaw.toFixed(2),
				netAPY: netAPY.toFixed(1),
				totalEarnings: totalEarningsRaw.toFixed(2),
				healthFactor,
				borrowingPower: (totalCollateralValueRaw * 0.8).toFixed(2) // Simplified calculation
			}
		});

	} catch (error) {
		console.error("Critical error in lending dashboard:", error);
		return c.json({
			error: "Failed to fetch lending dashboard data",
			details: error instanceof Error ? error.message : String(error)
		}, 500);
	}
});

// ============================================================================
// AI AGENT API ENDPOINTS (ERC-8004)
// ============================================================================

/**
 * GET /api/agents
 * Get all agent installations
 * Query params: chainId, limit, offset, owner, enabled
 */
app.get("/api/agents", async c => {
	const { chainId, limit, offset, owner, enabled } = c.req.query();

	try {
		const targetChainId = chainId ? Number(chainId) : 84532;
		const queryLimit = limit ? Math.min(Number(limit), 100) : 50;
		const queryOffset = offset ? Number(offset) : 0;

		const conditions = [eq(agentInstallations.chainId, targetChainId)];

		if (owner) {
			conditions.push(eq(agentInstallations.owner, owner as `0x${string}`));
		}

		if (enabled !== undefined) {
			conditions.push(eq(agentInstallations.enabled, enabled === 'true'));
		}

		const agents = await db
			.select()
			.from(agentInstallations)
			.where(and(...conditions))
			.limit(queryLimit)
			.offset(queryOffset)
			.execute();

		// Convert BigInt fields to strings for JSON serialization
		const serializedAgents = agents.map(agent => ({
			...agent,
			agentTokenId: agent.agentTokenId?.toString(),
			blockNumber: agent.blockNumber?.toString(),
			installedAt: agent.installedAt,
			uninstalledAt: agent.uninstalledAt
		}));

		return c.json({
			success: true,
			data: serializedAgents,
			count: agents.length,
			pagination: {
				limit: queryLimit,
				offset: queryOffset
			}
		});
	} catch (error) {
		console.error("Error fetching agents:", error);
		return c.json({
			success: false,
			error: "Failed to fetch agents",
			details: error instanceof Error ? error.message : String(error)
		}, 500);
	}
});

/**
 * GET /api/agents/:agentTokenId
 * Get specific agent installation details
 */
app.get("/api/agents/:agentTokenId", async c => {
	const { agentTokenId } = c.req.param();
	const { chainId } = c.req.query();

	try {
		const targetChainId = chainId ? Number(chainId) : 84532;

		const agent = await db
			.select()
			.from(agentInstallations)
			.where(and(
				eq(agentInstallations.agentTokenId, agentTokenId),
				eq(agentInstallations.chainId, targetChainId)
			))
			.limit(1)
			.execute();

		if (agent.length === 0) {
			return c.json({
				success: false,
				error: "Agent not found"
			}, 404);
		}

		// Convert BigInt fields to strings
		const serializedAgent = {
			...agent[0],
			agentTokenId: agent[0].agentTokenId?.toString(),
			blockNumber: agent[0].blockNumber?.toString(),
			installedAt: agent[0].installedAt,
			uninstalledAt: agent[0].uninstalledAt
		};

		return c.json({
			success: true,
			data: serializedAgent
		});
	} catch (error) {
		console.error("Error fetching agent:", error);
		return c.json({
			success: false,
			error: "Failed to fetch agent",
			details: error instanceof Error ? error.message : String(error)
		}, 500);
	}
});

/**
 * GET /api/agents/:agentTokenId/orders
 * Get orders placed by a specific agent
 */
app.get("/api/agents/:agentTokenId/orders", async c => {
	const { agentTokenId } = c.req.param();
	const { chainId, limit, offset, status } = c.req.query();

	try {
		const targetChainId = chainId ? Number(chainId) : 84532;
		const queryLimit = limit ? Math.min(Number(limit), 100) : 50;
		const queryOffset = offset ? Number(offset) : 0;

		const conditions = [
			eq(orders.agentTokenId, agentTokenId),
			eq(orders.chainId, targetChainId)
		];

		if (status) {
			conditions.push(eq(orders.status, status.toUpperCase()));
		}

		const agentOrders = await db
			.select()
			.from(orders)
			.where(and(...conditions))
			.orderBy(desc(orders.timestamp))
			.limit(queryLimit)
			.offset(queryOffset)
			.execute();

		// Convert BigInt fields to strings
		const serializedOrders = agentOrders.map(order => ({
			...order,
			orderId: order.orderId?.toString(),
			price: order.price?.toString(),
			quantity: order.quantity?.toString(),
			filled: order.filled?.toString(),
			quoteQuantity: order.quoteQuantity?.toString(),
			executedQuoteQuantity: order.executedQuoteQuantity?.toString(),
			agentTokenId: order.agentTokenId?.toString()
		}));

		return c.json({
			success: true,
			data: serializedOrders,
			count: agentOrders.length,
			pagination: {
				limit: queryLimit,
				offset: queryOffset
			}
		});
	} catch (error) {
		console.error("Error fetching agent orders:", error);
		return c.json({
			success: false,
			error: "Failed to fetch agent orders",
			details: error instanceof Error ? error.message : String(error)
		}, 500);
	}
});

/**
 * GET /api/agents/:agentTokenId/stats
 * Get statistics for a specific agent
 */
app.get("/api/agents/:agentTokenId/stats", async c => {
	const { agentTokenId } = c.req.param();
	const { chainId } = c.req.query();

	try {
		const targetChainId = chainId ? Number(chainId) : 84532;

		// Get agent stats if available
		const stats = await db
			.select()
			.from(agentStats)
			.where(and(
				eq(agentStats.agentTokenId, agentTokenId),
				eq(agentStats.chainId, targetChainId)
			))
			.limit(1)
			.execute();

		// Get order counts by status
		const orderStats = await db
			.select({
				status: orders.status,
				count: sql<number>`count(*)::int`
			})
			.from(orders)
			.where(and(
				eq(orders.agentTokenId, agentTokenId),
				eq(orders.chainId, targetChainId)
			))
			.groupBy(orders.status)
			.execute();

		return c.json({
			success: true,
			data: {
				agentStats: stats[0] || null,
				ordersByStatus: orderStats.reduce((acc, item) => {
					acc[item.status] = item.count;
					return acc;
				}, {} as Record<string, number>)
			}
		});
	} catch (error) {
		console.error("Error fetching agent stats:", error);
		return c.json({
			success: false,
			error: "Failed to fetch agent stats",
			details: error instanceof Error ? error.message : String(error)
		}, 500);
	}
});

/**
 * GET /api/agent-orders
 * Get all orders placed by agents
 * Query params: chainId, limit, offset, executor, status
 */
app.get("/api/agent-orders", async c => {
	const { chainId, limit, offset, executor, status } = c.req.query();

	try {
		const targetChainId = chainId ? Number(chainId) : 84532;
		const queryLimit = limit ? Math.min(Number(limit), 100) : 50;
		const queryOffset = offset ? Number(offset) : 0;

		const conditions = [
			eq(orders.chainId, targetChainId),
			sql`${orders.agentTokenId} > '0'` // Only agent orders
		];

		if (executor) {
			conditions.push(eq(orders.executor, executor as `0x${string}`));
		}

		if (status) {
			conditions.push(eq(orders.status, status.toUpperCase()));
		}

		const agentOrders = await db
			.select()
			.from(orders)
			.where(and(...conditions))
			.orderBy(desc(orders.timestamp))
			.limit(queryLimit)
			.offset(queryOffset)
			.execute();

		// Convert BigInt fields to strings
		const serializedOrders = agentOrders.map(order => ({
			...order,
			orderId: order.orderId?.toString(),
			price: order.price?.toString(),
			quantity: order.quantity?.toString(),
			filled: order.filled?.toString(),
			quoteQuantity: order.quoteQuantity?.toString(),
			executedQuoteQuantity: order.executedQuoteQuantity?.toString(),
			agentTokenId: order.agentTokenId?.toString()
		}));

		return c.json({
			success: true,
			data: serializedOrders,
			count: agentOrders.length,
			pagination: {
				limit: queryLimit,
				offset: queryOffset
			}
		});
	} catch (error) {
		console.error("Error fetching agent orders:", error);
		return c.json({
			success: false,
			error: "Failed to fetch agent orders",
			details: error instanceof Error ? error.message : String(error)
		}, 500);
	}
});

/**
 * GET /api/agents/:agentTokenId/lending
 * Get lending activity for a specific agent
 */
app.get("/api/agents/:agentTokenId/lending", async c => {
	const { agentTokenId } = c.req.param();
	const { chainId, limit, offset } = c.req.query();

	try {
		const targetChainId = chainId ? Number(chainId) : 84532;
		const queryLimit = limit ? Math.min(Number(limit), 100) : 50;
		const queryOffset = offset ? Number(offset) : 0;

		const lendingActivity = await db
			.select()
			.from(agentLendingEvents)
			.where(and(
				eq(agentLendingEvents.agentTokenId, agentTokenId),
				eq(agentLendingEvents.chainId, targetChainId)
			))
			.orderBy(desc(agentLendingEvents.timestamp))
			.limit(queryLimit)
			.offset(queryOffset)
			.execute();

		return c.json({
			success: true,
			data: lendingActivity,
			count: lendingActivity.length,
			pagination: {
				limit: queryLimit,
				offset: queryOffset
			}
		});
	} catch (error) {
		console.error("Error fetching agent lending activity:", error);
		return c.json({
			success: false,
			error: "Failed to fetch agent lending activity",
			details: error instanceof Error ? error.message : String(error)
		}, 500);
	}
});

/**
 * GET /api/agents/:agentTokenId/violations
 * Get policy violations for a specific agent
 */
app.get("/api/agents/:agentTokenId/violations", async c => {
	const { agentTokenId } = c.req.param();
	const { chainId, limit, offset } = c.req.query();

	try {
		const targetChainId = chainId ? Number(chainId) : 84532;
		const queryLimit = limit ? Math.min(Number(limit), 100) : 50;
		const queryOffset = offset ? Number(offset) : 0;

		const violations = await db
			.select()
			.from(agentPolicyViolations)
			.where(and(
				eq(agentPolicyViolations.agentTokenId, agentTokenId),
				eq(agentPolicyViolations.chainId, targetChainId)
			))
			.orderBy(desc(agentPolicyViolations.timestamp))
			.limit(queryLimit)
			.offset(queryOffset)
			.execute();

		return c.json({
			success: true,
			data: violations,
			count: violations.length,
			pagination: {
				limit: queryLimit,
				offset: queryOffset
			}
		});
	} catch (error) {
		console.error("Error fetching agent violations:", error);
		return c.json({
			success: false,
			error: "Failed to fetch agent violations",
			details: error instanceof Error ? error.message : String(error)
		}, 500);
	}
});

/**
 * GET /api/agents/:agentTokenId/circuit-breakers
 * Get circuit breaker events for a specific agent
 */
app.get("/api/agents/:agentTokenId/circuit-breakers", async c => {
	const { agentTokenId } = c.req.param();
	const { chainId, limit, offset } = c.req.query();

	try {
		const targetChainId = chainId ? Number(chainId) : 84532;
		const queryLimit = limit ? Math.min(Number(limit), 100) : 50;
		const queryOffset = offset ? Number(offset) : 0;

		const circuitBreakers = await db
			.select()
			.from(agentCircuitBreakers)
			.where(and(
				eq(agentCircuitBreakers.agentTokenId, agentTokenId),
				eq(agentCircuitBreakers.chainId, targetChainId)
			))
			.orderBy(desc(agentCircuitBreakers.timestamp))
			.limit(queryLimit)
			.offset(queryOffset)
			.execute();

		return c.json({
			success: true,
			data: circuitBreakers,
			count: circuitBreakers.length,
			pagination: {
				limit: queryLimit,
				offset: queryOffset
			}
		});
	} catch (error) {
		console.error("Error fetching circuit breakers:", error);
		return c.json({
			success: false,
			error: "Failed to fetch circuit breakers",
			details: error instanceof Error ? error.message : String(error)
		}, 500);
	}
});

// ============================================================================
// END AI AGENT API ENDPOINTS
// ============================================================================

// Function to format our bucket data into Binance Kline format
function formatKlineData(bucket: BucketData): BinanceKlineData {
	// Binance Kline format is an array with specific index positions:
	// [
	//   0: openTime,
	//   1: open,
	//   2: high,
	//   3: low,
	//   4: close,
	//   5: volume,
	//   6: closeTime,
	//   7: quoteVolume,
	//   8: numberOfTrades,
	//   9: takerBuyBaseVolume,
	//   10: takerBuyQuoteVolume,
	//   11: ignored
	// ]

	return [
		bucket.openTime * 1000,
		bucket.open.toString(),
		bucket.high.toString(),
		bucket.low.toString(),
		bucket.close.toString(),
		bucket.volume.toString(),
		bucket.closeTime * 1000,
		bucket.quoteVolume.toString(),
		bucket.count,
		bucket.takerBuyBaseVolume.toString(),
		bucket.takerBuyQuoteVolume.toString(),
		"0",
	];
}

// Initialize event publisher
async function initializeServices() {
	try {
		console.log('Initializing services...');

		// Initialize Redis client for event publishing
		const redisClient = await initIORedisClient();
		if (redisClient) {
			const eventPublisher = initializeEventPublisher(redisClient);
			await eventPublisher.createConsumerGroups();
			console.log('Event publisher initialized successfully');
		} else {
			console.warn('Redis client not available, event publishing disabled');
		}
	} catch (error) {
		console.error('Failed to initialize services:', error);
	}
}


/**
 * Time-weighted balance segment for accurate yield calculation
 * Each segment represents a period where the user's balance was constant
 */
interface BalanceSegment {
	amount: bigint;
	startTimestamp: number;
	endTimestamp: number | null; // null means ongoing (until now)
}

/**
 * Calculate lending positions from events with time-weighted yield tracking
 *
 * Yield accrual in lending protocols works as follows:
 * 1. Interest accrues at the POOL level based on total borrowed amount
 * 2. Each supplier earns proportional to their share: (userSupply / totalSupply) * poolInterest
 * 3. When a user deposits/withdraws, their earning rate changes
 *
 * To calculate accurate yield, we need to track:
 * - Each period where user's balance was constant
 * - The supply rate during each period (approximated by current rate for simplicity)
 *
 * Formula for each segment:
 * segmentYield = (segmentBalance * supplyRate * segmentDuration) / (SECONDS_PER_YEAR * BASIS_POINTS)
 * totalYield = sum of all segmentYields
 */
function calculatePositionsFromEvents(events: any[]): any[] {
	const tokenBalances = new Map<string, {
		supplied: bigint,
		borrowed: bigint,
		supplySegments: BalanceSegment[],
		borrowSegments: BalanceSegment[],
		firstSupplyTimestamp: number | null,
		firstBorrowTimestamp: number | null,
		lastSupplyTimestamp: number | null,
		lastBorrowTimestamp: number | null
	}>();

	// Sort events by timestamp to process chronologically
	const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

	// Process each event to calculate net balances and track time-weighted segments
	sortedEvents.forEach(event => {
		const tokenAddress = event.token;
		if (!tokenBalances.has(tokenAddress)) {
			tokenBalances.set(tokenAddress, {
				supplied: 0n,
				borrowed: 0n,
				supplySegments: [],
				borrowSegments: [],
				firstSupplyTimestamp: null,
				firstBorrowTimestamp: null,
				lastSupplyTimestamp: null,
				lastBorrowTimestamp: null
			});
		}

		const balance = tokenBalances.get(tokenAddress)!;
		const amount = BigInt(event.amount || 0);
		const timestamp = event.timestamp;

		switch (event.action) {
			case 'SUPPLY':
				// Close the previous supply segment if exists
				if (balance.supplySegments.length > 0) {
					const lastSegment = balance.supplySegments[balance.supplySegments.length - 1];
					if (lastSegment && lastSegment.endTimestamp === null) {
						lastSegment.endTimestamp = timestamp;
					}
				}

				balance.supplied += amount;

				// Start a new segment with the new balance
				if (balance.supplied > 0n) {
					balance.supplySegments.push({
						amount: balance.supplied,
						startTimestamp: timestamp,
						endTimestamp: null
					});
				}

				if (balance.firstSupplyTimestamp === null) {
					balance.firstSupplyTimestamp = timestamp;
				}
				balance.lastSupplyTimestamp = timestamp;
				break;

			case 'BORROW':
				// Close the previous borrow segment if exists
				if (balance.borrowSegments.length > 0) {
					const lastSegment = balance.borrowSegments[balance.borrowSegments.length - 1];
					if (lastSegment && lastSegment.endTimestamp === null) {
						lastSegment.endTimestamp = timestamp;
					}
				}

				balance.borrowed += amount;

				// Start a new segment with the new balance
				if (balance.borrowed > 0n) {
					balance.borrowSegments.push({
						amount: balance.borrowed,
						startTimestamp: timestamp,
						endTimestamp: null
					});
				}

				if (balance.firstBorrowTimestamp === null) {
					balance.firstBorrowTimestamp = timestamp;
				}
				balance.lastBorrowTimestamp = timestamp;
				break;

			case 'REPAY':
				// Close the previous borrow segment
				if (balance.borrowSegments.length > 0) {
					const lastSegment = balance.borrowSegments[balance.borrowSegments.length - 1];
					if (lastSegment && lastSegment.endTimestamp === null) {
						lastSegment.endTimestamp = timestamp;
					}
				}

				balance.borrowed = balance.borrowed >= amount ? balance.borrowed - amount : 0n;

				// Start a new segment if still has borrowed amount
				if (balance.borrowed > 0n) {
					balance.borrowSegments.push({
						amount: balance.borrowed,
						startTimestamp: timestamp,
						endTimestamp: null
					});
				}
				break;

			case 'WITHDRAW':
				// Close the previous supply segment
				if (balance.supplySegments.length > 0) {
					const lastSegment = balance.supplySegments[balance.supplySegments.length - 1];
					if (lastSegment && lastSegment.endTimestamp === null) {
						lastSegment.endTimestamp = timestamp;
					}
				}

				balance.supplied = balance.supplied >= amount ? balance.supplied - amount : 0n;

				// Start a new segment if still has supply
				if (balance.supplied > 0n) {
					balance.supplySegments.push({
						amount: balance.supplied,
						startTimestamp: timestamp,
						endTimestamp: null
					});
				}

				// Reset timestamps if all withdrawn
				if (balance.supplied === 0n) {
					balance.firstSupplyTimestamp = null;
					balance.lastSupplyTimestamp = null;
				}
				break;

			case 'TRANSFER_OUT':
				// Handle transfer out - reduces supply (similar to WITHDRAW)
				// This occurs when gsTokens are transferred during order matching
				if (balance.supplySegments.length > 0) {
					const lastSegment = balance.supplySegments[balance.supplySegments.length - 1];
					if (lastSegment && lastSegment.endTimestamp === null) {
						lastSegment.endTimestamp = timestamp;
					}
				}

				balance.supplied = balance.supplied >= amount ? balance.supplied - amount : 0n;

				// Start a new segment if still has supply
				if (balance.supplied > 0n) {
					balance.supplySegments.push({
						amount: balance.supplied,
						startTimestamp: timestamp,
						endTimestamp: null
					});
				}

				// Reset timestamps if all transferred out
				if (balance.supplied === 0n) {
					balance.firstSupplyTimestamp = null;
					balance.lastSupplyTimestamp = null;
				}
				break;

			case 'TRANSFER_IN':
				// Handle transfer in - increases supply (similar to SUPPLY)
				// This occurs when gsTokens are received during order matching
				if (balance.supplySegments.length > 0) {
					const lastSegment = balance.supplySegments[balance.supplySegments.length - 1];
					if (lastSegment && lastSegment.endTimestamp === null) {
						lastSegment.endTimestamp = timestamp;
					}
				}

				balance.supplied += amount;

				// Start a new segment with the new balance
				if (balance.supplied > 0n) {
					balance.supplySegments.push({
						amount: balance.supplied,
						startTimestamp: timestamp,
						endTimestamp: null
					});
				}

				if (balance.firstSupplyTimestamp === null) {
					balance.firstSupplyTimestamp = timestamp;
				}
				balance.lastSupplyTimestamp = timestamp;
				break;
		}
	});

	// Convert to position format
	const positions: any[] = [];
	tokenBalances.forEach((balance, tokenAddress) => {
		if (balance.supplied > 0 || balance.borrowed > 0) {
			positions.push({
				id: `calculated-${tokenAddress}`,
				user: events[0]?.userAddress,
				collateralToken: balance.supplied > 0 ? tokenAddress : null,
				debtToken: balance.borrowed > 0 ? tokenAddress : null,
				collateralAmount: balance.supplied,
				debtAmount: balance.borrowed,
				isActive: true,
				chainId: events[0]?.chainId || 31337,
				// Time-weighted segments for accurate yield calculation
				supplySegments: balance.supplySegments,
				borrowSegments: balance.borrowSegments,
				// Legacy timestamp tracking (for display purposes)
				firstSupplyTimestamp: balance.firstSupplyTimestamp,
				firstBorrowTimestamp: balance.firstBorrowTimestamp,
				lastSupplyTimestamp: balance.lastSupplyTimestamp,
				lastBorrowTimestamp: balance.lastBorrowTimestamp
			});
		}
	});

	return positions;
}

// Higher precision multiplier for accurate calculations with fractional basis points
const PRECISION_MULTIPLIER = 1000000n; // 1e6 for 6 decimal places of precision

/**
 * Calculate accrued yield for a lender (supplier)
 * Uses the same formula as the smart contract:
 * yield = (principal * supplyRate * timeDelta) / (SECONDS_PER_YEAR * BASIS_POINTS)
 *
 * Note: We use a precision multiplier to handle fractional basis points accurately.
 * For example, a supply rate of 0.18 basis points would be lost if rounded to 0.
 */
function calculateAccruedSupplyYield(
	principal: bigint,
	supplyRateBP: number,
	firstTimestamp: number | null,
	currentTimestamp: number = Math.floor(Date.now() / 1000)
): bigint {
	if (principal === 0n || supplyRateBP === 0 || firstTimestamp === null) return 0n;

	const timeDelta = currentTimestamp - firstTimestamp;
	if (timeDelta <= 0) return 0n;

	// Use precision multiplier to preserve fractional basis points
	// rate * 1e6 preserves 6 decimal places
	const scaledRate = BigInt(Math.round(supplyRateBP * Number(PRECISION_MULTIPLIER)));
	return (principal * scaledRate * BigInt(timeDelta)) / (BigInt(SECONDS_PER_YEAR) * BigInt(BASIS_POINTS) * PRECISION_MULTIPLIER);
}

/**
 * Calculate accrued interest for a borrower
 * Uses the same formula as the smart contract:
 * interest = (borrowed * borrowRate * timeDelta) / (SECONDS_PER_YEAR * BASIS_POINTS)
 */
function calculateAccruedBorrowInterest(
	borrowed: bigint,
	borrowRateBP: number,
	firstTimestamp: number | null,
	currentTimestamp: number = Math.floor(Date.now() / 1000)
): bigint {
	if (borrowed === 0n || borrowRateBP === 0 || firstTimestamp === null) return 0n;

	const timeDelta = currentTimestamp - firstTimestamp;
	if (timeDelta <= 0) return 0n;

	// Use precision multiplier to preserve fractional basis points
	const scaledRate = BigInt(Math.round(borrowRateBP * Number(PRECISION_MULTIPLIER)));
	return (borrowed * scaledRate * BigInt(timeDelta)) / (BigInt(SECONDS_PER_YEAR) * BigInt(BASIS_POINTS) * PRECISION_MULTIPLIER);
}

// Initialize services on startup
initializeServices();

// Start system monitor for metrics collection (configurable)
const ENABLE_SYSTEM_MONITOR = process.env.ENABLE_SYSTEM_MONITOR === 'true';
const SYSTEM_MONITOR_INTERVAL = parseInt(process.env.SYSTEM_MONITOR_INTERVAL || '60');

if (ENABLE_SYSTEM_MONITOR) {
	console.log(`Starting system monitor for metrics collection (interval: ${SYSTEM_MONITOR_INTERVAL}s)...`);
	systemMonitor.start(SYSTEM_MONITOR_INTERVAL);
} else {
	console.log('System monitor disabled (set ENABLE_SYSTEM_MONITOR=true to enable)');
}

export default app;
