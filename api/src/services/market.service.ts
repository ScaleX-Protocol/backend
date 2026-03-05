import { and, desc, eq, gte, lte, asc, or, inArray, sql, gt } from 'drizzle-orm';
import { ponderDb } from '../config/database';
import { 
    pools, 
    orders, 
    orderBookDepth, 
    orderBookTrades, 
    dailyBuckets,
    minuteBuckets,
    fiveMinuteBuckets,
    thirtyMinuteBuckets,
    hourBuckets,
    balances,
    currencies
} from '../schema';

type IntervalType = "1m" | "5m" | "30m" | "1h" | "1d";

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

export class MarketService {
    // Helper to find pool by symbol (coin name), pool address (order_book), or pool id
    private static async findPool(symbol: string) {
        // First try by coin name (e.g., "sxWETH/sxIDRX" or "sxWETHsxIDRX")
        let queriedPools = await ponderDb.select().from(pools).where(eq(pools.coin, symbol)).orderBy(desc(pools.timestamp));
        
        // Try normalized coin (remove slash)
        if (!queriedPools || queriedPools.length === 0) {
            const normalizedCoin = symbol.replace('/', '');
            queriedPools = await ponderDb.select().from(pools).where(eq(pools.coin, normalizedCoin)).orderBy(desc(pools.timestamp));
        }
        
        // If not found, try by order_book address (poolId as returned from /pairs)
        if (!queriedPools || queriedPools.length === 0) {
            queriedPools = await ponderDb.select().from(pools).where(eq(pools.orderBook, symbol.toLowerCase())).orderBy(desc(pools.timestamp));
        }
        
        // Try by pool id
        if (!queriedPools || queriedPools.length === 0) {
            queriedPools = await ponderDb.select().from(pools).where(eq(pools.id, symbol)).orderBy(desc(pools.timestamp));
        }
        
        // If still not found, try with 0x prefix normalized
        if (!queriedPools || queriedPools.length === 0) {
            const addr = symbol.toLowerCase().startsWith('0x') ? symbol.toLowerCase() : `0x${symbol.toLowerCase()}`;
            queriedPools = await ponderDb.select().from(pools).where(eq(pools.orderBook, addr)).orderBy(desc(pools.timestamp));
            // Also try by id with normalized address
            if (!queriedPools || queriedPools.length === 0) {
                queriedPools = await ponderDb.select().from(pools).where(eq(pools.id, addr)).orderBy(desc(pools.timestamp));
            }
        }

        if (!queriedPools || queriedPools.length === 0) {
            throw new Error("Pool not found");
        }
        
        const pool = queriedPools[0]!;
        // Return pool with normalized fields
        return {
            ...pool,
            orderBook: pool.orderBook || pool.id  // Ensure orderBook is always set
        };
    }

    static async getKlineData(params: {
        symbol: string;
        interval: string;
        startTime: number;
        endTime: number;
        limit: number;
    }) {
        const { symbol, interval, startTime, endTime, limit } = params;

        const pool = await this.findPool(symbol);

        if (!pool) {
            throw new Error("Pool not found");
        }

        const intervalTableMap = {
            "1m": minuteBuckets,
            "5m": fiveMinuteBuckets,
            "30m": thirtyMinuteBuckets,
            "1h": hourBuckets,
            "1d": dailyBuckets,
        };

        const bucketTable = intervalTableMap[interval as IntervalType] || minuteBuckets;
        const poolId = pool.orderBook;

        const klineData = await ponderDb
            .select()
            .from(bucketTable)
            .where(
                and(
                    eq(bucketTable.poolId, poolId as string),
                    gte(bucketTable.openTime, Math.floor(startTime / 1000)),
                    lte(bucketTable.openTime, Math.floor(endTime / 1000))
                )
            )
            .orderBy(bucketTable.openTime)
            .limit(limit)
            .execute();

        return klineData.map((bucket: any) => this.formatKlineData(bucket));
    }

