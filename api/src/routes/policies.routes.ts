import { Elysia, t } from 'elysia';
import { ponderPool } from '../config/database';

// Helper: run a parameterized SQL query against the Ponder DB
async function runQuery<T extends object>(text: string, params: unknown[] = []): Promise<T[]> {
    const client = await ponderPool.connect();
    try {
        const result = await client.query<T>(text, params);
        return result.rows;
    } finally {
        client.release();
    }
}

export const policiesRoutes = new Elysia({ prefix: '/api' })
    .get('/policies', async (ctx) => {
        try {
            const { query } = ctx as any;
            const owner = query?.owner;
            const chainId = parseInt(query?.chainId as string) || 84532;

            if (!owner) {
                ctx.set.status = 400;
                return { success: false, error: "owner query parameter is required" };
            }

            const policies = await runQuery<any>(`
                SELECT * FROM agent_policies 
                WHERE LOWER(owner) = LOWER($1) AND "chainId" = $2
            `, [owner.toLowerCase(), chainId]);

            const data = policies.map(p => ({
                id: p.id,
                owner: p.owner,
                chainId: p.chainId,
                agentTokenId: p.agentTokenId?.toString(),
                maxTradeSize: p.maxTradeSize?.toString() || null,
                maxDailyVolume: p.maxDailyVolume?.toString() || null,
                allowedPools: p.allowedPools || [],
                restrictedPools: p.restrictedPools || [],
                enableCircuitBreaker: p.enableCircuitBreaker ?? true,
            }));

            return {
                success: true,
                data,
                count: policies.length
            };
        } catch (error) {
            console.error('Error fetching policies:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch policies: ${error}` };
        }
    }, {
        detail: {
            summary: 'Get policies for owner',
            description: 'Get all policies for a user address (all their installed agents)',
            tags: ['Policies'],
        },
    })
    .get('/users/:address/analytics', async (ctx) => {
        try {
            const { params, query } = ctx as any;
            const address = params.address;
            const window = query?.window || 'all';
            const chainId = parseInt(query?.chainId as string) || 84532;

            // Validate address format
            if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
                ctx.set.status = 400;
                return { success: false, error: "Invalid address format" };
            }

            // Validate window
            const validWindows = ['24h', '7d', '30d', 'all'];
            if (!validWindows.includes(window)) {
                ctx.set.status = 400;
                return { success: false, error: "Invalid window. Must be: 24h, 7d, 30d, all" };
            }

            const windowStart = getWindowStart(window);
            const now = Math.floor(Date.now() / 1000);

            // Get PnL data from trades joined with orders and pools
            let timeFilter = '';
            const pnlParams: any[] = [chainId, address.toLowerCase()];
            
            if (windowStart) {
                timeFilter = ` AND o.timestamp >= $3`;
                pnlParams.push(windowStart);
            }

            const pnlData = await runQuery<any>(`
                SELECT 
                    o.pool_id,
                    o.side,
                    COALESCE(SUM(t.quantity), 0)::text as total_quantity,
                    COALESCE(SUM(t.quantity * t.price), 0)::text as total_quote_value,
                    COUNT(*)::int as trade_count,
                    p.base_decimals,
                    p.quote_decimals,
                    p.price as last_price,
                    p.coin as symbol
                FROM trades t
                INNER JOIN orders o ON t.order_id = o.id
                INNER JOIN pools p ON o.pool_id = p.order_book
                WHERE o.chain_id = $1 AND LOWER(o.user_address) = $2
                    AND (o.status = 'FILLED' OR o.status = 'PARTIALLY_FILLED')
                    ${timeFilter}
                GROUP BY o.pool_id, o.side, p.base_decimals, p.quote_decimals, p.price, p.coin
            `, pnlParams);

            // Get fill rate data
            let fillParams: any[] = [chainId, address.toLowerCase()];
            let fillFilter = '';
            if (windowStart) {
                fillFilter = ' AND timestamp >= $3';
                fillParams.push(windowStart);
            }

            const fillData = await runQuery<any>(`
                SELECT status, COUNT(*)::int as count
                FROM orders
                WHERE chain_id = $1 AND LOWER(user_address) = $2 ${fillFilter}
                GROUP BY status
            `, fillParams);

            // Process data
            const poolMap = new Map<string, any>();
            
            for (const row of pnlData) {
                const key = row.pool_id;
                if (!poolMap.has(key)) {
                    poolMap.set(key, {
                        poolId: key,
                        symbol: row.symbol,
                        baseDecimals: row.base_decimals,
                        quoteDecimals: row.quote_decimals,
                        lastPrice: row.last_price,
                        buyQuantity: 0n,
                        buyQuoteValue: 0n,
                        sellQuantity: 0n,
                        sellQuoteValue: 0n,
                        tradeCount: 0,
                    });
                }
                const pool = poolMap.get(key);
                const qty = BigInt(row.total_quantity || 0);
                const quoteVal = BigInt(row.total_quote_value || 0);
                
                if (row.side === 'Buy') {
                    pool.buyQuantity += qty;
                    pool.buyQuoteValue += quoteVal;
                } else if (row.side === 'Sell') {
                    pool.sellQuantity += qty;
                    pool.sellQuoteValue += quoteVal;
                }
                pool.tradeCount += parseInt(row.trade_count || '0');
            }

            // Compute analytics
            let totalRealizedPnl = 0;
            let totalUnrealizedPnl = 0;
            let totalVolume = 0;
            let totalTradeCount = 0;
            let winningPools = 0;
            let losingPools = 0;

            const poolResults: any[] = [];

            for (const [, pool] of poolMap) {
                const baseDec = pool.baseDecimals ?? 18;
                const quoteDec = pool.quoteDecimals ?? 6;
                const baseMultiplier = 10 ** baseDec;
                const quoteMultiplier = 10 ** quoteDec;
                const decimalDivisor = baseMultiplier * quoteMultiplier;

                const avgBuyPrice = pool.buyQuantity > 0n
                    ? pool.buyQuoteValue / pool.buyQuantity
                    : 0n;
                const avgSellPrice = pool.sellQuantity > 0n
                    ? pool.sellQuoteValue / pool.sellQuantity
                    : 0n;

                const matchedQty = pool.buyQuantity < pool.sellQuantity ? pool.buyQuantity : pool.sellQuantity;
                const hasBothSides = pool.buyQuantity > 0n && pool.sellQuantity > 0n;

                let realizedPnlHuman = 0;
                if (hasBothSides && matchedQty > 0n) {
                    const realizedPnlRaw = (avgSellPrice - avgBuyPrice) * matchedQty;
                    realizedPnlHuman = Number(realizedPnlRaw) / decimalDivisor;
                }

                const netPosition = pool.buyQuantity - pool.sellQuantity;
                let unrealizedPnlHuman = 0;
                const lastPrice = pool.lastPrice ?? 0n;

                if (netPosition > 0n && lastPrice > 0n && avgBuyPrice > 0n) {
                    const unrealizedPnlRaw = (lastPrice - avgBuyPrice) * netPosition;
                    unrealizedPnlHuman = Number(unrealizedPnlRaw) / decimalDivisor;
                }

                const poolVolume = Number(pool.buyQuoteValue + pool.sellQuoteValue) / decimalDivisor;

                totalRealizedPnl += realizedPnlHuman;
                totalUnrealizedPnl += unrealizedPnlHuman;
                totalVolume += poolVolume;
                totalTradeCount += pool.tradeCount;

                if (hasBothSides) {
                    if (realizedPnlHuman > 0) winningPools++;
                    else losingPools++;
                }

                poolResults.push({
                    poolId: pool.poolId,
                    symbol: pool.symbol ?? 'UNKNOWN',
                    realizedPnl: realizedPnlHuman.toFixed(6),
                    unrealizedPnl: unrealizedPnlHuman.toFixed(6),
                    totalBuyQuantity: (Number(pool.buyQuantity) / baseMultiplier).toFixed(baseDec),
                    totalSellQuantity: (Number(pool.sellQuantity) / baseMultiplier).toFixed(baseDec),
                    openPositionSize: netPosition > 0n
                        ? (Number(netPosition) / baseMultiplier).toFixed(baseDec)
                        : '0',
                    avgEntryPrice: avgBuyPrice > 0n
                        ? (Number(avgBuyPrice) / quoteMultiplier).toFixed(quoteDec)
                        : '0',
                    avgExitPrice: avgSellPrice > 0n
                        ? (Number(avgSellPrice) / quoteMultiplier).toFixed(quoteDec)
                        : '0',
                    lastPrice: lastPrice > 0n
                        ? (Number(lastPrice) / quoteMultiplier).toFixed(quoteDec)
                        : '0',
                    tradeCount: pool.tradeCount,
                });
            }

            // Sort pools by absolute realized PnL descending
            poolResults.sort((a, b) => Math.abs(Number(b.realizedPnl)) - Math.abs(Number(a.realizedPnl)));

            // Compute fill rate
            const statusCounts: Record<string, number> = {};
            for (const row of fillData) {
                if (row.status) statusCounts[row.status] = parseInt(row.count || '0');
            }

            const filledCount = (statusCounts['FILLED'] || 0) + (statusCounts['PARTIALLY_FILLED'] || 0);
            const totalOrders = Object.entries(statusCounts)
                .filter(([status]) => status !== 'REJECTED')
                .reduce((sum, [, count]) => sum + count, 0);
            const fillRate = totalOrders > 0 ? filledCount / totalOrders : 0;

            const winRate = (winningPools + losingPools) > 0 ? winningPools / (winningPools + losingPools) : 0;
            const totalPnl = totalRealizedPnl + totalUnrealizedPnl;

            return {
                success: true,
                data: {
                    address: address.toLowerCase(),
                    chainId,
                    window,
                    realizedPnl: totalRealizedPnl.toFixed(6),
                    unrealizedPnl: totalUnrealizedPnl.toFixed(6),
                    totalPnl: totalPnl.toFixed(6),
                    winRate: Math.round(winRate * 10000) / 10000,
                    fillRate: Math.round(fillRate * 10000) / 10000,
                    totalTrades: totalTradeCount,
                    winningPools,
                    losingPools,
                    totalPoolsTraded: poolMap.size,
                    totalOrdersPlaced: totalOrders,
                    totalOrdersFilled: filledCount,
                    totalVolume: totalVolume.toFixed(6),
                    avgTradeSize: totalTradeCount > 0 ? (totalVolume / totalTradeCount).toFixed(6) : '0',
                    periodStart: windowStart ?? 0,
                    periodEnd: now,
                    pools: poolResults,
                }
            };
        } catch (error) {
            console.error('Error computing user analytics:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to compute user analytics: ${error}` };
        }
    }, {
        params: t.Object({
            address: t.String(),
        }),
        detail: {
            summary: 'Get user analytics',
            description: 'Compute PnL, win rate, fill rate for a user address',
            tags: ['Analytics'],
        },
    });

function getWindowStart(window: string): number | null {
    if (window === 'all') return null;
    
    const now = Math.floor(Date.now() / 1000);
    const seconds: Record<string, number> = {
        '24h': 24 * 60 * 60,
        '7d': 7 * 24 * 60 * 60,
        '30d': 30 * 24 * 60 * 60,
    };
    
    return now - (seconds[window] || 0);
}

export const agentOrdersRoutes = new Elysia({ prefix: '/api' })
    .get('/agent-orders', async (ctx) => {
        try {
            const { query } = ctx as any;
            const chainId = parseInt(query?.chainId as string) || 84532;
            const executor = query?.executor;
            const status = query?.status;
            const limit = Math.min(Math.max(parseInt(query?.limit as string ?? '50') || 50, 1), 100);
            const offset = Math.max(parseInt(query?.offset as string ?? '0') || 0, 0);

            let conditions = `WHERE "chainId" = $1 AND "agentTokenId" > 0`;
            const paramsArr: any[] = [chainId];

            if (executor) {
                conditions += ` AND LOWER(executor) = LOWER($${paramsArr.length + 1})`;
                paramsArr.push(executor.toLowerCase());
            }

            if (status) {
                conditions += ` AND UPPER(status) = UPPER($${paramsArr.length + 1})`;
                paramsArr.push(status.toUpperCase());
            }

            const orderLimitOffset = `ORDER BY "timestamp" DESC LIMIT $${paramsArr.length + 1} OFFSET $${paramsArr.length + 2}`;
            paramsArr.push(limit, offset);

            const orders = await runQuery<any>(`
                SELECT * FROM orders ${conditions} ${orderLimitOffset}
            `, paramsArr);

            const data = orders.map(order => ({
                ...order,
                orderId: order.orderId?.toString(),
                price: order.price?.toString(),
                quantity: order.quantity?.toString(),
                filled: order.filled?.toString(),
                quoteQuantity: order.quoteQuantity?.toString(),
                executedQuoteQuantity: order.executedQuoteQuantity?.toString(),
                agentTokenId: order.agentTokenId?.toString(),
            }));

            return {
                success: true,
                data,
                count: orders.length,
                pagination: { limit, offset }
            };
        } catch (error) {
            console.error('Error fetching agent orders:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch agent orders: ${error}` };
        }
    }, {
        detail: {
            summary: 'Get all agent orders',
            description: 'Get all orders placed by agents with optional filters',
            tags: ['Agents'],
        },
    });
