import { Elysia, t } from 'elysia';
import { CurrencyController } from '../controllers';

// Main currencies routes matching the main API structure
export const currencyRoutes = new Elysia({ prefix: '/api' })
  // Get all currencies with advanced filtering and pagination
  .get('/currencies', CurrencyController.getAllCurrencies, {
    query: t.Object({
      chainId: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      offset: t.Optional(t.String()),
      tokenType: t.Optional(t.Union([t.Literal('underlying'), t.Literal('synthetic')])),
      onlyActual: t.Optional(t.String())
    }),
  })
  // Get currency by address (query parameter - for backward compatibility)
  .get('/currency', CurrencyController.getCurrencyByQuery, {
    query: t.Object({
      address: t.String({
        pattern: '^0x[a-fA-F0-9]{40}$',
        error: 'Invalid Ethereum address format'
      }),
    }),
  })
  // Get currency by address (path parameter - matching main API)
  .get('/currencies/:address', CurrencyController.getCurrencyByParam, {
    params: t.Object({
      address: t.String({
        pattern: '^0x[a-fA-F0-9]{40}$',
        error: 'Invalid Ethereum address format'
      })
    }),
  });
