import { t } from 'elysia';

export const WalletValidation = {
  query: {
    indicesQuery: t.Object({
      indices: t.Optional(t.String({
        pattern: '^[0-9,\\-]+$',
        description: 'Wallet indices (e.g., "0,1,2" or "0-4" or "2,3,4,5,7")'
      }))
    })
  }
};
