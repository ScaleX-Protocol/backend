---
title: In-Memory Order Cache for Ponder Indexer
date: 2026-03-04
status: complete
tags: [performance, indexer, caching, order-book]
---

# In-Memory Order Cache for Ponder Indexer

## What We're Building

A module-level `Map<string, any>` inside `orderHelpers.ts` that caches active orders during historical sync. The cache eliminates the DB read that `findActiveOrder`, `updateOrder`, and `updateOrderQuantity` each perform on every `OrderMatched` and `UpdateOrder` event — the primary bottleneck in the dense order book block range (37.9M–38.1M on Base Sepolia).

## Why This Approach

Ponder processes events in strict chronological order (single-threaded within a chain). This is the same guarantee that `syntheticCurrencyCache.ts` already relies on, with the comment: *"Ponder processes events in chronological order, so the cache is always populated before any transfer event that references a synthetic token."*

Since `OrderPlaced` always precedes `OrderMatched`/`UpdateOrder` for the same order in chain history, an order written to cache on `OrderPlaced` will always be available on the subsequent events. No race conditions, no external coordination needed.

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Cache location | `orderHelpers.ts` (module-level Map) | Follows `syntheticCurrencyCache.ts` pattern, minimal surface area |
| Cache scope | Historical sync only | Live mode has low event volume; simpler to clear and forget |
| Eviction strategy | Evict on terminal state (FILLED / CANCELLED / EXPIRED / REJECTED) | Keeps memory bounded during dense sync without needing LRU |
| Cache miss behavior | Fall back to DB read + log warning | Safe — handles edge cases (hot-reload mid-sync, pre-existing orders) |
| Cache clearing | Call `clearOrderCache()` the first time `executeIfInSync` fires | Reuses existing sync detection infrastructure from `syncState.ts` |
| No new dependencies | Plain `Map<string, any>` | Zero overhead, matches codebase style |

## Scope of Changes

Only `src/utils/orderHelpers.ts` needs to change:

1. **Add** module-level `const orderCache = new Map<string, any>()`
2. **Add** `export function clearOrderCache()` → `orderCache.clear()`
3. **`insertOrder`** → after DB insert, write to cache
4. **`findActiveOrder`** → check cache first; on miss, fall back to DB + `logger.warn`
5. **`updateOrder`** → use cache for `existingOrder` lookup; after `db.update`, update cache entry (or evict if terminal)
6. **`updateOrderQuantity`** → same as `updateOrder`
7. **`orderBookHandler.ts`** → call `clearOrderCache()` inside the first `executeIfInSync` block (e.g. in `handleOrderPlaced`) once we detect live mode

## Order Lifecycle (for eviction logic)

```
OrderPlaced   → OPEN (or PENDING)         → add to cache
OrderMatched  → PARTIALLY_FILLED          → update cache
              → FILLED                    → evict from cache
UpdateOrder   → CANCELLED/EXPIRED/REJECTED → evict from cache
```

## Expected Impact

- Each `OrderMatched` event: 3 DB reads eliminated → ~3 DB reads saved
- Each `UpdateOrder` event: 2 DB reads eliminated → ~2 DB reads saved
- Dense block range has thousands of events per block, so this is a significant reduction
- Memory: ~1–5 MB peak (a few thousand active orders × ~1KB each)

## Existing Precedent

- `src/utils/syntheticCurrencyCache.ts` — identical pattern (module Map + get/set helpers)
- `src/utils/syncState.ts` — `executeIfInSync` for detecting live mode
- `src/utils/getPoolTradingPair.ts` — module-level lazy state (`STATIC_POOL_DATA`)

## Resolved Questions

- **Cache scope (historical vs always-on)**: Historical sync only — clear on live mode entry
- **Eviction**: Evict immediately on terminal state
- **Cache miss**: Fall back to DB + log warning

## Open Questions

None.
