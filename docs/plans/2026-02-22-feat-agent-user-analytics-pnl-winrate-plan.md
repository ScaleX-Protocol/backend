---
title: "feat: Add agent & user analytics endpoints (PnL, win rate, fill rate)"
type: feat
status: completed
date: 2026-02-22
brainstorm: docs/brainstorms/2026-02-22-agent-user-analytics-brainstorm.md
---

# feat: Add Agent & User Analytics Endpoints

## Overview

Add dedicated `/analytics` endpoints to the Ponder API that compute realized PnL, unrealized PnL, win rate, fill rate, and time-windowed performance metrics on-the-fly for both agents (by `agentTokenId`) and users (by wallet address). All calculations use the existing `orders` + `trades` tables with average cost basis — no schema migrations or new tables required.

## Problem Statement / Motivation

Current agent endpoints (`/api/agents/:id/stats`) only return raw counters (order counts, volume totals). There is no way to evaluate agent or user trading performance — no PnL, no win/loss tracking, no fill efficiency. This data is essential for:
- Users evaluating whether to authorize an agent
- Agents monitoring their own performance
- Protocol governance tracking ecosystem health
- Policy enforcement (the `agentPolicies` table already has `minWinRateBps` and drawdown thresholds)

## Proposed Solution

Two new endpoints computed on-the-fly from existing indexed data:

```
GET /api/agents/:id/analytics?window=24h|7d|30d|all&chainId=84532
GET /api/users/:address/analytics?window=24h|7d|30d|all&chainId=84532
```

Both return the same response shape with aggregate totals and per-pool breakdown.

## Technical Approach

### Architecture

All computation happens in `ponder/src/api/index.ts` using Drizzle ORM queries against the existing Ponder PostgreSQL database. No separate analytics service, no TimescaleDB, no schema changes.

**Data flow:**
```
trades JOIN orders ON trades.orderId = orders.id
  → filter by agentTokenId or userAddress
  → filter by chainId
  → filter by timestamp (window)
  → JOIN pools ON orders.poolId = pools.orderBook (for decimals + token info)
  → JOIN currencies (for token symbols)
  → GROUP BY poolId + side
  → compute weighted avg prices, realized/unrealized PnL per pool
  → aggregate across pools for totals
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Price source | `trades.price` (execution price per fill) | `orders.price` is the limit price, not what actually executed. Market orders may have price=0. |
| Quantity source | `trades.quantity` (actual fill qty) | `orders.quantity` is intended, `orders.filled` is aggregate — `trades.quantity` gives per-fill granularity |
| Cost basis method | Weighted average cost | Simpler than FIFO, computable in SQL: `SUM(price × quantity) / SUM(quantity)` |
| Unrealized PnL price | `pools.price` (last known market price) | Updated on every trade event, always available, pool-level canonical price |
| Win rate denominator | Pools with both buys AND sells | Buy-only pools have no realized PnL to evaluate — including them would artificially deflate win rate |
| Fill rate denominator | Exclude REJECTED orders | REJECTED orders never reached the orderbook. Include OPEN, PARTIALLY_FILLED, FILLED, CANCELLED, EXPIRED |
| Agent aggregation | Aggregate across all users per agent | The agent endpoint measures agent strategy performance, not individual user outcomes |
| Side casing | `"Buy"` / `"Sell"` (title-case) | Matches `orders.side` from `OrderSide` enum in `ponder/src/utils/constants.ts` |
| Non-existent entity | 200 with zero-state | Consistent with "no activity in window" — not an error |
| Invalid params | 400 with error message | Explicit validation for window, chainId, agentTokenId, address |

### Implementation Phases

#### Phase 1: Core Analytics Logic (Shared Helper)

Create a shared analytics computation function used by both endpoints.

**File:** `ponder/src/api/index.ts` (add near other agent endpoints, ~line 3000+)

```typescript
// Helper: compute analytics for a set of orders/trades
async function computeAnalytics(
  db: any,
  filterCondition: SQL,  // eq(orders.agentTokenId, id) or eq(orders.userAddress, addr)
  chainId: number,
  windowStart: number | null,  // unix timestamp, null = all time
) {
  // Step 1: Get all fills with order context
  // JOIN trades → orders → pools
  // Filter by chainId, filterCondition, timestamp >= windowStart
  // Group by poolId + side

  // Step 2: Per-pool computation
  // avgBuyPrice = SUM(trades.price * trades.quantity) / SUM(trades.quantity) WHERE side='Buy'
  // avgSellPrice = SUM(trades.price * trades.quantity) / SUM(trades.quantity) WHERE side='Sell'
  // totalBought = SUM(trades.quantity) WHERE side='Buy'
  // totalSold = SUM(trades.quantity) WHERE side='Sell'
  // realizedPnl = (avgSellPrice - avgBuyPrice) * min(totalBought, totalSold)
  //   → normalize by decimals: / 10^baseDecimals for quantity, prices already in quote units
  // netPosition = totalBought - totalSold
  // unrealizedPnl = (pools.price - avgBuyPrice) * netPosition (when netPosition > 0)

  // Step 3: Aggregate totals
  // totalRealizedPnl = SUM(perPool.realizedPnl)  — all in quote currency (assumed same denomination)
  // totalUnrealizedPnl = SUM(perPool.unrealizedPnl)
  // winRate = pools with realizedPnl > 0 / pools with both buys AND sells

  // Step 4: Fill rate (separate query on orders table)
  // filled = COUNT WHERE status IN ('FILLED', 'PARTIALLY_FILLED')
  // total = COUNT WHERE status NOT IN ('REJECTED')
  // fillRate = filled / total
}
```

**SQL Strategy — Two Queries:**

**Query 1: PnL data** (trades + orders + pools join)
```sql
SELECT
  o."poolId",
  o.side,
  SUM(t.quantity) as total_quantity,
  SUM(t.quantity * t.price) as total_quote_value,
  COUNT(*) as trade_count,
  p."baseDecimals",
  p."quoteDecimals",
  p.price as last_price,
  p.coin as symbol
