import { Elysia, t } from 'elysia';
import { ActivityService } from '../services/activity.service';

export const activityRoutes = new Elysia({ prefix: '/api' })
    .get('/activity/:address', ActivityService.getActivity, {
        params: t.Object({
            address: t.String(),
        }),
        query: t.Object({
            type: t.Optional(t.String()),
            period: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
            chainId: t.Optional(t.String()),
        }),
        detail: {
            summary: 'Get user activity history',
            description: 'Get unified activity history for a user address including trading, lending, transfers, agent actions, and predictions',
            tags: ['Activity'],
        },
    });
