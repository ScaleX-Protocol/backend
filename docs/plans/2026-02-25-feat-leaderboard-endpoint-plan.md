---
title: "feat: Add Leaderboard Endpoint"
type: feat
status: active
date: 2026-02-25
---

# feat: Add Leaderboard Endpoint

## Overview

Add `GET /api/leaderboard` to the `/api` (Elysia/Bun) service, which already has a `ponderDb` connection to the Ponder indexer database. The endpoint ranks users and agents by realized PnL, trading volume, or managed users (agent-only), with time-window and pagination support.

**Brainstorm:** `docs/brainstorms/2026-02-25-leaderboard-endpoint-brainstorm.md`

---

## Endpoint Contract

```
GET /api/leaderboard
```

### Query Parameters

| Param | Type | Default | Values | Validation |
|---|---|---|---|---|
| `type` | string | — | `user`, `agent` | Optional; if omitted, return mixed |
| `sortBy` | string | `volume` | `pnl`, `volume`, `managed_users` | 400 if `managed_users` + `type=user` |
| `window` | string | `all` | `24h`, `7d`, `30d`, `all` | 400 on invalid |
| `chainId` | number | `84532` | integer | Defaults to Base Sepolia |
| `limit` | number | `50` | 1–100 | Clamped at 100 |
| `offset` | number | `0` | ≥ 0 | — |

### Response Shape

```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "type": "user",
      "address": "0xAbC...",
      "realizedPnl": "1234.560000",
      "totalVolume": "50000.000000",
      "winRate": 0.65,
      "fillRate": 0.80,
      "totalTrades": 150
    },
    {
      "rank": 2,
      "type": "agent",
      "agentTokenId": "42",
      "name": "TrendFollower",
      "realizedPnl": "980.000000",
      "totalVolume": "45000.000000",
      "managedUsers": 12,
      "winRate": 0.60,
      "fillRate": 0.85,
      "totalTrades": 200
    }
  ],
  "count": 300,
  "pagination": { "limit": 50, "offset": 0 }
}
```

**Error response:**
```json
{ "success": false, "error": "sortBy=managed_users is only valid when type=agent" }
```

---

## Technical Approach

### Why `/api` (not Ponder)

The `/api` service already has `ponderDb` pointed at the Ponder PostgreSQL database. Adding the endpoint here:
- Follows the existing MVC pattern (routes → controllers → services)
- Keeps Ponder's indexer code (`ponder/src/api/index.ts`) unmodified
- Gets Swagger docs automatically
- Uses Elysia's TypeBox validation, consistent with all other routes

### PnL Computation Strategy

The existing `computeAnalytics()` in Ponder is per-entity (one SQL call per user/agent). For a leaderboard we need to rank across ALL entities in one pass — requiring a GROUP BY query.

**Two SQL queries, then in-memory computation:**

**Query 1 — PnL data per (entity, pool, side):**
```sql
SELECT
  -- group key: entity identifier
  lower(o.user_address) AS entity_key,     -- for users
  o.agent_token_id AS entity_key,          -- for agents
  o.pool_id,
  o.side,
  SUM(t.quantity)                  AS total_quantity,
  SUM(t.quantity * t.price)        AS total_quote_value,
  COUNT(*)                         AS trade_count,
  p.base_decimals,
  p.quote_decimals,
  p.price                          AS last_price,
  p.coin                           AS symbol
FROM trades t
  INNER JOIN orders o ON t.order_id = o.id
  INNER JOIN pools  p ON o.pool_id  = p.order_book
WHERE o.chain_id = $chainId
  AND o.status IN ('FILLED', 'PARTIALLY_FILLED')
  AND ($windowStart IS NULL OR t.timestamp >= $windowStart)
  -- For users:   AND o.agent_token_id = 0
  -- For agents:  AND o.agent_token_id > 0
GROUP BY entity_key, o.pool_id, o.side, p.base_decimals, p.quote_decimals, p.price, p.coin
```

**Query 2 — Fill rate per (entity, status):**
```sql
SELECT
  lower(o.user_address) AS entity_key,     -- or agent_token_id
  o.status,
  COUNT(*) AS count
FROM orders o
WHERE o.chain_id = $chainId
  AND ($windowStart IS NULL OR o.timestamp >= $windowStart)
  -- same entity filters as above
GROUP BY entity_key, o.status
```

**Query 3 — `managed_users` (agent only, only when `sortBy=managed_users`):**
```sql
SELECT
  agent_token_id,
  COUNT(DISTINCT owner) AS managed_users
FROM agent_installations
WHERE chain_id = $chainId
  AND enabled = true
GROUP BY agent_token_id
ORDER BY managed_users DESC
LIMIT $limit OFFSET $offset
```

**In-memory computation** (reuses the same math as `computeAnalytics`):
```
Per entity, per pool:
  avgBuyPrice  = totalBuyQuoteValue  / totalBuyQuantity
  avgSellPrice = totalSellQuoteValue / totalSellQuantity
  matchedQty   = min(totalBought, totalSold)
  realizedPnl  = (avgSellPrice - avgBuyPrice) * matchedQty
               / (10^baseDecimals * 10^quoteDecimals)
  volume       = (buyQuoteValue + sellQuoteValue)
               / (10^baseDecimals * 10^quoteDecimals)

Across all pools:
  realizedPnl = sum of per-pool realizedPnl
  totalVolume = sum of per-pool volume
  winRate     = winningPools / poolsWithBothSides
  fillRate    = (FILLED + PARTIALLY_FILLED) / (total - REJECTED)

Sort by sortBy metric DESC, then totalTrades DESC, then winRate DESC
Slice for pagination, add rank field (offset + index + 1)
```