FROM trades t
INNER JOIN orders o ON t."orderId" = o.id
INNER JOIN pools p ON o."poolId" = p."orderBook"
WHERE o."chainId" = $chainId
  AND $filterCondition
  AND o.status IN ('FILLED', 'PARTIALLY_FILLED')
  AND ($windowStart IS NULL OR t.timestamp >= $windowStart)
GROUP BY o."poolId", o.side, p."baseDecimals", p."quoteDecimals", p.price, p.coin
```

**Query 2: Fill rate data** (orders only)
```sql
SELECT
  o.status,
  COUNT(*)::int as count
FROM orders o
WHERE o."chainId" = $chainId
  AND $filterCondition
  AND o.status != 'REJECTED'
  AND ($windowStart IS NULL OR o.timestamp >= $windowStart)
GROUP BY o.status
```

**PnL computation per pool (in JS after query):**
```typescript
// For each poolId, from Query 1 grouped results:
const buys = poolData.filter(r => r.side === 'Buy');
const sells = poolData.filter(r => r.side === 'Sell');

const totalBought = buys.totalQuantity;        // bigint
const totalBuyQuote = buys.totalQuoteValue;     // bigint (price × qty sum)
const totalSold = sells.totalQuantity;          // bigint
const totalSellQuote = sells.totalQuoteValue;   // bigint

// Average prices (in raw quote units per base unit)
const avgBuyPrice = totalBought > 0n ? totalBuyQuote / totalBought : 0n;
const avgSellPrice = totalSold > 0n ? totalSellQuote / totalSold : 0n;

// Realized PnL (in raw quote units)
const matchedQty = totalBought < totalSold ? totalBought : totalSold;  // min()
const realizedPnlRaw = (avgSellPrice - avgBuyPrice) * matchedQty;
// Normalize: divide by 10^baseDecimals (since qty is in base units, price is quote/base)
// Result is in raw quote units → divide by 10^quoteDecimals for human-readable

// Net position (in base units)
const netPosition = totalBought - totalSold;  // positive = long exposure

// Unrealized PnL (using pools.price as last market price)
const unrealizedPnlRaw = netPosition > 0n
  ? (lastPrice - avgBuyPrice) * netPosition
  : 0n;
```

#### Phase 2: Agent Analytics Endpoint

**File:** `ponder/src/api/index.ts`

```
GET /api/agents/:id/analytics?window=24h|7d|30d|all&chainId=84532
```

- Validate `:id` is a valid bigint
- Validate `window` is one of `24h|7d|30d|all`
- Filter: `eq(orders.agentTokenId, BigInt(id))` AND `agentTokenId > 0`
- Call `computeAnalytics(db, filterCondition, chainId, windowStart)`
- Return structured response

#### Phase 3: User Analytics Endpoint

**File:** `ponder/src/api/index.ts`

```
GET /api/users/:address/analytics?window=24h|7d|30d|all&chainId=84532
```

- Validate `:address` is a hex address format
- Normalize to lowercase: `address.toLowerCase()`
- Filter: `eq(orders.userAddress, normalizedAddress)`
- Call `computeAnalytics(db, filterCondition, chainId, windowStart)`
- Return same structured response

### Response Shape

```json
{
  "success": true,
  "data": {
    "realizedPnl": "1234.567890",
    "unrealizedPnl": "456.123456",
    "totalPnl": "1690.691346",
    "winRate": 0.65,
    "fillRate": 0.82,
    "totalTrades": 47,
    "winningPools": 4,
    "losingPools": 2,
    "totalPoolsTraded": 6,
    "totalOrdersPlaced": 57,
    "totalOrdersFilled": 47,
    "totalVolume": "50000.123456",
    "avgTradeSize": "1063.832520",
    "window": "7d",
    "periodStart": 1739577600,
    "periodEnd": 1740182400,
    "pools": [
      {
        "poolId": "0xabc...",
        "symbol": "WETHUSDC",
        "realizedPnl": "800.000000",
        "unrealizedPnl": "200.000000",
        "winRate": 1.0,
        "totalBuyQuantity": "2.500000000000000000",
        "totalSellQuantity": "2.000000000000000000",
        "openPositionSize": "0.500000000000000000",
        "avgEntryPrice": "3200.000000",
        "avgExitPrice": "3600.000000",
        "lastPrice": "3600.000000",
        "tradeCount": 12
      }
    ]
  }
}
```

**All monetary values are strings** (consistent with existing API convention).
**Rates (winRate, fillRate) are numbers** between 0.0 and 1.0.
**Counts are integers.**
**Timestamps are unix seconds** (consistent with existing schema).
**Per-pool array sorted by absolute realizedPnl descending.**

### Input Validation

```typescript
// Window validation
const VALID_WINDOWS = ['24h', '7d', '30d', 'all'] as const;
if (window && !VALID_WINDOWS.includes(window)) {
  return c.json({ success: false, error: "Invalid window. Must be: 24h, 7d, 30d, all" }, 400);
}

