import { getAddress } from 'viem';
import { ponderPool } from '../config/database';

// Helper: run a parameterized SQL query against the Ponder DB
async function query<T extends object>(text: string, params: unknown[] = []): Promise<T[]> {
    const client = await ponderPool.connect();
    try {
        const result = await client.query<T>(text, params);
        return result.rows;
    } finally {
        client.release();
    }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeaderboardType = 'user' | 'agent';
export type SortBy = 'pnl' | 'volume' | 'managed_users';
export type LeaderboardWindow = '24h' | '7d' | '30d' | 'all';

export interface LeaderboardParams {
    type?: LeaderboardType;
    sortBy: SortBy;
    window: LeaderboardWindow;
    chainId: number;
    limit: number;
    offset: number;
}

interface UserEntry {
    rank: number;
    type: 'user';
    address: string;
    realizedPnl: string;
    totalVolume: string;
    winRate: number;
    fillRate: number;
    totalTrades: number;
}

interface AgentEntry {
    rank: number;
    type: 'agent';
    agentTokenId: string;
    metadataUri: string | null;
    realizedPnl: string;
    totalVolume: string;
    managedUsers: number;
    winRate: number;
    fillRate: number;
    totalTrades: number;
}

type LeaderboardEntry = UserEntry | AgentEntry;

interface EntityMetrics {
    realizedPnl: number;
    totalVolume: number;
    winRate: number;
    fillRate: number;
    totalTrades: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_WINDOWS: LeaderboardWindow[] = ['24h', '7d', '30d', 'all'];

export function isValidWindow(w: string): w is LeaderboardWindow {
    return VALID_WINDOWS.includes(w as LeaderboardWindow);
}

function windowToTimestamp(window: LeaderboardWindow): number | null {
    if (window === 'all') return null;
    const now = Math.floor(Date.now() / 1000);
    const durations: Record<string, number> = {
        '24h': 86400,
        '7d': 604800,
        '30d': 2592000,
    };
    return now - (durations[window] ?? 0);
}

function toBigInt(val: unknown): bigint {
    if (val === null || val === undefined || val === '') return 0n;
    const s = String(val).split('.')[0];
    return s ? BigInt(s) : 0n;
}

// ─── Raw SQL Query Helpers ────────────────────────────────────────────────────

interface PnlRow {
    entity_key: string;
    pool_id: string;
    side: string;
    total_quantity: string;
    total_quote_value: string;
    trade_count: number;
    base_decimals: number;
    quote_decimals: number;
    last_price: string;
    symbol: string;
}

interface FillRow {
    entity_key: string;
    status: string;
    cnt: number;
}

async function fetchPnlRows(
    entityType: LeaderboardType,
    chainId: number,
    windowStart: number | null,
): Promise<PnlRow[]> {
    const params: unknown[] = [chainId];
    let windowFilter = '';
    if (windowStart !== null) {
        params.push(windowStart);
        windowFilter = `AND t.timestamp >= $${params.length}`;
    }

    if (entityType === 'user') {
        const sql = `
            SELECT
                lower(o.user_address) AS entity_key,
                o.pool_id,
                o.side,
                coalesce(sum(t.quantity), 0)::text           AS total_quantity,
                coalesce(sum(t.quantity * t.price), 0)::text AS total_quote_value,
                count(*)::int                                AS trade_count,
                p.base_decimals,
                p.quote_decimals,
                p.price::text                                AS last_price,
                p.coin                                       AS symbol
            FROM trades t
            INNER JOIN orders o ON t.order_id = o.id
            INNER JOIN pools p  ON o.pool_id  = p.order_book
            WHERE o.chain_id = $1
              AND o.status IN ('FILLED', 'PARTIALLY_FILLED')
              ${windowFilter}
            GROUP BY lower(o.user_address), o.pool_id, o.side, p.base_decimals, p.quote_decimals, p.price, p.coin
        `;
        return query<PnlRow>(sql, params);
    }

    // Agent leaderboard: aggregate user trades by their active agent installation.
    // The OrderPlaced event always emits agentTokenId=0 for direct user orders,
    // so we use agent_installations to correctly attribute trades to managing agents.
    const sql = `
        SELECT
            ai.agent_token_id::text AS entity_key,
            o.pool_id,
            o.side,
            coalesce(sum(t.quantity), 0)::text           AS total_quantity,
            coalesce(sum(t.quantity * t.price), 0)::text AS total_quote_value,
            count(*)::int                                AS trade_count,
            p.base_decimals,
            p.quote_decimals,
            p.price::text                                AS last_price,
            p.coin                                       AS symbol
        FROM trades t
        INNER JOIN orders o  ON t.order_id = o.id
        INNER JOIN pools p   ON o.pool_id  = p.order_book
        INNER JOIN agent_installations ai
            ON lower(o.user_address) = lower(ai.owner)
           AND o.chain_id = ai.chain_id
           AND ai.enabled = true
        WHERE o.chain_id = $1
          AND o.status IN ('FILLED', 'PARTIALLY_FILLED')
          ${windowFilter}
        GROUP BY ai.agent_token_id, o.pool_id, o.side, p.base_decimals, p.quote_decimals, p.price, p.coin
    `;
    return query<PnlRow>(sql, params);
}

async function fetchFillRows(
    entityType: LeaderboardType,
    chainId: number,
    windowStart: number | null,
): Promise<FillRow[]> {
    const params: unknown[] = [chainId];
    let windowFilter = '';
    if (windowStart !== null) {
        params.push(windowStart);
        windowFilter = `AND o.timestamp >= $${params.length}`;
    }

    if (entityType === 'user') {
        const sql = `
            SELECT
                lower(o.user_address) AS entity_key,
                o.status,
                count(*)::int AS cnt
            FROM orders o
            WHERE o.chain_id = $1
              ${windowFilter}
            GROUP BY lower(o.user_address), o.status
        `;
        return query<FillRow>(sql, params);
    }

    // Agent leaderboard: fill rate based on managed users' orders.
    const sql = `
        SELECT
            ai.agent_token_id::text AS entity_key,
            o.status,
            count(*)::int AS cnt
        FROM orders o
        INNER JOIN agent_installations ai
            ON lower(o.user_address) = lower(ai.owner)
           AND o.chain_id = ai.chain_id
           AND ai.enabled = true
        WHERE o.chain_id = $1
          ${windowFilter}
        GROUP BY ai.agent_token_id, o.status
    `;
    return query<FillRow>(sql, params);
}

async function fetchManagedUsers(chainId: number): Promise<Map<string, number>> {
    const rows = await query<{ agent_token_id: string; managed_users: number }>(`
        SELECT
            agent_token_id::text AS agent_token_id,
            count(DISTINCT owner)::int AS managed_users
        FROM agent_installations
        WHERE chain_id = $1
          AND enabled = true
        GROUP BY agent_token_id
    `, [chainId]);

    const map = new Map<string, number>();
    for (const r of rows) map.set(r.agent_token_id, r.managed_users);
    return map;
}

async function fetchAgentMetadata(chainId: number, tokenIds: string[]): Promise<Map<string, string | null>> {
    if (tokenIds.length === 0) return new Map();

    const rows = await query<{ token_id: string; metadata_uri: string | null }>(`
        SELECT token_id::text AS token_id, metadata_uri
        FROM agent_registry
        WHERE chain_id = $1
          AND token_id = ANY($2::numeric[])
    `, [chainId, `{${tokenIds.join(',')}}`]);

    const map = new Map<string, string | null>();
    for (const r of rows) map.set(r.token_id, r.metadata_uri);
    return map;
}

// ─── In-memory PnL computation ────────────────────────────────────────────────

function computeMetrics(pnlRows: PnlRow[], fillRows: FillRow[]): Map<string, EntityMetrics> {
    interface PoolData {
        buyQuantity: bigint;
        buyQuoteValue: bigint;
        sellQuantity: bigint;
        sellQuoteValue: bigint;
        tradeCount: number;
        baseDecimals: number;
        quoteDecimals: number;
    }

    const entityPoolMap = new Map<string, Map<string, PoolData>>();

    for (const row of pnlRows) {
        if (!row.entity_key) continue;

        let poolMap = entityPoolMap.get(row.entity_key);
        if (!poolMap) {
            poolMap = new Map();
            entityPoolMap.set(row.entity_key, poolMap);
        }

        let poolData = poolMap.get(row.pool_id);
        if (!poolData) {
            poolData = {
                buyQuantity: 0n,
                buyQuoteValue: 0n,
                sellQuantity: 0n,
                sellQuoteValue: 0n,
                tradeCount: 0,
                baseDecimals: row.base_decimals,
                quoteDecimals: row.quote_decimals,
            };
            poolMap.set(row.pool_id, poolData);
        }

        const qty = toBigInt(row.total_quantity);
        const quoteVal = toBigInt(row.total_quote_value);

        if (row.side === 'Buy') {
            poolData.buyQuantity += qty;
            poolData.buyQuoteValue += quoteVal;
        } else if (row.side === 'Sell') {
            poolData.sellQuantity += qty;
            poolData.sellQuoteValue += quoteVal;
        }
        poolData.tradeCount += Number(row.trade_count);
    }

    // Build fill rate per entity
    interface FillData { filled: number; partial: number; total: number }
    const fillMap = new Map<string, FillData>();

    for (const row of fillRows) {
        if (!row.entity_key) continue;
        let fd = fillMap.get(row.entity_key);
        if (!fd) {
            fd = { filled: 0, partial: 0, total: 0 };
            fillMap.set(row.entity_key, fd);
        }
        if (row.status !== 'REJECTED') fd.total += Number(row.cnt);
        if (row.status === 'FILLED') fd.filled += Number(row.cnt);
        if (row.status === 'PARTIALLY_FILLED') fd.partial += Number(row.cnt);
    }

    const result = new Map<string, EntityMetrics>();

    for (const [entityKey, poolMap] of entityPoolMap) {
        let totalRealizedPnl = 0;
        let totalVolume = 0;
        let winningPools = 0;
        let poolsWithBothSides = 0;
        let totalTrades = 0;

        for (const [, pool] of poolMap) {
            const { buyQuantity, buyQuoteValue, sellQuantity, sellQuoteValue, baseDecimals, quoteDecimals, tradeCount } = pool;
            const decimalDivisor = BigInt(10) ** BigInt(baseDecimals + quoteDecimals);

            const avgBuyPrice = buyQuantity > 0n ? buyQuoteValue / buyQuantity : 0n;
            const avgSellPrice = sellQuantity > 0n ? sellQuoteValue / sellQuantity : 0n;
            const matchedQty = buyQuantity < sellQuantity ? buyQuantity : sellQuantity;

            const realizedPnlRaw = (avgSellPrice - avgBuyPrice) * matchedQty;
            const poolPnl = Number(realizedPnlRaw) / Number(decimalDivisor);

            const volumeRaw = buyQuoteValue + sellQuoteValue;
            const poolVolume = Number(volumeRaw) / Number(decimalDivisor);

            totalRealizedPnl += poolPnl;
            totalVolume += poolVolume;
            totalTrades += tradeCount;

            if (buyQuantity > 0n && sellQuantity > 0n) {
                poolsWithBothSides++;
                if (poolPnl > 0) winningPools++;
            }
        }

        const winRate = poolsWithBothSides > 0
            ? Math.round((winningPools / poolsWithBothSides) * 10000) / 10000
            : 0;

        const fd = fillMap.get(entityKey);
        const fillRate = fd && fd.total > 0
            ? Math.round(((fd.filled + fd.partial) / fd.total) * 10000) / 10000
            : 0;

        result.set(entityKey, { realizedPnl: totalRealizedPnl, totalVolume, winRate, fillRate, totalTrades });
    }

    return result;
}

// ─── Main Service Function ────────────────────────────────────────────────────

export class LeaderboardService {
    static async getLeaderboard(params: LeaderboardParams) {
        const { type, sortBy, window, chainId, limit, offset } = params;
        const windowStart = windowToTimestamp(window);

        const includeUsers = !type || type === 'user';
        const includeAgents = !type || type === 'agent';

        // Fetch user metrics
        let userMetrics = new Map<string, EntityMetrics>();
        if (includeUsers) {
            const [pnlRows, fillRows] = await Promise.all([
                fetchPnlRows('user', chainId, windowStart),
                fetchFillRows('user', chainId, windowStart),
            ]);
            userMetrics = computeMetrics(pnlRows, fillRows);
        }

        // Fetch agent metrics + managed users
        let agentMetrics = new Map<string, EntityMetrics>();
        let managedUsersMap = new Map<string, number>();

        if (includeAgents) {
            const [pnlRows, fillRows, managed] = await Promise.all([
                fetchPnlRows('agent', chainId, windowStart),
                fetchFillRows('agent', chainId, windowStart),
                fetchManagedUsers(chainId),
            ]);
            agentMetrics = computeMetrics(pnlRows, fillRows);
            managedUsersMap = managed;
        }

        // Build combined list
        const allEntries: Array<{
            entityKey: string;
            entityType: LeaderboardType;
            metrics: EntityMetrics;
            managedUsers?: number;
        }> = [];

        for (const [key, metrics] of userMetrics) {
            allEntries.push({ entityKey: key, entityType: 'user', metrics });
        }
        for (const [key, metrics] of agentMetrics) {
            allEntries.push({ entityKey: key, entityType: 'agent', metrics, managedUsers: managedUsersMap.get(key) ?? 0 });
        }

        // Sort: primary metric DESC, then totalTrades DESC, then winRate DESC
        allEntries.sort((a, b) => {
            let primary: number;
            if (sortBy === 'pnl') {
                primary = b.metrics.realizedPnl - a.metrics.realizedPnl;
            } else if (sortBy === 'managed_users') {
                primary = (b.managedUsers ?? 0) - (a.managedUsers ?? 0);
            } else {
                primary = b.metrics.totalVolume - a.metrics.totalVolume;
            }
            if (primary !== 0) return primary;
            const tradeDiff = b.metrics.totalTrades - a.metrics.totalTrades;
            if (tradeDiff !== 0) return tradeDiff;
            return b.metrics.winRate - a.metrics.winRate;
        });

        const count = allEntries.length;
        const paginated = allEntries.slice(offset, offset + limit);

        // Fetch agent metadata only for paginated results
        const agentTokenIds = paginated.filter(e => e.entityType === 'agent').map(e => e.entityKey);
        const agentMetadataMap = await fetchAgentMetadata(chainId, agentTokenIds);

        const data: LeaderboardEntry[] = paginated.map((entry, idx) => {
            const rank = offset + idx + 1;
            const { metrics } = entry;

            if (entry.entityType === 'user') {
                let address = entry.entityKey;
                try { address = getAddress(entry.entityKey); } catch { /* keep lowercase */ }
                return {
                    rank,
                    type: 'user' as const,
                    address,
                    realizedPnl: metrics.realizedPnl.toFixed(6),
                    totalVolume: metrics.totalVolume.toFixed(6),
                    winRate: metrics.winRate,
                    fillRate: metrics.fillRate,
                    totalTrades: metrics.totalTrades,
                };
            } else {
                return {
                    rank,
                    type: 'agent' as const,
                    agentTokenId: entry.entityKey,
                    metadataUri: agentMetadataMap.get(entry.entityKey) ?? null,
                    realizedPnl: metrics.realizedPnl.toFixed(6),
                    totalVolume: metrics.totalVolume.toFixed(6),
                    managedUsers: entry.managedUsers ?? 0,
                    winRate: metrics.winRate,
                    fillRate: metrics.fillRate,
                    totalTrades: metrics.totalTrades,
                };
            }
        });

        return { success: true, data, count, pagination: { limit, offset } };
    }
}
