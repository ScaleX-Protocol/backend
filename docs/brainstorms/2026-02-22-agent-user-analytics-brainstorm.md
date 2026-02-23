# Agent & User Analytics (PnL, Win Rate, Fill Rate)

**Date:** 2026-02-22
**Status:** Brainstorm

## What We're Building

Dedicated analytics endpoints in the Ponder API that compute PnL, win rate, fill rate, and time-windowed performance metrics on-the-fly for both agents and user addresses.

### Metrics

| Metric | Definition | Source Data |
|--------|-----------|-------------|
| **Realized PnL** | Profit/loss from closed positions using average cost basis | `orders` (side, price, filled) + `trades` (fill price/qty) |
| **Win Rate** | % of profitable closed trades (realized PnL > 0 per round-trip) | Derived from PnL per trade pair |
| **Fill Rate** | % of orders that reached FILLED or PARTIALLY_FILLED status | `orders` status counts per agent/user |
| **Time-windowed stats** | All metrics filtered by 24h / 7d / 30d / all-time | Timestamp filtering on orders/trades |

### Endpoints

```
GET /api/agents/:id/analytics?window=24h|7d|30d|all&chainId=84532
GET /api/users/:address/analytics?window=24h|7d|30d|all&chainId=84532
```

### Response Shape

```json
{
  "realizedPnl": "1234.56",
  "unrealizedPnl": "456.78",
  "totalPnl": "1691.34",
  "winRate": 0.65,
  "fillRate": 0.82,
  "totalTrades": 47,
  "winningTrades": 31,
  "losingTrades": 16,
  "totalOrdersPlaced": 57,
  "totalOrdersFilled": 47,
  "totalVolume": "50000.00",
  "avgTradeSize": "1063.83",
  "window": "7d",
  "periodStart": "2026-02-15T00:00:00Z",
  "periodEnd": "2026-02-22T00:00:00Z",
  "pools": [
    {
      "poolId": "0x...",
      "baseToken": "WETH",
      "quoteToken": "USDC",
      "realizedPnl": "800.00",
      "unrealizedPnl": "200.00",
      "winRate": 0.70,
      "totalTrades": 20,
      "openPositionSize": "0.5",
      "avgEntryPrice": "3200.00",
      "lastPrice": "3600.00"
    }
  ]
}
```

## Why This Approach

- **Ponder API only** — no separate analytics service needed; compute from existing indexed data at query time
- **Average cost basis** — simpler than FIFO, computable in SQL with weighted averages, standard for crypto
- **On-the-fly computation** — always accurate, no schema migrations, no event handler complexity
- **Dedicated endpoints** — clean separation from existing `/stats` endpoints, easy to iterate independently
- **Both agents and users** — same logic, different scoping (agentTokenId vs userAddress)

## Key Decisions

1. **Compute layer:** Ponder API (not analytics-service)
2. **PnL method:** Average cost basis
3. **Computation timing:** On-the-fly per request
4. **Time windows:** 24h / 7d / 30d / all-time
5. **Scope:** Both agents (by agentTokenId) and users (by address)
6. **API structure:** Dedicated `/analytics` endpoints
7. **Breakdown:** Per-pool/token-pair breakdown included in response
8. **Unrealized PnL:** Included, using last trade price as market price

## PnL Calculation Logic

Per token pair (poolId), per agent/user:

1. **Aggregate buys:** Sum all filled buy quantities and quote amounts → `avgBuyPrice = totalQuoteSpent / totalBaseBought`
2. **Aggregate sells:** Sum all filled sell quantities and quote amounts → `avgSellPrice = totalQuoteReceived / totalBaseSold`
3. **Realized PnL:** `(avgSellPrice - avgBuyPrice) * min(totalBaseBought, totalBaseSold)`
4. **Open position:** `netPosition = totalBaseBought - totalBaseSold` (if > 0, long exposure remains)
5. **Unrealized PnL:** `(lastTradePrice - avgBuyPrice) * netPosition` (only when netPosition > 0)
6. **Last price source:** Most recent `trades.price` for the same poolId
7. **Win rate:** Count of pools where realized PnL > 0 / total pools traded
8. **Fill rate:** Orders with status FILLED or PARTIALLY_FILLED / total orders placed

## Data Flow

```
orders table (agentTokenId or userAddress filter)
  → filter by status (FILLED, PARTIALLY_FILLED)
  → filter by timestamp (window)
  → group by poolId + side
  → compute avg cost, realized PnL per pool
  → aggregate across pools for totals
```

## Resolved Questions

1. **Per-pool breakdown?** Yes — include per-token-pair PnL breakdown in a `pools` array alongside aggregate totals.
2. **Unrealized PnL?** Yes — estimate unrealized PnL using last trade price from `trades` table for open positions (net buy qty - net sell qty > 0).
