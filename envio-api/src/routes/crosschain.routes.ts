import { Elysia, t } from 'elysia';
import { CrossChainController } from '../controllers/crosschain.controller';

export const crosschainRoutes = new Elysia({ prefix: '/api' })
  .get('/cross-chain-deposits', CrossChainController.getCrossChainDeposits, {
    query: t.Object({
      user: t.String({
        error: 'User parameter is required'
      }),
      status: t.Optional(t.Union([t.Literal('pending'), t.Literal('sent'), t.Literal('relayed')])),
      limit: t.Optional(t.String())
    }),
  })
  .get('/token-mappings', CrossChainController.getTokenMappings, {
    query: t.Object({
      sourceChainId: t.Optional(t.String()),
      targetChainId: t.Optional(t.String()),
      symbol: t.Optional(t.String()),
      isActive: t.Optional(t.String()),
      limit: t.Optional(t.String())
    }),
  });