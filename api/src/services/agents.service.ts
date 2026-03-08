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

interface AgentRegistryRow {
    id: string;
    chain_id: number;
    token_id: string;
    owner: string;
    metadata_uri: string | null;
    registered_at: number;
}

interface AgentOrdersRow {
    agent_token_id: string;
    order_count: number;
}

export class AgentsService {
    static async getAgents(ctx: Context) {
        try {
            const { query } = ctx as any;

            const chainId = query.chainId ? parseInt(query.chainId as string) : 84532;
            const owner = query.owner as string | undefined;
            const limit = Math.min(Math.max(parseInt(query.limit as string ?? '50') || 50, 1), 100);
            const offset = Math.max(parseInt(query.offset as string ?? '0') || 0, 0);

            // Owner view: return per-user AgentInstallation data
            if (owner) {
                const userInstallations = await runQuery<{ agent_token_id: string; enabled: boolean; installed_at: number; uninstalled_at: number | null; template_used: string | null; transaction_id: string; block_number: string }>(`
                    SELECT agent_token_id::text, enabled, installed_at, uninstalled_at, template_used, transaction_id, block_number::text
                    FROM agent_installations
                    WHERE chain_id = $1 AND LOWER(owner) = LOWER($2) AND (uninstalled_at IS NULL OR enabled = true)
                    ORDER BY installed_at DESC
                    LIMIT $3 OFFSET $4
                `, [chainId, owner, limit, offset]);

                if (userInstallations.length === 0) {
                    return { success: true, data: [], count: 0, pagination: { limit, offset } };
                }

                const agentTokenIds = userInstallations.map(i => i.agent_token_id);
                const agentIdArray = `{${agentTokenIds.join(',')}}`;

                const [registryRows, activityStats, orderCounts, countResult] = await Promise.all([
                    runQuery<AgentRegistryRow>(`
                        SELECT id, chain_id, token_id, owner, metadata_uri, registered_at
                        FROM agent_registry
                        WHERE chain_id = $1 AND token_id = ANY($2::numeric[])
                    `, [chainId, agentIdArray]),
                    runQuery<{ agent_token_id: string; last_activity_at: number | null; total_trading_volume: string; total_predictions: number; total_prediction_volume: string; total_prediction_claims: number; total_borrows: number; total_repays: number; total_collateral_supplied: number }>(`
                        SELECT
                            agent_token_id::text,
                            MAX(last_activity_timestamp)::integer as last_activity_at,
                            COALESCE(SUM(total_trading_volume), 0)::text as total_trading_volume,
                            COALESCE(SUM(total_predictions), 0)::int as total_predictions,
                            COALESCE(SUM(total_prediction_volume), 0)::text as total_prediction_volume,
                            COALESCE(SUM(total_prediction_claims), 0)::int as total_prediction_claims,
                            COALESCE(SUM(total_borrow_amount), 0)::int as total_borrows,
                            COALESCE(SUM(total_repay_amount), 0)::int as total_repays,
                            COALESCE(SUM(total_collateral_supplied), 0)::int as total_collateral_supplied
                        FROM agent_stats
                        WHERE chain_id = $1 AND LOWER(owner) = LOWER($2) AND agent_token_id = ANY($3::numeric[])
                        GROUP BY agent_token_id
                    `, [chainId, owner, agentIdArray]),
                    runQuery<AgentOrdersRow>(`
                        SELECT agent_token_id::text, COUNT(*)::int as order_count
                        FROM orders
                        WHERE chain_id = $1 AND LOWER(user_address) = LOWER($2) AND agent_token_id = ANY($3::numeric[]) AND agent_token_id > 0
                        GROUP BY agent_token_id
                    `, [chainId, owner, agentIdArray]),
                    runQuery<{ count: string }>(`
                        SELECT COUNT(*)::text as count FROM agent_installations
                        WHERE chain_id = $1 AND LOWER(owner) = LOWER($2) AND (uninstalled_at IS NULL OR enabled = true)
                    `, [chainId, owner]),
                ]);

                const registryMap = new Map(registryRows.map(r => [r.token_id, r]));
                const activityMap = new Map(activityStats.map(a => [a.agent_token_id, a]));
                const ordersMap = new Map(orderCounts.map(o => [o.agent_token_id, o.order_count]));

                const data = userInstallations.map(inst => {
                    const reg = registryMap.get(inst.agent_token_id);
                    const activity = activityMap.get(inst.agent_token_id);
                    const orderCount = ordersMap.get(inst.agent_token_id) || 0;
                    return {
                        agentTokenId: inst.agent_token_id,
                        owner,
                        metadataURI: reg?.metadata_uri || null,
                        registeredAt: reg?.registered_at || null,
                        enabled: inst.enabled,
                        installedAt: inst.installed_at,
                        uninstalledAt: inst.uninstalled_at,
                        templateUsed: inst.template_used,
                        transactionId: inst.transaction_id,
                        blockNumber: inst.block_number,
                        lastActivityAt: activity?.last_activity_at || null,
                        totalOrders: orderCount,
                        totalVolume: activity?.total_trading_volume || "0",
                        totalPredictions: activity?.total_predictions || 0,
                        totalPredictionClaims: activity?.total_prediction_claims || 0,
                        totalBorrows: activity?.total_borrows || 0,
                    };
                });

                const count = parseInt(countResult[0]?.count || '0');
                return { success: true, data, count, pagination: { limit, offset } };
            }

            // No owner — marketplace view: only listed agents
            const agents = await runQuery<AgentRegistryRow>(`
                SELECT id, chain_id, token_id, owner, metadata_uri, registered_at
                FROM agent_registry
                WHERE chain_id = $1 AND is_listed_on_marketplace = true
                ORDER BY token_id ASC
                LIMIT $2 OFFSET $3
            `, [chainId, limit, offset]);

            if (agents.length === 0) {
                return { success: true, data: [], count: 0, pagination: { limit, offset } };
            }

            const agentTokenIds = agents.map(a => a.token_id).filter(id => id && id.trim() !== '');
            if (agentTokenIds.length === 0) {
                return { success: true, data: [], count: 0, pagination: { limit, offset } };
            }

            const agentIdArray = `{${agentTokenIds.join(',')}}`;

            const installations = await runQuery<{ agent_token_id: string; total_users: number; active_users: number; first_installed_at: number | null }>(`
                SELECT
                    agent_token_id::text,
                    COUNT(DISTINCT owner)::int as total_users,
                    COUNT(DISTINCT CASE WHEN enabled = true THEN owner END)::int as active_users,
                    MIN(installed_at)::integer as first_installed_at
                FROM agent_installations
                WHERE chain_id = $1 AND agent_token_id = ANY($2::numeric[])
                GROUP BY agent_token_id
            `, [chainId, agentIdArray]);

            const activityStats = await runQuery<{ agent_token_id: string; last_activity_at: number | null; total_trading_volume: string; total_predictions: number; total_prediction_volume: string; total_prediction_claims: number }>(`
                SELECT
                    agent_token_id::text,
                    MAX(last_activity_timestamp)::integer as last_activity_at,
                    COALESCE(SUM(total_trading_volume), 0)::text as total_trading_volume,
                    COALESCE(SUM(total_predictions), 0)::int as total_predictions,
                    COALESCE(SUM(total_prediction_volume), 0)::text as total_prediction_volume,
                    COALESCE(SUM(total_prediction_claims), 0)::int as total_prediction_claims
                FROM agent_stats
                WHERE chain_id = $1 AND agent_token_id = ANY($2::numeric[])
                GROUP BY agent_token_id
            `, [chainId, agentIdArray]);

            const orderCounts = await runQuery<AgentOrdersRow>(`
                SELECT agent_token_id::text, COUNT(*)::int as order_count
                FROM orders
                WHERE chain_id = $1 AND agent_token_id = ANY($2::numeric[]) AND agent_token_id > 0
                GROUP BY agent_token_id
            `, [chainId, agentIdArray]);

            const installationsMap = new Map(installations.map(i => [i.agent_token_id, i]));
            const activityStatsMap = new Map(activityStats.map(a => [a.agent_token_id, a]));
            const ordersMap = new Map(orderCounts.map(o => [o.agent_token_id, o.order_count]));

            const data = agents.map(agent => {
                const install = installationsMap.get(agent.token_id);
                const activity = activityStatsMap.get(agent.token_id);
                const orderCount = ordersMap.get(agent.token_id) || 0;
                return {
                    agentTokenId: agent.token_id,
                    owner: agent.owner,
                    metadataURI: agent.metadata_uri,
                    registeredAt: agent.registered_at,
                    totalUsers: install?.total_users || 0,
                    activeUsers: install?.active_users || 0,
                    firstInstalledAt: install?.first_installed_at || null,
                    lastActivityAt: activity?.last_activity_at || null,
                    totalOrders: orderCount,
                    totalVolume: activity?.total_trading_volume || "0",
                    totalPredictions: activity?.total_predictions || 0,
                    totalPredictionVolume: activity?.total_prediction_volume || "0",
                    totalPredictionClaims: activity?.total_prediction_claims || 0,
                };
            });

            const countResult = await runQuery<{ count: string }>(`
                SELECT COUNT(*)::text as count FROM agent_registry WHERE chain_id = $1 AND is_listed_on_marketplace = true
            `, [chainId]);
            const count = parseInt(countResult[0]?.count || '0');

            return { success: true, data, count, pagination: { limit, offset } };
        } catch (error) {
            console.error('Error fetching agents:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch agents: ${error}` };
        }
    }

    static async getAgent(ctx: Context) {
        try {
            const { params } = ctx as any;
            const chainId = parseInt((ctx as any).query?.chainId as string) || 84532;
            const agentTokenId = parseInt(params.agentTokenId);

            // Check agent exists in registry
            const agents = await runQuery<AgentRegistryRow>(`
                SELECT id, chain_id, token_id, owner, metadata_uri, registered_at
                FROM agent_registry WHERE chain_id = $1 AND token_id = $2
            `, [chainId, agentTokenId]);

            // User counts from installations
            const installAgg = await runQuery<{ total_users: number; active_users: number; first_installed_at: number | null }>(`
                SELECT 
                    COUNT(*)::int as total_users,
                    COUNT(*) FILTER (WHERE enabled = true)::int as active_users,
                    MIN(installed_at)::integer as first_installed_at
                FROM agent_installations
                WHERE chain_id = $1 AND agent_token_id = $2
            `, [chainId, agentTokenId]);

            // Aggregate stats directly from source tables
            const orderStatsAgg = await runQuery<{
                total_market_orders: number;
                total_limit_orders: number;
                total_orders_cancelled: number;
                last_activity_at: number | null;
            }>(`
                SELECT
                    COUNT(*) FILTER (WHERE LOWER(type) = 'market')::int as total_market_orders,
                    COUNT(*) FILTER (WHERE LOWER(type) = 'limit')::int as total_limit_orders,
                    COUNT(*) FILTER (WHERE status = 'CANCELLED')::int as total_orders_cancelled,
                    MAX(timestamp)::integer as last_activity_at
                FROM orders
                WHERE chain_id = $1 AND agent_token_id = $2
            `, [chainId, agentTokenId]);

            const tradeVolumeAgg = await runQuery<{ total_trading_volume: string }>(`
                SELECT COALESCE(SUM(t.quantity * t.price), 0)::text as total_trading_volume
                FROM trades t INNER JOIN orders o ON t.order_id = o.id
                WHERE o.chain_id = $1 AND o.agent_token_id = $2
            `, [chainId, agentTokenId]);

            const lendingAgg = await runQuery<{
                total_borrow_amount: string;
                total_repay_amount: string;
                total_collateral_supplied: string;
                total_collateral_withdrawn: string;
            }>(`
                SELECT
                    COALESCE(SUM(amount) FILTER (WHERE action = 'BORROW'), 0)::text as total_borrow_amount,
                    COALESCE(SUM(amount) FILTER (WHERE action = 'REPAY'), 0)::text as total_repay_amount,
                    COALESCE(SUM(amount) FILTER (WHERE action = 'SUPPLY_COLLATERAL'), 0)::text as total_collateral_supplied,
                    COALESCE(SUM(amount) FILTER (WHERE action = 'WITHDRAW_COLLATERAL'), 0)::text as total_collateral_withdrawn
                FROM agent_lending_events
                WHERE chain_id = $1 AND agent_token_id = $2
            `, [chainId, agentTokenId]);

            // Orders grouped by status
            const ordersByStatus = await runQuery<{ status: string; count: number }>(`
                SELECT status, COUNT(*)::int as count
                FROM orders
                WHERE chain_id = $1 AND agent_token_id = $2
                GROUP BY status
            `, [chainId, agentTokenId]);

            const registry = agents[0];
            const install = installAgg[0];
            const stats = orderStatsAgg[0];
            const volume = tradeVolumeAgg[0];
            const lending = lendingAgg[0];

            // Agent must exist in registry OR have installations
            if (!registry && (!install || install.total_users === 0)) {
                ctx.set.status = 404;
                return { success: false, error: 'Agent not found' };
            }

            const ordersByStatusMap: Record<string, number> = {};
            for (const o of ordersByStatus) {
                ordersByStatusMap[o.status] = o.count;
            }

            return {
                success: true,
                data: {
                    agentTokenId: registry?.token_id || agentTokenId,
                    chainId,
                    totalUsers: install?.total_users || 0,
                    activeUsers: install?.active_users || 0,
                    firstInstalledAt: install?.first_installed_at || null,
                    lastActivityAt: stats?.last_activity_at || null,
                    aggregateStats: {
                        totalMarketOrders: stats?.total_market_orders || 0,
                        totalLimitOrders: stats?.total_limit_orders || 0,
                        totalOrdersCancelled: stats?.total_orders_cancelled || 0,
                        totalTradingVolume: volume?.total_trading_volume || "0",
                        totalBorrowAmount: lending?.total_borrow_amount || "0",
                        totalRepayAmount: lending?.total_repay_amount || "0",
                        totalCollateralSupplied: lending?.total_collateral_supplied || "0",
                        totalCollateralWithdrawn: lending?.total_collateral_withdrawn || "0",
                        totalPredictions: 0,
                        totalPredictionVolume: "0",
                        totalPredictionClaims: 0,
                    },
                    ordersByStatus: ordersByStatusMap,
                }
            };
        } catch (error) {
            console.error('Error fetching agent:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch agent: ${error}` };
        }
    }

    static async getAgentStats(ctx: Context) {
        try {
            const { params } = ctx as any;
            const chainId = parseInt((ctx as any).query?.chainId as string) || 84532;
            const agentTokenId = parseInt(params.agentTokenId);

            const orderStats = await runQuery<{ total_orders: string; filled_orders: string; partial_orders: string; rejected_orders: string }>(`
                SELECT 
                    COUNT(*)::text as total_orders,
                    COUNT(*) FILTER (WHERE status = 'FILLED')::text as filled_orders,
                    COUNT(*) FILTER (WHERE status = 'PARTIALLY_FILLED')::text as partial_orders,
                    COUNT(*) FILTER (WHERE status = 'REJECTED')::text as rejected_orders
                FROM orders WHERE chain_id = $1 AND agent_token_id = $2
            `, [chainId, agentTokenId]);

            const tradeStats = await runQuery<{ total_trades: string; total_volume: string }>(`
                SELECT COUNT(*)::text as total_trades, COALESCE(SUM(t.quantity * t.price), 0)::text as total_volume
                FROM trades t INNER JOIN orders o ON t.order_id = o.id
                WHERE o.chain_id = $1 AND o.agent_token_id = $2
            `, [chainId, agentTokenId]);

            const stats = orderStats[0] || { total_orders: '0', filled_orders: '0', partial_orders: '0', rejected_orders: '0' };
            const trades = tradeStats[0] || { total_trades: '0', total_volume: '0' };

            return {
                success: true,
                data: {
                    agentTokenId,
                    totalOrders: parseInt(stats.total_orders),
                    filledOrders: parseInt(stats.filled_orders),
                    partialOrders: parseInt(stats.partial_orders),
                    rejectedOrders: parseInt(stats.rejected_orders),
                    totalTrades: parseInt(trades.total_trades),
                    totalVolume: trades.total_volume,
                }
            };
        } catch (error) {
            console.error('Error fetching agent stats:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch agent stats: ${error}` };
        }
    }

    static async getAgentLending(ctx: Context) {
        try {
            const { params, query } = ctx as any;
            const agentTokenId = parseInt(params.agentTokenId);
            const chainId = parseInt(query?.chainId as string) || 84532;
            const limit = Math.min(Math.max(parseInt(query?.limit as string ?? '50') || 50, 1), 100);
            const offset = Math.max(parseInt(query?.offset as string ?? '0') || 0, 0);

            const lendingEvents = await runQuery<any>(`
                SELECT * FROM agent_lending_events
                WHERE agent_token_id = $1 AND chain_id = $2
                ORDER BY "timestamp" DESC
                LIMIT $3 OFFSET $4
            `, [agentTokenId, chainId, limit, offset]);

            const data = lendingEvents.map(event => ({
                ...event,
                id: event.id,
                chainId: event.chainId,
                agentTokenId: event.agentTokenId?.toString(),
                owner: event.owner,
                executor: event.executor,
                action: event.action,
                token: event.token,
                amount: event.amount?.toString(),
                newHealthFactor: event.newHealthFactor?.toString(),
                timestamp: event.timestamp,
                transactionId: event.transactionId,
                blockNumber: event.blockNumber?.toString(),
            }));

            const countResult = await runQuery<{ count: string }>(`
                SELECT COUNT(*)::text as count FROM agent_lending_events 
                WHERE agent_token_id = $1 AND chain_id = $2
            `, [agentTokenId, chainId]);

            return {
                success: true,
                data,
                count: parseInt(countResult[0]?.count || '0'),
                pagination: { limit, offset }
            };
        } catch (error) {
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch agent lending: ${error}` };
        }
    }

    static async getAgentPolicy(ctx: Context) {
        try {
            const { params, query } = ctx as any;
            const agentTokenId = parseInt(params.agentTokenId);
            const chainId = parseInt(query?.chainId as string) || 84532;
            const owner = query?.owner as string | undefined;

            let conditions = `WHERE agent_token_id = $1 AND chain_id = $2`;
            const paramsArr: any[] = [agentTokenId, chainId];

            if (owner) {
                conditions += ` AND LOWER(owner) = LOWER($3)`;
                paramsArr.push(owner);
            }

            const limit = Math.min(Math.max(parseInt(query?.limit as string ?? '50') || 50, 1), 100);
            const offset = Math.max(parseInt(query?.offset as string ?? '0') || 0, 0);
            conditions += ` LIMIT $${paramsArr.length + 1} OFFSET $${paramsArr.length + 2}`;
            paramsArr.push(limit, offset);

            const policies = await runQuery<any>(`
                SELECT * FROM agent_policies ${conditions}
            `, paramsArr);

            if (owner && policies.length === 0) {
                ctx.set.status = 404;
                return { success: false, error: "Policy not found" };
            }

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
                data: owner ? data[0] : data,
                count: policies.length,
                pagination: { limit, offset }
            };
        } catch (error) {
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch agent policy: ${error}` };
        }
    }

    static async getAgentUsers(ctx: Context) {
        try {
            const { params, query } = ctx as any;
            const agentTokenId = parseInt(params.agentTokenId);
            const chainId = parseInt(query?.chainId as string) || 84532;
            const enabled = query?.enabled;
            const owner = query?.owner;
            const limit = Math.min(Math.max(parseInt(query?.limit as string ?? '50') || 50, 1), 100);
            const offset = Math.max(parseInt(query?.offset as string ?? '0') || 0, 0);

            let conditions = `WHERE agent_token_id = $1 AND chain_id = $2`;
            const paramsArr: any[] = [agentTokenId, chainId];

            if (enabled !== undefined) {
                conditions += ` AND enabled = $${paramsArr.length + 1}`;
                paramsArr.push(enabled === 'true');
            }
            if (owner) {
                conditions += ` AND LOWER(owner) = LOWER($${paramsArr.length + 1})`;
                paramsArr.push(owner.toLowerCase());
            }

            const orderLimitOffset = `ORDER BY installed_at DESC LIMIT $${paramsArr.length + 1} OFFSET $${paramsArr.length + 2}`;
            paramsArr.push(limit, offset);

            const installations = await runQuery<any>(`
                SELECT * FROM agent_installations ${conditions} ${orderLimitOffset}
            `, paramsArr);

            // Batch-fetch policies for returned owners
            const owners = installations.map(i => i.owner).filter(Boolean);
            let policiesData: any[] = [];
            if (owners.length > 0) {
                const placeholders = owners.map((_, i) => `$${i + 1}`).join(', ');
                policiesData = await runQuery<any>(`
                    SELECT * FROM agent_policies 
                    WHERE agent_token_id = $${owners.length + 1} AND chain_id = $${owners.length + 2} AND owner IN (${placeholders})
                `, [...owners, agentTokenId, chainId]);
            }

            const policyMap = new Map(policiesData.map(p => [p.owner, p]));

            const countConditions = `WHERE agent_token_id = $1 AND chain_id = $2`;
            const countParams: any[] = [agentTokenId, chainId];
            
            let countAdditional = '';
            if (enabled !== undefined) {
                countAdditional += ` AND enabled = $${countParams.length + 1}`;
                countParams.push(enabled === 'true');
            }
            if (owner) {
                countAdditional += ` AND LOWER(owner) = LOWER($${countParams.length + 1})`;
                countParams.push(owner.toLowerCase());
            }

            const countResult = await runQuery<{ count: string }>(`
                SELECT COUNT(*)::text as count FROM agent_installations 
                ${countConditions} ${countAdditional}
            `, countParams);

            const serializePolicy = (p: any) => {
                if (!p) return null;
                return {
                    id: p.id,
                    owner: p.owner,
                    chainId: p.chainId,
                    agentTokenId: p.agentTokenId?.toString(),
                    maxTradeSize: p.maxTradeSize?.toString() || null,
                    maxDailyVolume: p.maxDailyVolume?.toString() || null,
                    allowedPools: p.allowedPools || [],
                    restrictedPools: p.restrictedPools || [],
                    enableCircuitBreaker: p.enableCircuitBreaker ?? true,
                };
            };

            const data = installations.map(inst => ({
                owner: inst.owner,
                enabled: inst.enabled,
                installedAt: inst.installedAt,
                uninstalledAt: inst.uninstalledAt,
                templateUsed: inst.templateUsed,
                transactionId: inst.transactionId,
                blockNumber: inst.blockNumber?.toString(),
                policy: serializePolicy(policyMap.get(inst.owner)),
            }));

            return {
                success: true,
                data,
                count: parseInt(countResult[0]?.count || '0'),
                pagination: { limit, offset }
            };
        } catch (error) {
            console.error('Error fetching agent users:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch agent users: ${error}` };
        }
    }

    static async getAgentOrders(ctx: Context) {
        try {
            const { params, query } = ctx as any;
            const agentTokenId = parseInt(params.agentTokenId);
            const chainId = parseInt(query?.chainId as string) || 84532;
            const status = query?.status;
            const limit = Math.min(Math.max(parseInt(query?.limit as string ?? '50') || 50, 1), 100);
            const offset = Math.max(parseInt(query?.offset as string ?? '0') || 0, 0);

            let conditions = `WHERE agent_token_id = $1 AND chain_id = $2`;
            const paramsArr: any[] = [agentTokenId, chainId];

            if (status) {
                conditions += ` AND UPPER(status) = UPPER($${paramsArr.length + 1})`;
                paramsArr.push(status);
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
    }

    static async getAgentViolations(ctx: Context) {
        try {
            const { params, query } = ctx as any;
            const agentTokenId = parseInt(params.agentTokenId);
            const chainId = parseInt(query?.chainId as string) || 84532;
            const limit = Math.min(Math.max(parseInt(query?.limit as string ?? '50') || 50, 1), 100);
            const offset = Math.max(parseInt(query?.offset as string ?? '0') || 0, 0);

            const violations = await runQuery<any>(`
                SELECT * FROM agent_policy_violations 
                WHERE agent_token_id = $1 AND chain_id = $2
                ORDER BY "timestamp" DESC
                LIMIT $3 OFFSET $4
            `, [agentTokenId, chainId, limit, offset]);

            return {
                success: true,
                data: violations,
                count: violations.length,
                pagination: { limit, offset }
            };
        } catch (error) {
            console.error('Error fetching agent violations:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch agent violations: ${error}` };
        }
    }

    static async getAgentCircuitBreakers(ctx: Context) {
        try {
            const { params, query } = ctx as any;
            const agentTokenId = parseInt(params.agentTokenId);
            const chainId = parseInt(query?.chainId as string) || 84532;
            const limit = Math.min(Math.max(parseInt(query?.limit as string ?? '50') || 50, 1), 100);
            const offset = Math.max(parseInt(query?.offset as string ?? '0') || 0, 0);

            const circuitBreakers = await runQuery<any>(`
                SELECT * FROM agent_circuit_breakers 
                WHERE agent_token_id = $1 AND chain_id = $2
                ORDER BY "timestamp" DESC
                LIMIT $3 OFFSET $4
            `, [agentTokenId, chainId, limit, offset]);

            return {
                success: true,
                data: circuitBreakers,
                count: circuitBreakers.length,
                pagination: { limit, offset }
            };
        } catch (error) {
            console.error('Error fetching circuit breakers:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch circuit breakers: ${error}` };
        }
    }

    static async getAgentPredictions(ctx: Context) {
        try {
            const { params, query } = ctx as any;
            const agentTokenId = parseInt(params.agentTokenId);
            const chainId = parseInt(query?.chainId as string) || 84532;
            const action = query?.action as string | undefined;
            const limit = Math.min(Math.max(parseInt(query?.limit as string ?? '50') || 50, 1), 100);
            const offset = Math.max(parseInt(query?.offset as string ?? '0') || 0, 0);

            // Validate action filter
            if (action && !['PREDICT', 'CLAIM'].includes(action)) {
                ctx.set.status = 400;
                return { success: false, error: 'Invalid action. Must be: PREDICT or CLAIM' };
            }

            // Build query with optional action filter
            const queryParams: unknown[] = [chainId, agentTokenId];
            let actionFilter = '';
            if (action) {
                queryParams.push(action);
                actionFilter = `AND ape.action = $3`;
            }

            // Count query
            const countResult = await runQuery<{ count: number }>(`
                SELECT COUNT(*)::int as count
                FROM agent_prediction_events ape
                WHERE ape.chain_id = $1 AND ape.agent_token_id = $2 ${actionFilter}
            `, queryParams);

            // Main query with market context JOIN
            const predictions = await runQuery<any>(`
                SELECT
                    ape.id,
                    ape.chain_id,
                    ape.owner,
                    ape.agent_token_id::text as agent_token_id,
                    ape.executor,
                    ape.action,
                    ape.market_id::text as market_id,
                    ape.predict_up,
                    ape.amount::text as amount,
                    ape."timestamp",
                    ape.transaction_id,
                    ape.block_number::text as block_number,
                    pm.base_token,
                    pm.strike_price::text as strike_price,
                    pm.status as market_status,
                    pm.outcome as market_outcome,
                    pm.end_time as market_end_time
                FROM agent_prediction_events ape
                LEFT JOIN prediction_markets pm
                    ON ape.market_id = pm.market_id AND ape.chain_id = pm.chain_id
                WHERE ape.chain_id = $1 AND ape.agent_token_id = $2 ${actionFilter}
                ORDER BY ape."timestamp" DESC
                LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
            `, [...queryParams, limit, offset]);

            const data = predictions.map((event: any) => ({
                id: event.id,
                chainId: event.chain_id,
                owner: event.owner,
                agentTokenId: event.agent_token_id,
                executor: event.executor,
                action: event.action,
                marketId: event.market_id,
                predictUp: event.predict_up,
                amount: event.amount,
                timestamp: event.timestamp,
                transactionId: event.transaction_id,
                blockNumber: event.block_number,
                market: event.base_token ? {
                    baseToken: event.base_token,
                    strikePrice: event.strike_price,
                    status: event.market_status,
                    outcome: event.market_outcome,
                    endTime: event.market_end_time,
                } : null,
            }));

            return {
                success: true,
                data,
                count: countResult[0]?.count || 0,
                pagination: { limit, offset },
            };
        } catch (error) {
            console.error('Error fetching agent predictions:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch agent predictions: ${error}` };
        }
    }

    static async getAgentAnalytics(ctx: Context) {
        try {
            const { params, query } = ctx as any;
            const agentTokenId = parseInt(params.agentTokenId);
            const chainId = parseInt(query?.chainId as string) || 84532;
            const window = query?.window || 'all';

            // Validate agent ID
            try {
                BigInt(agentTokenId);
            } catch {
                ctx.set.status = 400;
                return { success: false, error: "Invalid agent ID" };
            }

            // Validate window
            const validWindows = ['24h', '7d', '30d', 'all'];
            if (!validWindows.includes(window)) {
                ctx.set.status = 400;
                return { success: false, error: "Invalid window. Must be: 24h, 7d, 30d, all" };
            }

            const windowStart = getWindowStartTimestamp(window);
            const now = Math.floor(Date.now() / 1000);

            // Get PnL data from trades joined with orders and pools
            let timeFilter = '';
            const pnlParams: any[] = [chainId, agentTokenId];
            
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
                WHERE o.chain_id = $1 AND o.agent_token_id = $2
                    AND (o.status = 'FILLED' OR o.status = 'PARTIALLY_FILLED')
                    ${timeFilter}
                GROUP BY o.pool_id, o.side, p.base_decimals, p.quote_decimals, p.price, p.coin
            `, pnlParams);

            // Get fill rate data
            let fillParams: any[] = [chainId, agentTokenId];
            let fillFilter = '';
            if (windowStart) {
                fillFilter = ' AND timestamp >= $3';
                fillParams.push(windowStart);
            }

            const fillData = await runQuery<any>(`
                SELECT status, COUNT(*)::int as count
                FROM orders
                WHERE chain_id = $1 AND agent_token_id = $2 ${fillFilter}
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
                    agentTokenId,
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
            console.error('Error computing agent analytics:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to compute agent analytics: ${error}` };
        }
    }
}

function getWindowStartTimestamp(window: string): number | null {
    if (window === 'all') return null;
    
    const now = Math.floor(Date.now() / 1000);
    const seconds: Record<string, number> = {
        '24h': 24 * 60 * 60,
        '7d': 7 * 24 * 60 * 60,
        '30d': 30 * 24 * 60 * 60,
    };
    
    return now - (seconds[window] || 0);
}
