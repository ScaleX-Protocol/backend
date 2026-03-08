import { Elysia } from 'elysia';
import { ponderPool } from '../config/database';
import { PredictionsService } from '../services/predictions.service';

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

export const predictionsRoutes = new Elysia({ prefix: '/api' })
    // GET /api/predictions/markets — list prediction markets
    .get('/predictions/markets', async (ctx) => {
        try {
            const chainId = ctx.query?.chainId ? parseInt(ctx.query.chainId as string) : undefined;
            const status = ctx.query?.status !== undefined ? parseInt(ctx.query.status as string) : undefined;
            const limit = ctx.query?.limit ? parseInt(ctx.query.limit as string) : 50;

            let query = `
                SELECT DISTINCT ON (id)
                    id, chain_id as "chainId", market_id as "marketId",
                    market_type as "marketType", status, base_token as "baseToken",
                    strike_price as "strikePrice", opening_twap as "openingTwap",
                    start_time as "startTime", end_time as "endTime",
                    total_up as "totalUp", total_down as "totalDown",
                    outcome, protocol_fee as "protocolFee",
                    transaction_id as "transactionId"
                FROM prediction_markets
                WHERE 1=1
            `;
            const params: unknown[] = [];
            let paramIdx = 1;

            if (chainId !== undefined) {
                query += ` AND chain_id = $${paramIdx++}`;
                params.push(chainId);
            }
            if (status !== undefined) {
                query += ` AND status = $${paramIdx++}`;
                params.push(status);
            }

            query += ` ORDER BY id, end_time DESC LIMIT $${paramIdx}`;
            params.push(limit);

            const markets = await runQuery<any>(query, params);

            // Format bigint fields to strings
            const formatted = markets.map((m: any) => ({
                ...m,
                marketId: m.marketId?.toString() || '0',
                strikePrice: m.strikePrice?.toString() || '0',
                openingTwap: m.openingTwap?.toString() || '0',
                totalUp: m.totalUp?.toString() || '0',
                totalDown: m.totalDown?.toString() || '0',
                protocolFee: m.protocolFee?.toString() || null,
            }));

            return { markets: formatted, count: formatted.length };
        } catch (error) {
            console.error('Error fetching prediction markets:', error);
            ctx.set.status = 500;
            return { error: `Failed to fetch prediction markets: ${error}` };
        }
    }, {
        detail: {
            summary: 'List prediction markets',
            description: 'Get prediction markets with optional filters for chainId, status, and limit',
            tags: ['Predictions'],
        },
    })

    // GET /api/predictions/stats — overview stats across all markets
    .get('/predictions/stats', async (ctx) => {
        try {
            const chainId = ctx.query?.chainId ? parseInt(ctx.query.chainId as string) : undefined;

            let query = 'SELECT status, total_up as "totalUp", total_down as "totalDown" FROM prediction_markets WHERE 1=1';
            const params: unknown[] = [];

            if (chainId !== undefined) {
                query += ' AND chain_id = $1';
                params.push(chainId);
            }

            const markets = await runQuery<any>(query, params);

            const activeMarkets = markets.filter((m: any) => m.status === 0).length;
            const settledMarkets = markets.filter((m: any) => m.status === 2).length;
            const cancelledMarkets = markets.filter((m: any) => m.status === 3).length;

            let totalVolumeUp = 0n;
            let totalVolumeDown = 0n;
            for (const m of markets) {
                totalVolumeUp += BigInt(m.totalUp || 0);
                totalVolumeDown += BigInt(m.totalDown || 0);
            }

            // Count unique participants
            let participantQuery = 'SELECT COUNT(DISTINCT user_address)::int as count FROM prediction_positions WHERE 1=1';
            const participantParams: unknown[] = [];
            if (chainId !== undefined) {
                participantQuery += ' AND chain_id = $1';
                participantParams.push(chainId);
            }

            const participantRows = await runQuery<{ count: number }>(participantQuery, participantParams);
            const uniqueParticipants = participantRows[0]?.count ?? 0;

            return {
                totalMarkets: markets.length,
                activeMarkets,
                settledMarkets,
                cancelledMarkets,
                totalVolumeUp: totalVolumeUp.toString(),
                totalVolumeDown: totalVolumeDown.toString(),
                uniqueParticipants,
            };
        } catch (error) {
            console.error('Error fetching prediction stats:', error);
            ctx.set.status = 500;
            return { error: `Failed to fetch prediction stats: ${error}` };
        }
    }, {
        detail: {
            summary: 'Get prediction stats',
            description: 'Get platform-wide prediction market statistics',
            tags: ['Predictions'],
        },
    })

    // GET /api/predictions/events/:marketId — events for a specific market
    .get('/predictions/events/:marketId', async (ctx) => {
        try {
            const marketId = ctx.params.marketId;
            const limit = ctx.query?.limit ? parseInt(ctx.query.limit as string) : 50;

            const query = `
                SELECT
                    id, chain_id as "chainId", market_id as "marketId",
                    event_type as "eventType", user_address as "userAddress",
                    amount, predicted_up as "predictedUp", outcome,
                    payout, timestamp, transaction_id as "transactionId",
                    block_number as "blockNumber"
                FROM prediction_events
                WHERE market_id = $1
                ORDER BY timestamp DESC
                LIMIT $2
            `;

            const events = await runQuery<any>(query, [marketId, limit]);

            const formatted = events.map((e: any) => ({
                ...e,
                marketId: e.marketId?.toString() || '0',
                amount: e.amount?.toString() || null,
                payout: e.payout?.toString() || null,
                blockNumber: e.blockNumber?.toString() || '0',
            }));

            return { events: formatted, count: formatted.length };
        } catch (error) {
            console.error('Error fetching prediction events:', error);
            ctx.set.status = 500;
            return { error: `Failed to fetch prediction events: ${error}` };
        }
    }, {
        detail: {
            summary: 'Get prediction events',
            description: 'Get events for a specific prediction market',
            tags: ['Predictions'],
        },
    })

    // GET /api/predictions/positions/:userAddress — positions for a user
    .get('/predictions/positions/:userAddress', async (ctx) => {
        try {
            const userAddress = ctx.params.userAddress;
            const chainId = ctx.query?.chainId ? parseInt(ctx.query.chainId as string) : undefined;
            const onlyActive = ctx.query?.onlyActive === 'true';

            let query = `
                SELECT
                    p.id, p.chain_id as "chainId", p.market_id as "marketId",
                    p.user_address as "userAddress",
                    p.stake_up as "stakeUp", p.stake_down as "stakeDown",
                    p.claimed, p.payout, p.last_updated as "lastUpdated"
                FROM prediction_positions p
                WHERE p.user_address = $1
            `;
            const params: unknown[] = [userAddress];
            let paramIdx = 2;

            if (chainId !== undefined) {
                query += ` AND p.chain_id = $${paramIdx++}`;
                params.push(chainId);
            }
            if (onlyActive) {
                query += ` AND (p.stake_up > 0 OR p.stake_down > 0) AND p.claimed = false`;
            }

            query += ` ORDER BY p.last_updated DESC`;

            const positions = await runQuery<any>(query, params);

            const formatted = positions.map((p: any) => ({
                ...p,
                marketId: p.marketId?.toString() || '0',
                stakeUp: p.stakeUp?.toString() || '0',
                stakeDown: p.stakeDown?.toString() || '0',
                payout: p.payout?.toString() || null,
            }));

            return { positions: formatted, count: formatted.length };
        } catch (error) {
            console.error('Error fetching user positions:', error);
            ctx.set.status = 500;
            return { error: `Failed to fetch user positions: ${error}` };
        }
    }, {
        detail: {
            summary: 'Get user positions',
            description: 'Get prediction positions for a specific user',
            tags: ['Predictions'],
        },
    })

    // GET /api/predictions/markets/:marketId/positions — positions for a market
    .get('/predictions/markets/:marketId/positions', async (ctx) => {
        try {
            const marketId = ctx.params.marketId;
            const chainId = ctx.query?.chainId ? parseInt(ctx.query.chainId as string) : undefined;
            const userAddress = ctx.query?.userAddress as string | undefined;

            let query = `
                SELECT
                    id, chain_id as "chainId", market_id as "marketId",
                    user_address as "userAddress",
                    stake_up as "stakeUp", stake_down as "stakeDown",
                    claimed, payout, last_updated as "lastUpdated"
                FROM prediction_positions
                WHERE market_id = $1
            `;
            const params: unknown[] = [marketId];
            let paramIdx = 2;

            if (chainId !== undefined) {
                query += ` AND chain_id = $${paramIdx++}`;
                params.push(chainId);
            }
            if (userAddress) {
                query += ` AND user_address = $${paramIdx++}`;
                params.push(userAddress);
            }

            query += ` ORDER BY last_updated DESC`;

            const positions = await runQuery<any>(query, params);

            const formatted = positions.map((p: any) => ({
                ...p,
                marketId: p.marketId?.toString() || '0',
                stakeUp: p.stakeUp?.toString() || '0',
                stakeDown: p.stakeDown?.toString() || '0',
                payout: p.payout?.toString() || null,
            }));

            return { positions: formatted, count: formatted.length };
        } catch (error) {
            console.error('Error fetching market positions:', error);
            ctx.set.status = 500;
            return { error: `Failed to fetch market positions: ${error}` };
        }
    }, {
        detail: {
            summary: 'Get market positions',
            description: 'Get prediction positions for a specific market',
            tags: ['Predictions'],
        },
    })

    // GET /api/predictions/pending/:address — pending actions for a user
    .get('/predictions/pending/:address', PredictionsService.getPendingActions, {
        detail: {
            summary: 'Get pending prediction actions',
            description: 'Get markets awaiting settlement and claimable positions for a user',
            tags: ['Predictions'],
        },
    });
