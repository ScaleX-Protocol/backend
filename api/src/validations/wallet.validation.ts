import { t } from 'elysia';

export const WalletValidation = {
  params: {
    address: t.Object({
      address: t.String({
        minLength: 42,
        maxLength: 42,
        pattern: '^0x[a-fA-F0-9]{40}$',
        description: 'Ethereum address'
      })
    })
  },
  query: {
    indicesQuery: t.Object({
      indices: t.Optional(t.String({
        pattern: '^[0-9,\\-]+$',
        description: 'Wallet indices (e.g., "0,1,2" or "0-4" or "2,3,4,5,7")'
      }))
    }),
    detailQuery: t.Object({
      limit: t.Optional(t.String({
        pattern: '^[0-9]+$',
        description: 'Number of orders to return (default: 100, max: 1000)'
      })),
      side: t.Optional(t.String({
        pattern: '^(buy|sell|BUY|SELL|Buy|Sell)$',
        description: 'Filter by order side (buy or sell)'
      })),
      type: t.Optional(t.String({
        pattern: '^(Limit|Market)$',
        description: 'Filter by order type (Limit or Market)'
      })),
      status: t.Optional(t.String({
        pattern: '^(OPEN|FILLED|CANCELLED|PARTIALLY_FILLED)$',
        description: 'Filter by order status'
      }))
    })
  }
};
