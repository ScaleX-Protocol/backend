import { Context } from 'elysia';
import { isValidWindow, LeaderboardService } from '../services/leaderboard.service';

const VALID_SORT_BY = ['pnl', 'volume', 'managed_users'] as const;
const VALID_TYPES = ['user', 'agent'] as const;

export class LeaderboardController {
    static async getLeaderboard(ctx: Context) {
        try {
            const { query } = ctx as any;

            // Parse type
            const type = query.type as string | undefined;
            if (type && !VALID_TYPES.includes(type as any)) {
                ctx.set.status = 400;
                return { success: false, error: `Invalid type. Must be: user, agent` };
            }

            // Parse sortBy
            const sortBy = (query.sortBy as string) ?? 'volume';
            if (!VALID_SORT_BY.includes(sortBy as any)) {
                ctx.set.status = 400;
                return { success: false, error: `Invalid sortBy. Must be: pnl, volume, managed_users` };
            }

            // Validate managed_users only valid for agents
            if (sortBy === 'managed_users' && type === 'user') {
                ctx.set.status = 400;
                return { success: false, error: `sortBy=managed_users is only valid when type=agent` };
            }

            // Parse window
            const window = (query.window as string) ?? 'all';
            if (!isValidWindow(window)) {
                ctx.set.status = 400;
                return { success: false, error: `Invalid window. Must be: 24h, 7d, 30d, all` };
            }

            // Parse chainId
            const chainId = query.chainId ? parseInt(query.chainId as string) : 84532;
            if (isNaN(chainId)) {
                ctx.set.status = 400;
                return { success: false, error: `Invalid chainId` };
            }

            // Parse limit (capped at 100)
            const limit = Math.min(Math.max(parseInt((query.limit as string) ?? '50') || 50, 1), 100);

            // Parse offset
            const offset = Math.max(parseInt((query.offset as string) ?? '0') || 0, 0);

            const result = await LeaderboardService.getLeaderboard({
                type: type as 'user' | 'agent' | undefined,
                sortBy: sortBy as 'pnl' | 'volume' | 'managed_users',
                window,
                chainId,
                limit,
                offset,
            });

            return result;
        } catch (error) {
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch leaderboard: ${error}` };
        }
    }
}