    static async getDepth(params: { symbol: string; limit: number }) {
        const { symbol, limit } = params;

        const pool = await this.findPool(symbol);

        if (!pool) {
            throw new Error("Pool not found");
        }

        const poolId = pool.orderBook;

        if (!poolId) {
            throw new Error("Pool order book address not found");
        }

        const [bids, asks] = await Promise.all([
            ponderDb
                .select({
                    price: orders.price,
                    quantity: sql`SUM(${orders.quantity})`.as("quantity"),
                    filled: sql`SUM(${orders.filled})`.as("filled"),
                })
                .from(orders)
                .where(
                    and(
                        gt(orders.price, 0n),
                        eq(orders.poolId, poolId),
                        eq(orders.side, "Buy"),
                        or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
                    )
                )
                .groupBy(orders.price)
                .orderBy(asc(orders.price))
                .limit(limit)
                .execute(),

            ponderDb
                .select({
                    price: orders.price,
                    quantity: sql`SUM(${orders.quantity})`.as("quantity"),
                    filled: sql`SUM(${orders.filled})`.as("filled"),
                })
                .from(orders)
                .where(
                    and(
                        gt(orders.price, 0n),
                        eq(orders.poolId, poolId),
                        eq(orders.side, "Sell"),
                        or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
                    )
                )
                .orderBy(asc(orders.price))
                .groupBy(orders.price)
                .limit(limit)
                .execute()
        ]);

        return {
            lastUpdateId: Date.now(),
            bids: bids.map((o: any) => [o.price.toString(), (BigInt(o.quantity) - BigInt(o.filled)).toString()]),
            asks: asks.map((o: any) => [o.price.toString(), (BigInt(o.quantity) - BigInt(o.filled)).toString()])
        };
    }

    static async getTrades(params: {
        symbol: string;
        limit: number;
        user?: string;
        orderBy: "asc" | "desc";
    }) {
        const { symbol, limit, user, orderBy } = params;

        const pool = await this.findPool(symbol);

        if (!pool) {
            throw new Error("Pool not found");
        }

        const poolId = pool.orderBook;

        if (!poolId) {
            throw new Error("Pool order book address not found");
        }

        let recentTrades;

        if (user) {
            const userTrades = await ponderDb
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

            recentTrades = userTrades.map((result: any) => result.trade);
        } else {
            recentTrades = await ponderDb
                .select()
                .from(orderBookTrades)
                .where(eq(orderBookTrades.poolId, poolId))
                .orderBy(orderBy === "asc" ? asc(orderBookTrades.timestamp) : desc(orderBookTrades.timestamp))
                .limit(limit)
                .execute();
        }

        return recentTrades.map((trade: any) => ({
            id: trade.id || "",
            price: trade.price ? trade.price.toString() : "0",
            qty: trade.quantity ? trade.quantity.toString() : "0",
            time: trade.timestamp ? trade.timestamp * 1000 : Date.now(),
            isBuyerMaker: trade.side === "Sell",
            isBestMatch: true,
        }));
    }