For **mixed type** (no `type` param): run queries twice (once filtering agent_token_id = 0, once > 0), merge results, re-sort, paginate.

### Sorting

| `sortBy` | Sort key |
|---|---|
| `pnl` | `realizedPnl` (as float, descending) |
| `volume` | `totalVolume` (as float, descending) |
| `managed_users` | `managedUsers` count (descending), agent-only |

Tie-break 1: `totalTrades DESC`
Tie-break 2: `winRate DESC`

### Address Format

User addresses in responses use EIP-55 checksum via viem's `getAddress()`. The `/api` service already includes `viem` as a dependency.

```typescript
import { getAddress } from 'viem';
// ...
address: getAddress(entityKey)
```

---

## Files to Create / Modify

### New Files

#### 1. `api/src/schema/ponder-leaderboard.ts`

Drizzle schema definitions for the Ponder DB tables needed by the leaderboard. These are read-only views of the Ponder database — no migrations needed, just TypeScript type mappings.

```typescript
// ponder-orders-leaderboard, ponder-trades-leaderboard,
// ponder-pools-leaderboard, ponder-agent-registry,
// ponder-agent-installations
// (Column names verified against actual Ponder DB)
```

> **Note:** Ponder generates snake_case column names from camelCase schema properties.
> Verify actual column names by running: `\d orders` in the Ponder DB before implementation.
> Key mappings to verify: `user_address`, `agent_token_id`, `pool_id`, `order_book`, `base_decimals`, `quote_decimals`.

#### 2. `api/src/services/leaderboard.service.ts`

Core business logic:
- `getLeaderboard(params)` — main function handling all query paths
- `computePnlData(rows, fillRows)` — per-entity PnL + volume + win/fill rate
- `windowToTimestamp(window)` — converts `24h`/`7d`/`30d`/`all` → unix timestamp or null

#### 3. `api/src/controllers/leaderboard.controller.ts`

Handles request parsing, input validation, calls `LeaderboardService.getLeaderboard()`, returns response.

```typescript
export class LeaderboardController {
    static async getLeaderboard(ctx: Context) { ... }
}
```

#### 4. `api/src/routes/leaderboard.routes.ts`

Elysia route definition with TypeBox schema validation:

```typescript
export const leaderboardRoutes = new Elysia({ prefix: '/api' })
    .get('/leaderboard', LeaderboardController.getLeaderboard, {
        query: t.Object({
            type:    t.Optional(t.Union([t.Literal('user'), t.Literal('agent')])),
            sortBy:  t.Optional(t.String()),
            window:  t.Optional(t.String()),
            chainId: t.Optional(t.String()),
            limit:   t.Optional(t.String()),
            offset:  t.Optional(t.String()),
        })
    });
```

### Modified Files

#### 5. `api/src/routes/index.ts`

Add `leaderboardRoutes` to the export.

#### 6. `api/src/index.ts`

Register the new route:
```typescript
app.use(leaderboardRoutes);
```

---

## Acceptance Criteria

- [ ] `GET /api/leaderboard` returns 200 with ranked `data` array and `pagination` object
- [ ] `type=user` returns only user entries; `type=agent` returns only agent entries; no `type` returns mixed
- [ ] `sortBy=pnl` sorts by `realizedPnl` descending
- [ ] `sortBy=volume` sorts by `totalVolume` descending
- [ ] `sortBy=managed_users&type=agent` sorts by `managedUsers` descending
- [ ] `sortBy=managed_users&type=user` returns 400 with clear error message
- [ ] `window=24h|7d|30d` scopes PnL/volume to that time period; `window=all` uses all-time data
- [ ] Invalid `window` value returns 400
- [ ] `limit` is capped at 100; `offset` enables cursor-based pagination
- [ ] Agent entries include `agentTokenId`, `name` (from agentRegistry), `managedUsers`
- [ ] User `address` field is EIP-55 checksummed
- [ ] Entities with zero trades are excluded
- [ ] `rank` field reflects the correct 1-based rank including offset (e.g. offset=50 → first item has rank=51)
- [ ] Numeric fields (`realizedPnl`, `totalVolume`) serialized as 6-decimal strings
- [ ] Rates (`winRate`, `fillRate`) serialized as floats 0.0–1.0
- [ ] Endpoint appears in Swagger docs at `/docs`

---

## Dependencies & Risks

| Risk | Mitigation |
|---|---|
| Ponder DB column names differ from schema property names | Verify with `\d orders` before writing schema; use raw SQL if needed |
| Slow query for large datasets (many users) | Use existing indexes: `orders_user_timestamp_idx`, `orders_pool_chain_status_idx`; mixed query (two passes + merge) may be slower than typed queries |
| BigInt overflow during PnL math | Keep all arithmetic in BigInt until final division; use `.toString()` for serialization |
| `agentRegistry` missing metadata for some agents | Return `name: null` gracefully; don't exclude agent from leaderboard |
| Mixed leaderboard PnL scale | Users and agents are comparable since agent PnL is aggregate across all their users' orders |

---

## References

- **Existing analytics logic:** `ponder/src/api/index.ts:3583–3810` (`computeAnalytics`)
- **Ponder schema:** `ponder/ponder.schema.ts` (table definitions + index names)
- **API MVC example:** `api/src/routes/market.routes.ts`, `api/src/controllers/market.controller.ts`, `api/src/services/market.service.ts`
- **ponderDb connection:** `api/src/config/database.ts:24–32`
- **Ponder-schema example in /api:** `api/src/schema/ponder-currencies.ts`
- **viem getAddress:** already available via `viem` dependency in `api/package.json`
- **Brainstorm:** `docs/brainstorms/2026-02-25-leaderboard-endpoint-brainstorm.md`
