import { Elysia, t } from 'elysia';
import { LeaderboardController } from '../controllers/leaderboard.controller';

export const leaderboardRoutes = new Elysia({ prefix: '/api' })
    .get('/leaderboard', LeaderboardController.getLeaderboard, {
        query: t.Object({
            type: t.Optional(t.String()),
            sortBy: t.Optional(t.String()),
            window: t.Optional(t.String()),
            chainId: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
        }),
        detail: {
            summary: 'Get leaderboard',
            description: 'Ranked list of users and/or agents by PnL, volume, or managed users. Supports time-window filtering.',
            tags: ['Leaderboard'],
        },
    });