    static async getAllOrders(params: {
        symbol?: string;
        limit: number;
        address: string;
    }) {
        const { symbol, limit, address } = params;

        let query = ponderDb.select().from(orders).where(eq(orders.userAddress, address.toLowerCase() as `0x${string}`));

        if (symbol) {
            const pool = await this.findPool(symbol);

            if (!pool) {
                throw new Error("Pool not found");
            }

            const poolId = pool.orderBook;
            if (poolId) {
                query = ponderDb.select().from(orders).where(and(eq(orders.userAddress, address.toLowerCase() as `0x${string}`), eq(orders.poolId, poolId)));
            }
        }

        const effectiveLimit = Math.min(limit, 1000);
        const userOrders = await query.orderBy(desc(orders.timestamp)).limit(effectiveLimit).execute();

        // Collect all unique poolIds to avoid N+1 queries
        const uniquePoolIds = [...new Set(userOrders.map(order => order.poolId).filter(Boolean))];

        // Fetch all pool data in a single query
        const poolsData = await ponderDb
            .select()
            .from(pools)
            .where(inArray(pools.orderBook, uniquePoolIds as string[]))
            .execute();
        
        // Create a map for quick lookup
        const poolsMap = new Map(poolsData.map(pool => [pool.orderBook, pool]));

        return userOrders.map(order => {
            let decimals = 18;
            let orderSymbol = "UNKNOWN";

            if (order.poolId && poolsMap.has(order.poolId)) {
                const pool = poolsMap.get(order.poolId);
                if (pool?.quoteDecimals) {
                    decimals = Number(pool.quoteDecimals);
                }
                if (pool?.coin) {
                    orderSymbol = pool.coin;
                }
            }

            if (orderSymbol === "UNKNOWN" && symbol) {
                orderSymbol = symbol;
            }

            return {
                symbol: orderSymbol,
                orderId: order.orderId?.toString() || "",
                orderListId: -1,
                clientOrderId: order.id,
                price: order.price?.toString() || "0",
                origQty: order.quantity?.toString() || "0",
                executedQty: order.filled?.toString() || "0",
                cumulativeQuoteQty: order.executedQuoteQuantity
                    ? (order.executedQuoteQuantity / BigInt(10 ** decimals)).toString()
                    : "0",
                status: order.status,
                timeInForce: order.timeInForce || "GTC",
                type: order.type,
                side: order.side?.toUpperCase(),
                stopPrice: "0",
                icebergQty: "0",
                time: Number(order.timestamp) * 1000,
                updateTime: Number(order.timestamp) * 1000,
                isWorking: order.status === "NEW" || order.status === "PARTIALLY_FILLED",
                origQuoteOrderQty: "0",
            };
        });
    }

