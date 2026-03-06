---
title: "Indexer Performance Bottlenecks"
topic: indexer-performance
date: 2026-03-04
status: complete
---

# Indexer Performance Bottlenecks

## What We're Building

A minimal set of changes to significantly speed up historical resync time by removing two sources of unnecessary work during historical sync:

1. **Comment out `updateIndexerStatus`** across all handlers — eliminates 2 DB ops (find + update) per event
2. **Set `LOG_LEVEL=info`** in both `.env.core-chain` and `.env.base-sepolia` — eliminates constant DEBUG log construction and output during historical sync

Additionally, fix a pre-existing silent bug in `agentRouterHandler.ts` where 3 handlers pass the wrong arguments to `updateIndexerStatus`.

## Why This Approach

The clear bottleneck is block range ~38,112k–38,299k where dense order matching activity caused the sync rate to drop from ~42%/minute to ~0.1%/minute. The culprit: every `OrderPlaced`, `OrderMatched`, `UpdateOrder` event triggers:
- `updateIndexerStatus` → `db.find` + `db.update` (2 DB round-trips before handler logic)
- `logger.debug` → object allocation + console output for every sub-operation

`fetchTokenData` RPC calls were considered but `PoolCreated` is infrequent — not a meaningful bottleneck.

Approach A (minimal comment + env var) was chosen over sync-aware conditional logic or in-memory throttling because:
- No status tracking is needed during historical sync — nobody queries it then
- Simplest possible change with highest impact
- Easy to re-enable `updateIndexerStatus` later with a proper conditional approach (Approach B)

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| updateIndexerStatus | Comment out entirely | User confirmed it's not needed during historical sync; simplest fix |
| LOG_LEVEL | Set to `info` in both env files | Eliminates DEBUG log overhead; applies to both chains |
| fetchTokenData caching | Skip | PoolCreated is rare, not a meaningful bottleneck |
| agentRouterHandler bug | Fix in same PR | Already touching all updateIndexerStatus call sites |
| Approach | Minimal (A) | YAGNI — no need for complex sync detection when commenting out works |

## Scope of Changes

### Files to modify:
- `src/handlers/orderBookHandler.ts` — comment out `updateIndexerStatus` (4 call sites, highest volume)
- `src/handlers/balanceManagerHandler.ts` — comment out (6 call sites)
- `src/handlers/lendingManagerHandler.ts` — comment out (8 call sites)
- `src/handlers/tokenRegistryHandler.ts` — comment out (6 call sites)
- `src/handlers/poolManagerHandler.ts` — comment out (1 call site)
- `src/handlers/identityRegistryHandler.ts` — comment out (2 call sites)
- `src/handlers/crossChainHandler.ts` — comment out (2 call sites)
- `src/handlers/oracleHandler.ts` — comment out (1 call site)
- `src/handlers/pricePredictionHandler.ts` — comment out (6 call sites)
- `src/handlers/agentRouterHandler.ts` — comment out AND fix 3 wrong-signature call sites (lines 216, 232, 248)
- `.env.core-chain` — set `LOG_LEVEL=info`
- `.env.base-sepolia` — set `LOG_LEVEL=info`

### Files NOT modified:
- `src/utils/indexerStatus.ts` — keep the function, just stop calling it
- `src/utils/logger.ts` — no changes needed, env var controls level

## Expected Impact

- **updateIndexerStatus**: Removes 2 DB ops per event. At the dense block range (~8,000+ events/block), this eliminates thousands of DB round-trips per second.
- **LOG_LEVEL=info**: Removes `🔍 [DEBUG]` construction/output for every `findActiveOrder`, `fetchTokenData`, `updateOrderQuantity` call — visually and computationally significant.
- **Combined estimate**: 50–70% reduction in historical sync time for event-dense block ranges.

## Resolved Questions

- **Do we need status tracking during historical sync?** No — comment it out entirely for now.
- **Which env files?** Both `.env.core-chain` and `.env.base-sepolia`.
- **Fix agentRouterHandler bug?** Yes — include in same PR.
- **fetchTokenData caching?** Skip — PoolCreated is rare, not worth optimizing now.
- **Approach?** Minimal (A) — comment + env var, no conditional logic needed.

## Open Questions

None — all decisions resolved.
