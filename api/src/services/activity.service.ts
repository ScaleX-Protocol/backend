import { Context } from 'elysia';
import { ponderPool } from '../config/database';

async function runQuery<T extends object>(text: string, params: unknown[] = []): Promise<T[]> {
    const client = await ponderPool.connect();
    try {
        const result = await client.query<T>(text, params);
        return result.rows;
    } finally {
        client.release();
    }
}

interface ActivityRow {
    id: string;
    type: string;
    subtype: string;
    timestamp: number;
    amount: string;
    token_address: string;
    token_symbol: string | null;
    transaction_id: string | null;
    chain_id: number;
    is_agent: boolean;
    agent_token_id: string | null;
    metadata: Record<string, unknown>;
}

interface CountRow {
    total: number;
}

export class ActivityService {
    static async getActivity(ctx: Context) {
        try {
            const { params, query } = ctx as any;
            const address = params.address as string;

            if (!address) {
                ctx.set.status = 400;
                return { success: false, error: 'Address is required' };
            }

            const chainId = parseInt(query.chainId as string ?? '84532') || 84532;
            const type = (query.type as string ?? 'all').toLowerCase();
            const period = (query.period as string ?? 'all').toLowerCase();
            const limit = Math.min(Math.max(parseInt(query.limit as string ?? '20') || 20, 1), 100);
            const offset = Math.max(parseInt(query.offset as string ?? '0') || 0, 0);

            // Calculate timestamp filter based on period
            let timestampFilter = 0;
            const now = Math.floor(Date.now() / 1000);
            switch (period) {
                case '24h': timestampFilter = now - 86400; break;
                case '7d': timestampFilter = now - 604800; break;
                case '30d': timestampFilter = now - 2592000; break;
                default: timestampFilter = 0;
            }

            const normalizedAddress = address.toLowerCase();

            // Build UNION query across all activity source tables
            const unionParts: string[] = [];

            // 1. Trading orders (non-agent)
            if (type === 'all' || type === 'trading') {
                unionParts.push(`
                    SELECT
                        o.id,
                        'trading' as type,
                        CASE
                            WHEN o.status = 'FILLED' THEN 'order_filled'
                            WHEN o.status = 'CANCELLED' THEN 'order_cancelled'
                            WHEN o.status = 'PARTIALLY_FILLED' THEN 'order_partial'
                            ELSE 'order_placed'
                        END as subtype,
                        o.timestamp,
                        COALESCE(o.quantity, 0)::text as amount,
                        p.base_currency as token_address,
                        c.symbol as token_symbol,
                        o.transaction_id,
                        o.chain_id,
                        CASE WHEN o.agent_token_id IS NOT NULL AND o.agent_token_id > 0 THEN true ELSE false END as is_agent,
                        o.agent_token_id::text as agent_token_id,
                        jsonb_build_object(
                            'side', o.side,
                            'price', o.price::text,
                            'quantity', o.quantity::text,
                            'filled', o.filled::text,
                            'status', o.status,
                            'type', o.type,
                            'poolId', o.pool_id
                        ) as metadata
                    FROM orders o
                    LEFT JOIN pools p ON o.pool_id = p.id
                    LEFT JOIN currencies c ON LOWER(p.base_currency) = LOWER(c.address) AND c.chain_id = o.chain_id
                    WHERE LOWER(o.user_address) = $1
                        AND o.chain_id = $2
                `);
            }

            // 2. Lending events
            if (type === 'all' || type === 'lending') {
                unionParts.push(`
                    SELECT
                        le.id,
                        'lending' as type,
                        LOWER(le.action) as subtype,
                        le.timestamp,
                        COALESCE(le.amount, 0)::text as amount,
                        le.token as token_address,
                        c.symbol as token_symbol,
                        le.transaction_id,
                        le.chain_id,
                        CASE WHEN le.agent_token_id IS NOT NULL AND le.agent_token_id > 0 THEN true ELSE false END as is_agent,
                        le.agent_token_id::text as agent_token_id,
                        jsonb_build_object(
                            'action', le.action,
                            'healthFactor', le.health_factor::text
                        ) as metadata
                    FROM lending_events le
                    LEFT JOIN currencies c ON LOWER(le.token) = LOWER(c.address) AND c.chain_id = le.chain_id
                    WHERE LOWER(le.user_address) = $1
                        AND le.chain_id = $2
                `);
            }

            // 3. Deposits
            if (type === 'all' || type === 'transfer') {
                unionParts.push(`
                    SELECT
                        d.id,
                        'transfer' as type,
                        'deposit' as subtype,
                        d.timestamp,
                        COALESCE(d.amount, 0)::text as amount,
                        d.currency as token_address,
                        c.symbol as token_symbol,
                        d.transaction_id,
                        d.chain_id,
                        CASE WHEN d.agent_token_id IS NOT NULL AND d.agent_token_id > 0 THEN true ELSE false END as is_agent,
                        d.agent_token_id::text as agent_token_id,
                        jsonb_build_object('direction', 'in') as metadata
                    FROM deposits d
                    LEFT JOIN currencies c ON LOWER(d.currency) = LOWER(c.address) AND c.chain_id = d.chain_id
                    WHERE LOWER(d.user_address) = $1
                        AND d.chain_id = $2
                `);

                // 4. Withdrawals
                unionParts.push(`
                    SELECT
                        w.id,
                        'transfer' as type,
                        'withdrawal' as subtype,
                        w.timestamp,
                        COALESCE(w.amount, 0)::text as amount,
                        w.currency as token_address,
                        c.symbol as token_symbol,
                        w.transaction_id,
                        w.chain_id,
                        CASE WHEN w.agent_token_id IS NOT NULL AND w.agent_token_id > 0 THEN true ELSE false END as is_agent,
                        w.agent_token_id::text as agent_token_id,
                        jsonb_build_object('direction', 'out') as metadata
                    FROM withdrawals w
                    LEFT JOIN currencies c ON LOWER(w.currency) = LOWER(c.address) AND c.chain_id = w.chain_id
                    WHERE LOWER(w.user_address) = $1
                        AND w.chain_id = $2
                `);
            }

            // 5. Agent orders
            if (type === 'all' || type === 'agent') {
                unionParts.push(`
                    SELECT
                        ao.id,
                        'agent' as type,
                        CASE
                            WHEN ao.order_type = 'MARKET' THEN 'agent_market_order'
                            ELSE 'agent_limit_order'
                        END as subtype,
                        ao.timestamp,
                        COALESCE(ao.amount_in, 0)::text as amount,
                        COALESCE(ao.token_in, '\\x0000000000000000000000000000000000000000') as token_address,
                        c.symbol as token_symbol,
                        ao.transaction_id,
                        ao.chain_id,
                        true as is_agent,
                        ao.agent_token_id::text as agent_token_id,
                        jsonb_build_object(
                            'orderType', ao.order_type,
                            'side', ao.side,
                            'executor', ao.executor,
                            'status', ao.status,
                            'tokenOut', ao.token_out,
                            'amountOut', ao.amount_out::text,
                            'limitPrice', ao.limit_price::text
                        ) as metadata
                    FROM agent_orders ao
                    LEFT JOIN currencies c ON LOWER(ao.token_in) = LOWER(c.address) AND c.chain_id = ao.chain_id
                    WHERE LOWER(ao.owner) = $1
                        AND ao.chain_id = $2
                `);

                // 6. Agent lending events
                unionParts.push(`
                    SELECT
                        ale.id,
                        'agent' as type,
                        'agent_' || LOWER(ale.action) as subtype,
                        ale.timestamp,
                        COALESCE(ale.amount, 0)::text as amount,
                        ale.token as token_address,
                        c.symbol as token_symbol,
                        ale.transaction_id,
                        ale.chain_id,
                        true as is_agent,
                        ale.agent_token_id::text as agent_token_id,
                        jsonb_build_object(
                            'action', ale.action,
                            'executor', ale.executor,
                            'healthFactor', ale.new_health_factor::text
                        ) as metadata
                    FROM agent_lending_events ale
                    LEFT JOIN currencies c ON LOWER(ale.token) = LOWER(c.address) AND c.chain_id = ale.chain_id
                    WHERE LOWER(ale.owner) = $1
                        AND ale.chain_id = $2
                `);

                // 7. Agent prediction events
                unionParts.push(`
                    SELECT
                        ape.id,
                        'agent' as type,
                        'agent_' || LOWER(ape.action) as subtype,
                        ape.timestamp,
                        COALESCE(ape.amount, 0)::text as amount,
                        '\\x0000000000000000000000000000000000000000' as token_address,
                        NULL as token_symbol,
                        ape.transaction_id,
                        ape.chain_id,
                        true as is_agent,
                        ape.agent_token_id::text as agent_token_id,
                        jsonb_build_object(
                            'action', ape.action,
                            'marketId', ape.market_id::text,
                            'predictUp', ape.predict_up,
                            'executor', ape.executor
                        ) as metadata
                    FROM agent_prediction_events ape
                    WHERE LOWER(ape.owner) = $1
                        AND ape.chain_id = $2
                `);

                // 8. Agent policy violations
                unionParts.push(`
                    SELECT
                        apv.id,
                        'agent' as type,
                        'policy_violation' as subtype,
                        apv.timestamp,
                        '0' as amount,
                        '\\x0000000000000000000000000000000000000000' as token_address,
                        NULL as token_symbol,
                        apv.transaction_id,
                        apv.chain_id,
                        true as is_agent,
                        apv.agent_token_id::text as agent_token_id,
                        jsonb_build_object('reason', apv.reason) as metadata
                    FROM agent_policy_violations apv
                    WHERE LOWER(apv.owner) = $1
                        AND apv.chain_id = $2
                `);

                // 9. Agent circuit breakers
                unionParts.push(`
                    SELECT
                        acb.id,
                        'agent' as type,
                        'circuit_breaker' as subtype,
                        acb.timestamp,
                        '0' as amount,
                        '\\x0000000000000000000000000000000000000000' as token_address,
                        NULL as token_symbol,
                        acb.transaction_id,
                        acb.chain_id,
                        true as is_agent,
                        acb.agent_token_id::text as agent_token_id,
                        jsonb_build_object(
                            'drawdownBps', acb.drawdown_bps,
                            'currentValue', acb.current_value::text,
                            'dayStartValue', acb.day_start_value::text
                        ) as metadata
                    FROM agent_circuit_breakers acb
                    WHERE LOWER(acb.owner) = $1
                        AND acb.chain_id = $2
                `);
            }

            // 10. Prediction events (user direct)
            if (type === 'all' || type === 'prediction') {
                unionParts.push(`
                    SELECT
                        pe.id,
                        'prediction' as type,
                        LOWER(pe.event_type) as subtype,
                        pe.timestamp,
                        COALESCE(pe.amount, 0)::text as amount,
                        '\\x0000000000000000000000000000000000000000' as token_address,
                        NULL as token_symbol,
                        pe.transaction_id,
                        pe.chain_id,
                        false as is_agent,
                        NULL as agent_token_id,
                        jsonb_build_object(
                            'marketId', pe.market_id::text,
                            'eventType', pe.event_type,
                            'predictedUp', pe.predicted_up,
                            'outcome', pe.outcome,
                            'payout', pe.payout::text
                        ) as metadata
                    FROM prediction_events pe
                    WHERE LOWER(pe.user_address) = $1
                        AND pe.chain_id = $2
                        AND pe.user_address IS NOT NULL
                        AND pe.event_type IN ('Predicted', 'Claimed')
                `);
            }

            if (unionParts.length === 0) {
                return {
                    success: true,
                    data: [],
                    count: 0,
                    pagination: { limit, offset, hasMore: false },
                };
            }

            const unionQuery = unionParts.join('\n UNION ALL \n');

            // Add timestamp filter and ordering
            const timestampCondition = timestampFilter > 0
                ? `WHERE a.timestamp >= ${timestampFilter}`
                : '';

            const dataQuery = `
                WITH activity AS (${unionQuery})
                SELECT * FROM activity a
                ${timestampCondition}
                ORDER BY a.timestamp DESC
                LIMIT $3 OFFSET $4
            `;

            const countQuery = `
                WITH activity AS (${unionQuery})
                SELECT COUNT(*)::int as total FROM activity a
                ${timestampCondition}
            `;

            const [data, countResult] = await Promise.all([
                runQuery<ActivityRow>(dataQuery, [normalizedAddress, chainId, limit, offset]),
                runQuery<CountRow>(countQuery, [normalizedAddress, chainId]),
            ]);

            const total = countResult[0]?.total ?? 0;

            return {
                success: true,
                data: data.map(row => ({
                    id: row.id,
                    type: row.type,
                    subtype: row.subtype,
                    timestamp: row.timestamp,
                    amount: row.amount,
                    tokenSymbol: row.token_symbol,
                    tokenAddress: row.token_address,
                    transactionId: row.transaction_id,
                    chainId: row.chain_id,
                    isAgent: row.is_agent,
                    agentTokenId: row.agent_token_id,
                    metadata: row.metadata,
                })),
                count: total,
                pagination: {
                    limit,
                    offset,
                    hasMore: offset + limit < total,
                },
            };
        } catch (error) {
            console.error('Error fetching activity:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch activity: ${error}` };
        }
    }
}