    static async getAccount(params: { address: string }) {
        const { address } = params;

        const userBalances = await ponderDb
            .select()
            .from(balances)
            .where(eq(balances.user, address.toLowerCase() as `0x${string}`))
            .execute();

        const balancesWithInfo = await Promise.all(
            userBalances.map(async balance => {
                const currency = await ponderDb
                    .select()
                    .from(currencies)
                    .where(
                        and(
                            eq(currencies.address, balance.currency as `0x${string}`), 
                            eq(currencies.chainId, balance.chainId)
                        )
                    )
                    .execute();

                const symbolValue = currency[0]?.symbol || "UNKNOWN";
                const amount = balance.amount || 0n;
                const locked = balance.lockedAmount || 0n;
                const free = amount >= locked ? (amount - locked).toString() : "0";

                return {
                    asset: symbolValue,
                    free: free,
                    locked: balance.lockedAmount?.toString() || "0",
                };
            })
        );

        const orderCount = await ponderDb
            .select({ count: sql`count(*)` })
            .from(orders)
            .where(eq(orders.userAddress, address.toLowerCase() as `0x${string}`))
            .execute();

        return {
            makerCommission: 10,
            takerCommission: 20,
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
    }

    static async getPairs() {
        const allPools = await ponderDb.select().from(pools).execute();

        return allPools.map(pool => {
            const symbol = pool.coin || "";
            const symbolParts = symbol.split("/");
            
            return {
                symbol: symbol.replace("/", ""),
                baseAsset: symbolParts[0] || symbol,
                quoteAsset: symbolParts[1] || "IDRX",
                poolId: pool.orderBook || pool.id,  // Use order_book as poolId (pool address)
                baseDecimals: pool.baseDecimals,
                quoteDecimals: pool.quoteDecimals,
            };
        });
    }

    static async getMarkets() {
        const allPools = await ponderDb.select().from(pools).execute();

        const orderBookIds = allPools.map(p => p.orderBook).filter(Boolean) as string[];

        // Get order book depth for liquidity + 24h volume + latest trades in parallel
        const now = Math.floor(Date.now() / 1000);
        const oneDayAgo = now - 86400;

        const [depthData, allDailyStats, allLatestTrades] = await Promise.all([
            // Compute depth from live orders (order_book_depth table is no longer written)
            orderBookIds.length > 0
                ? ponderDb.execute(sql`
                    SELECT pool_id, side, SUM(quantity - filled) as total_quantity
                    FROM orders
                    WHERE pool_id IN ${sql.raw(`(${orderBookIds.map(id => `'${id}'`).join(',')})`)}
                      AND status IN ('OPEN', 'PARTIALLY_FILLED')
                      AND price > 0
                    GROUP BY pool_id, side
                `).then(r => (r as any).rows || r || [])
                : Promise.resolve([]),

            orderBookIds.length > 0
                ? ponderDb.selectDistinctOn([dailyBuckets.poolId])
                    .from(dailyBuckets)
                    .where(and(inArray(dailyBuckets.poolId, orderBookIds), gte(dailyBuckets.openTime, oneDayAgo)))
                    .orderBy(dailyBuckets.poolId, desc(dailyBuckets.openTime))
                    .execute()
                : Promise.resolve([]),

            orderBookIds.length > 0
                ? ponderDb.selectDistinctOn([orderBookTrades.poolId], {
                    poolId: orderBookTrades.poolId,
                    price: orderBookTrades.price,
                })
                    .from(orderBookTrades)
                    .where(inArray(orderBookTrades.poolId, orderBookIds))
                    .orderBy(orderBookTrades.poolId, desc(orderBookTrades.timestamp))
                    .execute()
                : Promise.resolve([]),
        ]);

        const depthMap = new Map<string, { bid: string; ask: string }>();
        for (const row of depthData as any[]) {
            if (!depthMap.has(row.pool_id)) {
                depthMap.set(row.pool_id, { bid: "0", ask: "0" });
            }
            const entry = depthMap.get(row.pool_id)!;
            if (row.side === 'Buy') {
                entry.bid = row.total_quantity?.toString() || "0";
            } else if (row.side === 'Sell') {
                entry.ask = row.total_quantity?.toString() || "0";
            }
        }

        const dailyStatsMap = new Map<string, any>();
        for (const stat of allDailyStats) {
            dailyStatsMap.set(stat.poolId, stat);
        }

        const latestTradeMap = new Map<string, any>();
        for (const trade of allLatestTrades) {
            if (trade.poolId) latestTradeMap.set(trade.poolId, trade);
        }

        return allPools.map(pool => {
            const symbol = pool.coin || "";
            const symbolParts = symbol.split("/");
            const poolId = pool.id;
            const orderBookId = pool.orderBook || pool.id;
            const depth = depthMap.get(pool.id) || depthMap.get(orderBookId) || { bid: "0", ask: "0" };
            const daily = dailyStatsMap.get(orderBookId);
            const latestTrade = latestTradeMap.get(orderBookId);

            // Use pool.price (from indexer), latest trade price, or 0
            const latestPrice = latestTrade?.price?.toString() || pool.price?.toString() || "0";
            const priceNum = Number(latestPrice);
            const quoteDecimals = pool.quoteDecimals || 6;

            // Volume from daily bucket (24h) or pool's cumulative volume
            const dailyVolume = daily?.volume?.toString() || "0";
            const dailyQuoteVolume = daily?.quoteVolume?.toString() || "0";

            // Liquidity: sum of bid+ask depth, converted to quote value
            const bidLiqu = depth.bid ? Number(depth.bid) : 0;
            const askLiqu = depth.ask ? Number(depth.ask) : 0;
            // bid/ask quantities are in base units; convert to quote using price
            const totalLiquidityInQuote = priceNum > 0
                ? ((bidLiqu * priceNum / Math.pow(10, pool.baseDecimals || 18)) + (askLiqu * priceNum / Math.pow(10, pool.baseDecimals || 18))).toString()
                : (pool.volumeInQuote?.toString() || "0");

            return {
                symbol: symbol.replace("/", ""),
                baseAsset: symbolParts[0] || symbol,
                quoteAsset: symbolParts[1] || "IDRX",
                poolId: poolId,
                baseDecimals: pool.baseDecimals,
                quoteDecimals: pool.quoteDecimals,
                volume: dailyVolume,
                volumeInQuote: dailyQuoteVolume,
                latestPrice: latestPrice,
                bidLiquidity: depth.bid,
                askLiquidity: depth.ask,
                totalLiquidityInQuote: totalLiquidityInQuote,
                age: pool.timestamp ? Math.floor((now - pool.timestamp) / 60) : 0,
                createdAt: pool.timestamp || 0,
            };
        });
    }

    static async getTicker24Hr(params: { symbol: string }) {
        const { symbol } = params;

        const pool = await this.findPool(symbol);

        if (!pool) {
            throw new Error("Pool not found");
        }

        const poolId = pool.orderBook;

        if (!poolId) {
            throw new Error("Pool order book address not found");
        }

        const now = Math.floor(Date.now() / 1000);
        const oneDayAgo = now - 86400;

        const [dailyStats, latestTrade, bestBids, bestAsks] = await Promise.all([
            ponderDb
                .select()
                .from(dailyBuckets)
                .where(and(eq(dailyBuckets.poolId, poolId), gte(dailyBuckets.openTime, oneDayAgo)))
                .orderBy(desc(dailyBuckets.openTime))
                .limit(1)
                .execute(),

            ponderDb
                .select()
                .from(orderBookTrades)
                .where(eq(orderBookTrades.poolId, poolId))
                .orderBy(desc(orderBookTrades.timestamp))
                .limit(1)
                .execute(),

            // FIX: Query orders table directly instead of stale orderBookDepth cache
            ponderDb
                .select({ price: orders.price })
                .from(orders)
                .where(
                    and(
                        gt(orders.price, 0n),
                        eq(orders.poolId, poolId),
                        eq(orders.side, "Buy"),
                        or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
                    )
                )
                .orderBy(desc(orders.price))
                .limit(1)
                .execute(),

            // FIX: Query orders table directly instead of stale orderBookDepth cache
            ponderDb
                .select({ price: orders.price })
                .from(orders)
                .where(
                    and(
                        gt(orders.price, 0n),
                        eq(orders.poolId, poolId),
                        eq(orders.side, "Sell"),
                        or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
                    )
                )
                .orderBy(asc(orders.price))
                .limit(1)
                .execute()
        ]);

        const stats = (dailyStats[0] || {}) as any;
        const lastPrice = latestTrade[0]?.price?.toString() || bestBids[0]?.price?.toString() || "0";

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

        return {
            symbol: symbol,
            priceChange: priceChange,
            priceChangePercent: priceChangePercent,
            weightedAvgPrice: averageValue,
            prevClosePrice: prevClosePrice,
            lastPrice: lastPrice,
            lastQty: latestTrade[0]?.quantity?.toString() || bestBids[0]?.quantity?.toString() || "0",
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
    }

    static async getAllTickers24Hr() {
        const now = Math.floor(Date.now() / 1000);
        const oneDayAgo = now - 86400;

        // 1. All pools (1 query)
        const allPools = await ponderDb.select().from(pools).execute();
        if (allPools.length === 0) return [];

        const poolIds = allPools.map(p => p.orderBook).filter(Boolean) as string[];

        // 2. Batch all 4 data queries in parallel — DISTINCT ON gives best row per pool
        const [allDailyStats, allLatestTrades, allBestBids, allBestAsks] = await Promise.all([
            // Latest daily bucket per pool within last 24h
            ponderDb.selectDistinctOn([dailyBuckets.poolId])
                .from(dailyBuckets)
                .where(and(inArray(dailyBuckets.poolId, poolIds), gte(dailyBuckets.openTime, oneDayAgo)))
                .orderBy(dailyBuckets.poolId, desc(dailyBuckets.openTime))
                .execute(),

            // Latest trade per pool
            ponderDb.selectDistinctOn([orderBookTrades.poolId], {
                poolId: orderBookTrades.poolId,
                price: orderBookTrades.price,
                quantity: orderBookTrades.quantity,
                id: orderBookTrades.id,
            })
                .from(orderBookTrades)
                .where(inArray(orderBookTrades.poolId, poolIds))
                .orderBy(orderBookTrades.poolId, desc(orderBookTrades.timestamp))
                .execute(),

            // Best bid per pool (highest buy price)
            ponderDb.selectDistinctOn([orders.poolId], {
                poolId: orders.poolId,
                price: orders.price,
            })
                .from(orders)
                .where(and(
                    gt(orders.price, 0n),
                    inArray(orders.poolId, poolIds),
                    eq(orders.side, "Buy"),
                    or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
                ))
                .orderBy(orders.poolId, desc(orders.price))
                .execute(),

            // Best ask per pool (lowest sell price)
            ponderDb.selectDistinctOn([orders.poolId], {
                poolId: orders.poolId,
                price: orders.price,
            })
                .from(orders)
                .where(and(
                    gt(orders.price, 0n),
                    inArray(orders.poolId, poolIds),
                    eq(orders.side, "Sell"),
                    or(eq(orders.status, "OPEN"), eq(orders.status, "PARTIALLY_FILLED"))
                ))
                .orderBy(orders.poolId, asc(orders.price))
                .execute(),
        ]);

        // 3. Build lookup maps from results
        const dailyStatsByPool = new Map(allDailyStats.map(s => [s.poolId, s]));
        const latestTradeByPool = new Map(allLatestTrades.map(t => [t.poolId, t]));
        const bestBidByPool = new Map(allBestBids.map(b => [b.poolId, b.price]));
        const bestAskByPool = new Map(allBestAsks.map(a => [a.poolId, a.price]));

        // 4. Build response array
        return allPools
            .filter(pool => pool.orderBook)
            .map(pool => {
                const symbol = pool.coin || "";
                const poolId = pool.orderBook!;
                const stats = dailyStatsByPool.get(poolId) as any;
                const latestTrade = latestTradeByPool.get(poolId);

                const lastPrice = latestTrade?.price?.toString() || "0";
                const openPrice = stats?.open?.toString() ?? "0";
                const highPrice = stats?.high?.toString() ?? "0";
                const lowPrice = stats?.low?.toString() ?? "0";
                const volumeValue = stats?.volume?.toString() ?? "0";
                const quoteVolumeValue = stats?.quoteVolume?.toString() ?? "0";
                const openTimeValue = stats?.openTime ? stats.openTime * 1000 : oneDayAgo * 1000;
                const countValue = stats?.count ?? 0;
                const averageValue = stats?.average?.toString() ?? "0";

                const prevClosePrice = openPrice || lastPrice;
                const priceChange = (parseFloat(lastPrice) - parseFloat(prevClosePrice)).toString();
                const priceChangePercent =
                    parseFloat(prevClosePrice) > 0
                        ? (((parseFloat(lastPrice) - parseFloat(prevClosePrice)) / parseFloat(prevClosePrice)) * 100).toFixed(2)
                        : "0.00";

                return {
                    symbol: symbol.replace("/", ""),
                    priceChange,
                    priceChangePercent,
                    weightedAvgPrice: averageValue,
                    prevClosePrice,
                    lastPrice,
                    lastQty: latestTrade?.quantity?.toString() || "0",
                    bidPrice: bestBidByPool.get(poolId)?.toString() || "0",
                    askPrice: bestAskByPool.get(poolId)?.toString() || "0",
                    openPrice,
                    highPrice,
                    lowPrice,
                    volume: volumeValue,
                    quoteVolume: quoteVolumeValue,
                    openTime: openTimeValue,
                    closeTime: now * 1000,
                    firstId: "0",
                    lastId: latestTrade?.id || "0",
                    count: countValue,
                };
            });
    }

    static async getTickerPrice(params: { symbol: string }) {
        const { symbol } = params;

        const pool = await this.findPool(symbol);

        if (!pool) {
            throw new Error("Pool not found");
        }

        const poolId = pool.orderBook;

        if (!poolId) {
            throw new Error("Pool order book address not found");
        }

        const latestTrade = await ponderDb
            .select()
            .from(orderBookTrades)
            .where(eq(orderBookTrades.poolId, poolId))
            .orderBy(desc(orderBookTrades.timestamp))
            .limit(1)
            .execute();

        let price = "0";
        if (latestTrade.length > 0 && latestTrade[0]?.price) {
            price = latestTrade[0].price.toString();
        }

        return {
            symbol: symbol,
            price: price,
        };
    }

    static async getOpenOrders(params: { symbol?: string; address: string }) {
        const { symbol, address } = params;

        let query = ponderDb.select().from(orders).where(
            and(
                eq(orders.userAddress, address.toLowerCase() as `0x${string}`),
                or(eq(orders.status, "NEW"), eq(orders.status, "PARTIALLY_FILLED"), eq(orders.status, "OPEN"))
            )
        );

        if (symbol) {
            const pool = await this.findPool(symbol);

            if (!pool) {
                throw new Error("Pool not found");
            }

            const poolId = pool.orderBook;
            if (poolId) {
                query = ponderDb.select().from(orders).where(
                    and(
                        eq(orders.userAddress, address.toLowerCase() as `0x${string}`),
                        or(eq(orders.status, "NEW"), eq(orders.status, "PARTIALLY_FILLED"), eq(orders.status, "OPEN")),
                        eq(orders.poolId, poolId)
                    )
                );
            }
        }

        const openOrders = await query.orderBy(desc(orders.timestamp)).limit(500).execute();
        
        const uniquePoolIds = [...new Set(openOrders.map(order => order.poolId).filter(Boolean))];
        
        const poolsData = await ponderDb
            .select()
            .from(pools)
            .where(inArray(pools.orderBook, uniquePoolIds as string[]))
            .execute();
        
        const poolsMap = new Map(poolsData.map(pool => [pool.orderBook, pool]));

        return openOrders.map(order => {
            let orderSymbol = symbol;
            let decimals = 18;

            if (order.poolId && poolsMap.has(order.poolId)) {
                const pool = poolsMap.get(order.poolId);
                orderSymbol = pool?.coin || "UNKNOWN";
                if (pool?.quoteDecimals) {
                    decimals = Number(pool.quoteDecimals);
                }
            }

            return {
                symbol: orderSymbol,
                orderId: order.orderId?.toString() || "",
                orderListId: -1,
                clientOrderId: order.id,
                price: order.price?.toString() || "0",
                origQty: order.quantity?.toString() || "0",
                executedQty: order.filled?.toString() || "0",
                cumulativeQuoteQty: order.executedQuoteQuantity
                    ? (order.executedQuoteQuantity / BigInt(10 ** decimals)).toString()
                    : "0",
                status: order.status,
                timeInForce: order.timeInForce || "GTC",
                type: order.type,
                side: order.side?.toUpperCase(),
                stopPrice: "0",
                icebergQty: "0",
                time: Number(order.timestamp) * 1000,
                updateTime: Number(order.timestamp) * 1000,
                isWorking: true,
                origQuoteOrderQty: "0",
            };
        });
    }

    private static formatKlineData(bucket: BucketData): BinanceKlineData {
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
}