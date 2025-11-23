import { Elysia, t } from 'elysia';
import { LendingController } from '../controllers/lending.controller';

export const lendingRoutes = new Elysia({ prefix: '/api/lending' })
  .get('/dashboard/:user', LendingController.getLendingDashboard, {
    params: t.Object({
      user: t.String({
        pattern: '^0x[a-fA-F0-9]{40}$',
        error: 'Invalid Ethereum address format'
      })
    }),
    query: t.Object({
      chainId: t.Optional(t.String())
    })
  });