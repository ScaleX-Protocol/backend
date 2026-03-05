import { Elysia, t } from 'elysia';
import { AgentsService } from '../services/agents.service';

export const agentsRoutes = new Elysia({ prefix: '/api' })
    .get('/agents', AgentsService.getAgents, {
        query: t.Object({
            owner: t.Optional(t.String()),
            chainId: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
        }),
        detail: {
            summary: 'Get agents',
            description: 'Get list of agents with optional filtering by owner',
            tags: ['Agents'],
        },
    })
    .get('/agents/:agentTokenId', AgentsService.getAgent, {
        params: t.Object({
            agentTokenId: t.String(),
        }),
        detail: {
            summary: 'Get agent details',
            description: 'Get details for a specific agent by token ID',
            tags: ['Agents'],
        },
    })
    .get('/agents/:agentTokenId/stats', AgentsService.getAgentStats, {
        params: t.Object({
            agentTokenId: t.String(),
        }),
        detail: {
            summary: 'Get agent stats',
            description: 'Get trading stats for a specific agent',
            tags: ['Agents'],
        },
    })
    .get('/agents/:agentTokenId/lending', AgentsService.getAgentLending, {
        params: t.Object({
            agentTokenId: t.String(),
        }),
        detail: {
            summary: 'Get agent lending',
            description: 'Get lending data for a specific agent',
            tags: ['Agents'],
        },
    })
    .get('/agents/:agentTokenId/policy', AgentsService.getAgentPolicy, {
        params: t.Object({
            agentTokenId: t.String(),
        }),
        detail: {
            summary: 'Get agent policy',
            description: 'Get policy configuration for a specific agent',
            tags: ['Agents'],
        },
    })
    .get('/agents/:agentTokenId/users', AgentsService.getAgentUsers, {
        params: t.Object({
            agentTokenId: t.String(),
        }),
        query: t.Object({
            chainId: t.Optional(t.String()),
            enabled: t.Optional(t.String()),
            owner: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
        }),
        detail: {
            summary: 'Get agent users',
            description: 'Get users who installed a specific agent',
            tags: ['Agents'],
        },
    })
    .get('/agents/:agentTokenId/orders', AgentsService.getAgentOrders, {
        params: t.Object({
            agentTokenId: t.String(),
        }),
        query: t.Object({
            chainId: t.Optional(t.String()),
            status: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
        }),
        detail: {
            summary: 'Get agent orders',
            description: 'Get orders placed by a specific agent',
            tags: ['Agents'],
        },
    })
    .get('/agents/:agentTokenId/violations', AgentsService.getAgentViolations, {
        params: t.Object({
            agentTokenId: t.String(),
        }),
        query: t.Object({
            chainId: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
        }),
        detail: {
            summary: 'Get agent violations',
            description: 'Get policy violations for a specific agent',
            tags: ['Agents'],
        },
    })
    .get('/agents/:agentTokenId/circuit-breakers', AgentsService.getAgentCircuitBreakers, {
        params: t.Object({
            agentTokenId: t.String(),
        }),
        query: t.Object({
            chainId: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
        }),
        detail: {
            summary: 'Get agent circuit breakers',
            description: 'Get circuit breaker events for a specific agent',
            tags: ['Agents'],
        },
    })
    .get('/agents/:agentTokenId/predictions', AgentsService.getAgentPredictions, {
        params: t.Object({
            agentTokenId: t.String(),
        }),
        query: t.Object({
            chainId: t.Optional(t.String()),
            action: t.Optional(t.String()),
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
        }),
        detail: {
            summary: 'Get agent predictions',
            description: 'Get prediction events for a specific agent with optional action filter (PREDICT/CLAIM)',
            tags: ['Agents'],
        },
    })
    .get('/agents/:agentTokenId/analytics', AgentsService.getAgentAnalytics, {
        params: t.Object({
            agentTokenId: t.String(),
        }),
        query: t.Object({
            chainId: t.Optional(t.String()),
            window: t.Optional(t.String()),
        }),
        detail: {
            summary: 'Get agent analytics',
            description: 'Compute PnL, win rate, fill rate for an agent',
            tags: ['Agents'],
        },
    });
