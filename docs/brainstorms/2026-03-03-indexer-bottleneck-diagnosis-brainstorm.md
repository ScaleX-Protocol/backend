---
title: "Indexer Bottleneck Diagnosis"
topic: indexer-performance-bottleneck
date: 2026-03-03
status: active
---

# Indexer Bottleneck Diagnosis

## What We're Building

A **one-time live diagnosis** of the base-sepolia indexer's historical sync bottleneck using existing observability endpoints — no code changes required. We query Ponder's Prometheus metrics, PostgreSQL's built-in stats views, and Docker resource usage to identify which pipeline stage is the limiting factor.

## The Pipeline We're Profiling

```
Chain (Base Sepolia)
  └─ [HyperSync / RPC fetch] → block batches (BATCH_SIZE=500)
       └─ [Ponder framework] → event dispatch
            └─ [TypeScript handlers] → DB writes + Redis lookups
                 └─ [PostgreSQL] → 49 tables, 9 indexes
```

**Three bottleneck candidates:**
1. **RPC/HyperSync** — waiting for block data (network I/O bound)
2. **PostgreSQL writes** — insert/upsert throughput under index maintenance pressure
3. **Handler processing** — TypeScript logic, Redis round-trips, business calculations

## Why This Approach

**Live metrics snapshot** (no code changes) wins because:
- Ponder 0.9.14 already exposes Prometheus metrics at port 9090 (`ENABLE_METRICS=true`, `METRICS_PORT=9090`)
- PostgreSQL `pg_stat_user_tables`, `pg_stat_bgwriter`, `pg_stat_statements` reveal write patterns in real time
- `docker stats` shows CPU/memory split between indexer (Node.js) and postgres containers
- Results in ~5 minutes, actionable immediately

## Key Decisions

- **Scope**: Historical sync only (not live indexing) — most critical for resync recovery time
- **Method**: Read-only queries against running system, two snapshots 60s apart for rate calculation
- **Output**: Simple table ranking the 3 bottleneck candidates by time share

## Diagnosis Plan

### Signal 1 — Ponder Prometheus (port 9090)
```
ponder_historical_rpc_request_duration_ms_*  → RPC wait time distribution
ponder_postgres_query_duration_ms_*           → DB write time distribution
ponder_indexing_function_duration_ms_*        → handler execution time
ponder_sync_block_*                           → blocks/sec rate
```

### Signal 2 — PostgreSQL Stats
```sql
-- Buffer cache hit ratio (low = disk-bound writes)
SELECT * FROM pg_stat_bgwriter;

-- Tables with most sequential scans (missing index on write path)
SELECT relname, seq_scan, n_tup_ins, n_tup_upd FROM pg_stat_user_tables
WHERE schemaname = 'ponder.schema.v1.ts' ORDER BY n_tup_ins DESC LIMIT 10;

-- Slowest queries (requires pg_stat_statements)
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;
```

### Signal 3 — Docker Resource Utilization
```bash
docker stats base-sepolia-clob-indexer postgres-database --no-stream
```
- If indexer CPU > 80%: handler/JS processing is the bottleneck
- If postgres CPU > 80%: DB write throughput is the bottleneck
- If both low: RPC/network wait is the bottleneck

## Expected Findings (Hypothesis)

Based on session transcripts (improvement-4.txt and improvement-5.txt):
- **Sync speed was 27.8x realtime** in dense blocks after shared_buffers tuning
- PG buffer warm-up was observed as a bottleneck early in resync
- RPC is likely NOT the bottleneck (HyperSync delivers data much faster than on-chain rate)
- **Hypothesis: DB writes are the primary bottleneck** — 49 tables, 9 composite indexes, high insert volume in orderBookHandler (trades, candlestick buckets) per matched event

## Resolved Questions

- **Phase**: Historical sync (not live) ✅
- **Method**: Live metrics snapshot, no code changes ✅
- **Goal**: Diagnose right now, not build permanent tooling ✅

## Open Questions

None — ready to execute.

## References

- Ponder metrics config: `ponder/.env.base-sepolia` → `ENABLE_METRICS=true`, `METRICS_PORT=9090`
- PostgreSQL tuning applied: `shared_buffers=1920MB`, `work_mem=32MB`, `wal_buffers=64MB`
- Handler list: 11 handlers in `ponder/src/handlers/` — orderBookHandler likely heaviest (trades + 5 OHLCV buckets per match)
- Previous sync speed data: `docs/plans/improvement-4.txt` (~27.8x realtime in dense blocks)