// Window to timestamp
function windowToTimestamp(window: string): number | null {
  if (window === 'all') return null;
  const now = Math.floor(Date.now() / 1000);
  const durations: Record<string, number> = {
    '24h': 86400,
    '7d': 604800,
    '30d': 2592000,
  };
  return now - (durations[window] ?? 0);
}

// Agent ID validation
const agentId = c.req.param('id');
try { BigInt(agentId); } catch { return c.json({ success: false, error: "Invalid agent ID" }, 400); }

// Address validation
const address = c.req.param('address');
if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
  return c.json({ success: false, error: "Invalid address format" }, 400);
}
```

## Acceptance Criteria

### Functional Requirements

- [x] `GET /api/agents/:id/analytics` returns PnL, win rate, fill rate for an agent
- [x] `GET /api/users/:address/analytics` returns same metrics for a user address
- [x] `?window=24h|7d|30d|all` filters all metrics by time window (rolling)
- [x] `?chainId=` supports chain filtering (default: 84532)
- [x] Realized PnL uses average cost basis from actual fill prices (`trades.price`)
- [x] Unrealized PnL uses `pools.price` as last market price for net long positions
- [x] Win rate = pools with realized PnL > 0 / pools with both buys and sells
- [x] Fill rate = (FILLED + PARTIALLY_FILLED) / all orders excluding REJECTED
- [x] Per-pool breakdown array included with individual pool metrics
- [x] Zero-state response (all zeros, empty pools array) for entities with no activity
- [x] Invalid window returns 400 error
- [x] Invalid agent ID / address format returns 400 error
- [x] All monetary values serialized as strings
- [x] Address lookup is case-insensitive (normalized to lowercase)

### Non-Functional Requirements

- [x] Response time < 2s for typical agents (< 1000 orders)
- [x] No schema migrations required
- [x] No new tables or columns
- [x] Follows existing API response envelope pattern (`{ success, data, ... }`)

## Files to Modify

| File | Change |
|------|--------|
| `ponder/src/api/index.ts` | Add `computeAnalytics()` helper, agent analytics endpoint, user analytics endpoint |

That's it — single file change.

## Dependencies & Risks

**Dependencies:**
- Existing `orders`, `trades`, `pools` tables must be populated (indexer running)
- `trades.orderId` must correctly reference `orders.id` (verified in existing handlers)

**Risks:**
- **Performance for `window=all` on high-volume agents:** Mitigated by existing indexes `agentTimestampIdx` on `(agentTokenId, timestamp)` and the fact that Base Sepolia volumes are low
- **BigInt arithmetic precision:** All PnL math stays in BigInt until final decimal normalization — no intermediate `Number()` conversion
- **Mixed quote currencies across pools:** Aggregate `totalPnl` sums PnL across pools assuming same quote denomination. If pools use different quote tokens (USDC vs USDT vs DAI), this is an approximation. Acceptable for MVP since all current pools use the same quote currency

## References & Research

### Internal References
- Brainstorm: `docs/brainstorms/2026-02-22-agent-user-analytics-brainstorm.md`
- API endpoints: `ponder/src/api/index.ts` (existing agent endpoints pattern)
- Schema: `ponder/ponder.schema.ts` (orders, trades, pools, agentStats tables)
- Constants: `ponder/src/utils/constants.ts` (OrderSide enum: "Buy"/"Sell")
- Order helpers: `ponder/src/utils/orderHelpers.ts` (decimal conversion patterns)
- Existing PnL reference: `analytics-service/src/jobs/pnl-calculation-job.ts` (FIFO approach, user-scoped)

### Existing Index Coverage
- `orders`: `agentTimestampIdx(agentTokenId, timestamp)`, `userStatusTimestampIdx(userAddress, status, timestamp)`
- `trades`: indexed by `orderId`, `poolId`, `timestamp`
- `pools`: indexed by `orderBook`
