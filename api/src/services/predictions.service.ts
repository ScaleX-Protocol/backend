import { Context } from 'elysia';
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

interface AwaitingSettlementRow {
    market_id: string;
    chain_id: number;
    base_token: string;
    base_token_symbol: string | null;
    strike_price: string;
    end_time: number;
    settlement_requested_at: number | null;
    stake_up: string;
    stake_down: string;
    is_agent_position: boolean;
    agent_token_id: string | null;
}

interface ClaimableRow {
    market_id: string;
    chain_id: number;
    base_token: string;
    base_token_symbol: string | null;
    strike_price: string;
    outcome: boolean;
    stake_up: string;
    stake_down: string;
    payout: string | null;
    is_agent_position: boolean;
    agent_token_id: string | null;
}

export class PredictionsService {
    static async getPendingActions(ctx: Context) {
        try {
            const { params, query } = ctx as any;
            const address = (params.address as string).toLowerCase();
            const chainId = query.chainId ? parseInt(query.chainId as string) : 84532;

            // Awaiting settlement: markets with status=1 where user has a position
            const awaitingSettlement = await runQuery<AwaitingSettlementRow>(`
                SELECT
                    m.market_id,
                    m.chain_id,
                    m.base_token,
                    m.strike_price,
                    m.end_time,
                    p.stake_up,
                    p.stake_down,
                    c.symbol as base_token_symbol,
                    se.timestamp as settlement_requested_at,
                    CASE WHEN ape.agent_token_id IS NOT NULL THEN true ELSE false END as is_agent_position,
                    ape.agent_token_id
                FROM prediction_markets m
                JOIN prediction_positions p
                    ON p.market_id = m.market_id AND p.chain_id = m.chain_id
                LEFT JOIN currencies c
                    ON LOWER(m.base_token) = LOWER(c.address) AND c.chain_id = m.chain_id
                LEFT JOIN prediction_events se
                    ON se.market_id = m.market_id AND se.chain_id = m.chain_id AND se.event_type = 'SettlementRequested'
                LEFT JOIN agent_prediction_events ape
                    ON ape.market_id = m.market_id AND ape.chain_id = m.chain_id AND LOWER(ape.owner) = LOWER(p.user_address)
                WHERE LOWER(p.user_address) = $1
                    AND m.chain_id = $2
                    AND m.status = 1
                    AND (p.stake_up > 0 OR p.stake_down > 0)
                ORDER BY m.end_time DESC
            `, [address, chainId]);

            // Claimable: settled markets where user hasn't claimed
            const claimable = await runQuery<ClaimableRow>(`
                SELECT
                    m.market_id,
                    m.chain_id,
                    m.base_token,
                    m.strike_price,
                    m.outcome,
                    p.stake_up,
                    p.stake_down,
                    p.payout,
                    c.symbol as base_token_symbol,
                    CASE WHEN ape.agent_token_id IS NOT NULL THEN true ELSE false END as is_agent_position,
                    ape.agent_token_id
                FROM prediction_markets m
                JOIN prediction_positions p
                    ON p.market_id = m.market_id AND p.chain_id = m.chain_id
                LEFT JOIN currencies c
                    ON LOWER(m.base_token) = LOWER(c.address) AND c.chain_id = m.chain_id
                LEFT JOIN agent_prediction_events ape
                    ON ape.market_id = m.market_id AND ape.chain_id = m.chain_id AND LOWER(ape.owner) = LOWER(p.user_address)
                WHERE LOWER(p.user_address) = $1
                    AND m.chain_id = $2
                    AND m.status = 2
                    AND p.claimed = false
                    AND (p.stake_up > 0 OR p.stake_down > 0)
                ORDER BY m.end_time DESC
            `, [address, chainId]);

            const formattedAwaiting = awaitingSettlement.map(r => ({
                marketId: r.market_id?.toString() || '0',
                chainId: r.chain_id,
                baseToken: r.base_token,
                baseTokenSymbol: r.base_token_symbol,
                strikePrice: r.strike_price?.toString() || '0',
                endTime: r.end_time,
                settlementRequestedAt: r.settlement_requested_at,
                userStakeUp: r.stake_up?.toString() || '0',
                userStakeDown: r.stake_down?.toString() || '0',
                isAgentPosition: r.is_agent_position,
                agentTokenId: r.agent_token_id?.toString() || null,
            }));

            const formattedClaimable = claimable.map(r => ({
                marketId: r.market_id?.toString() || '0',
                chainId: r.chain_id,
                baseToken: r.base_token,
                baseTokenSymbol: r.base_token_symbol,
                strikePrice: r.strike_price?.toString() || '0',
                outcome: r.outcome,
                userStakeUp: r.stake_up?.toString() || '0',
                userStakeDown: r.stake_down?.toString() || '0',
                payout: r.payout?.toString() || null,
                isAgentPosition: r.is_agent_position,
                agentTokenId: r.agent_token_id?.toString() || null,
            }));

            return {
                success: true,
                data: {
                    awaitingSettlement: formattedAwaiting,
                    claimable: formattedClaimable,
                },
                count: formattedAwaiting.length + formattedClaimable.length,
            };
        } catch (error) {
            console.error('Error fetching pending actions:', error);
            (ctx as any).set.status = 500;
            return { success: false, error: `Failed to fetch pending actions: ${error}` };
        }
    }
}
