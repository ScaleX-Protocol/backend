# Leaderboard Endpoint Brainstorm

**Date:** 2026-02-25
**Status:** Draft
**Feature:** Add `GET /api/leaderboard` endpoint for ranking users and agents

---

## What We're Building

A single paginated endpoint that ranks users and agents by performance metrics (PnL, volume, or managed users). Clients can filter by entity type and time window, enabling both an overall leaderboard and specialized views (top agents by PnL in the last 7 days, top users by volume all-time, etc.).

---

## Context

The API already has:
- `GET /api/users/:address/analytics` — per-user PnL/win rate/fill rate
- `GET /api/agents/:agentTokenId/analytics` — per-agent PnL/win rate/fill rate
- A shared `computeAnalytics()` function that joins `trades → orders → pools` and computes PnL in application code

The leaderboard differs from analytics in that it must **rank across all entities** — requiring a restructured SQL query using `GROUP BY userAddress` or `GROUP BY agentTokenId` rather than filtering for one entity.

---

## Endpoint Design

### Route

```
GET /api/leaderboard
```

### Query Parameters

| Param | Type | Default | Values | Notes |
|---|---|---|---|---|
| `type` | string | — | `user`, `agent` | Optional; if omitted, return both mixed |
| `sortBy` | string | `volume` | `pnl`, `volume`, `managed_users` | `managed_users` only valid when `type=agent` |
| `window` | string | `all` | `24h`, `7d`, `30d`, `all` | Same windows as analytics endpoints |
| `chainId` | number | `84532` | any | Chain ID filter |
| `limit` | number | `50` | max `100` | Page size |
| `offset` | number | `0` | — | Pagination offset |

### Response Shape

```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "type": "user",
      "address": "0xabc...",
      "realizedPnl": "1234.56",
      "totalVolume": "50000.00",
      "winRate": 0.65,
      "fillRate": 0.80,
      "totalTrades": 150
    },
    {
      "rank": 2,
      "type": "agent",
      "agentTokenId": "42",
      "name": "TrendFollower",
      "description": "...",
      "realizedPnl": "980.00",
      "totalVolume": "45000.00",
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

---

## Why This Approach

### PnL Computation: Exact SQL-based (chosen)

Realized PnL will be computed directly in SQL using a `GROUP BY` aggregate query across `trades → orders → pools`. This mirrors the logic in `computeAnalytics()` but runs as a single query for all entities rather than per-entity application code.

Formula:
```
realizedPnl = (avgSellPrice - avgBuyPrice) * min(totalSold, totalBought)
```
grouped by `userAddress` (or `agentTokenId`), scoped by `window`.

**Pros:** Accurate, returns a ranked list in one DB query, supports pagination via SQL `ORDER BY ... LIMIT ... OFFSET`.
**Cons:** More complex SQL; no unrealized PnL (excluded from leaderboard to keep queries fast).

### Alternatives Considered

- **Precomputed totals from `agentStats`/`users` tables:** Fast, but `totalVolume` is all-time only with no time-window support and no PnL.
- **Top-N by volume then rerank by PnL:** Introduces two queries and a heuristic; risks missing high-PnL low-volume traders.

---

## Key Decisions

1. **Single endpoint** with `type`, `sortBy`, `window`, `chainId`, `limit`, `offset` query params.
2. **`managed_users`** metric (distinct users who installed an agent) is agent-only; return 400 if `sortBy=managed_users` and `type=user`.
3. **Leaderboard excludes unrealized PnL** — only realized PnL used for ranking (consistent across entities, no dependency on last price).
4. **Entities with zero trades** are excluded (not ranked).
5. **Pagination** uses standard `limit`/`offset` pattern with max `limit=100`.
6. **Response follows** existing `{ success, data, count, pagination }` envelope convention.

---

## Open Questions

_None — all resolved._

---

## Resolved Questions

- **PnL accuracy**: Use exact SQL-based computation (not precomputed approximations).
- **Time window**: Support `24h|7d|30d|all` (same as analytics endpoints).
- **Metrics**: PnL, volume, managed_users (agents only).
- **Structure**: Single endpoint with query params rather than multiple routes.
- **When `type` is omitted**: Return a mixed ranked list (users and agents together), each entry with a `type` field. Can still be filtered by `type=user|agent`.
- **Agent PnL scope**: Aggregate across all users — sum of PnL from all orders linked to that `agentTokenId`.
- **Tie-breaking**: Primary sort by chosen metric, secondary by `totalTrades DESC`, tertiary by `winRate DESC`.
- **Address format**: EIP-55 checksummed format in responses.
