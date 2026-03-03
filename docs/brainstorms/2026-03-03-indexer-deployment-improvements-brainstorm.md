# Brainstorm: Indexer Code & Workflow Deployment Improvements

**Date:** 2026-03-03
**Status:** Draft
**Source:** Analysis of improvement-1 through improvement-4 session transcripts

---

## Context

These improvements were discovered during a live debugging session where:
- The base-sepolia indexer was crash-looping (schema conflict on restart)
- A cryptominer (`sg_metrics`) was found installed via the self-hosted GitHub Actions runner
- Performance bottlenecks were identified and partially fixed

Several improvements have already been shipped. This document covers what remains.

---

## What's Already Done ✅

- **3-step CI/CD workflow**: build/stop → schema drop → start → index recreation → verify
- **Env tuning**: `LOG_LEVEL=warn`, `DEBUG_MODE=false`, `FINALITY_BLOCK_COUNT=2`
- **8 composite indexes** recreated automatically post-deploy via workflow
- **In-memory cache** for synthetic token lookup (`getSyntheticUnderlyingToken`) — eliminates DB queries per event
- **Parallel inserts** (`Promise.all`) in `recordLendingTransferEvents` — ~2x faster than sequential
- **Cryptominer removed**: `sg_metrics` service stopped, disabled, binary + config deleted

---

## What We're Building (Remaining Improvements)

Three areas still need attention, in priority order:

---

### 1. Index Creation Reliability

**Problem**: The workflow hardcodes `sleep 60` before creating indexes, assuming Ponder has finished initializing its schema by then. This is fragile:
- On first deploy (empty DB), schema creation is fast (~5s)
- On redeploy with many tables, it could take longer
- If schema isn't ready, `CREATE INDEX` fails silently (logged as `⚠️` but workflow continues)

**What we need:**
- A health-check loop that polls `pg_tables` or `_ponder_status` until the target tables exist, then creates indexes
- Max timeout (e.g., 5 min) with a proper failure exit code if tables never appear

---

### 3. Post-Deploy Sync Observability

**Problem**: After a deploy, there's no automated way to know:
- How fast the indexer is syncing (blocks/sec, events/sec)
- ETA to reach chain head
- When the indexer falls behind realtime
- When it crashes (without SSHing in to check `docker logs`)

**What we need:**
- A simple sync health check step in the workflow that reports initial sync speed to the run log
- Optionally: a lightweight alert (Slack webhook, email) when indexer restart count > 0 or sync falls >N blocks behind
- The `indexer_status` table already exists and tracks `latest_block_number` — this is usable without extra infra

---

### 3. Deploy Downtime / Full Resync Cost (In Scope — Mainnet Critical)

**Problem**: Every deploy:
1. Drops the Ponder schema (Ponder refuses to start if config changed without a fresh schema)
2. Rebuilds all indexed data from scratch via HyperSync
3. Takes 3–5 hours on testnet, potentially 12+ hours on mainnet

This means every code change — even a one-line fix — causes multi-hour API data staleness.

**Chosen approach: Stable schema versioning + resync speed optimization (both)**

**Stable schema versioning** — Configure Ponder to use a versioned, stable schema name (e.g., `clob_indexer_v1` instead of `ponder.schema.ts`). Only bump the version when `ponder.schema.ts` or contract addresses change. Code-only deploys (handler logic, optimizations, bug fixes) skip the schema drop entirely — deploy in seconds.

- Covers ~80% of deploys with zero resync cost
- Requires a convention: devs must know when to bump the schema version
- The workflow must check whether a schema version bump is needed and conditionally drop

**Resync speed optimization** — For the remaining ~20% (schema changes), make the resync as fast as possible:
- Maximize HyperSync parallelism (already using it; verify config)
- Warm PostgreSQL `shared_buffers` before the indexer starts heavy processing
- Create indexes `CONCURRENTLY` while syncing (already done in workflow)
- Tune Ponder concurrency settings if available

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Schema drop on every deploy | Keep as-is | Ponder requires it; HyperSync makes resync fast enough |
| Composite indexes | Recreate in workflow | Simpler than maintaining a migration system |
| Log level | `warn` permanently | Debug-level I/O was measurably slowing sync |
| Finality blocks | 2 (not 12) | Testnet; latency matters more than safety margin |
| Resync downtime | Accept for now | Testnet environment; not worth engineering around yet |

---

## Open Questions

_(none — all resolved)_

---

## Resolved Questions

- **Security hardening**: Out of scope for this improvement set — handled separately.
- **Index timeout behavior**: Fail the deploy if tables don't exist after timeout. If indexes can't be created, there's likely a startup problem worth catching early.
- **Observability format**: GitHub Actions run log only. Print sync speed, block progress, and ETA-to-chain-head in the workflow step output — no Slack webhook needed.
- **Resync approach**: Both stable schema versioning AND speed optimization. Versioning eliminates resyncs for code-only deploys; speed optimization makes schema-change resyncs as fast as possible.

---

## Scope

**In scope:**
- Workflow: smarter index creation — health-check loop polls for schema readiness, fails deploy on timeout
- Observability: sync speed + ETA printed to GitHub Actions run log post-deploy
- Stable schema versioning: versioned schema name convention + conditional schema drop in workflow
- Resync speed: audit and tune HyperSync parallelism + PG buffer warm-up

**Out of scope (YAGNI):**
- Security hardening (separate concern)
- Blue-green zero-downtime deployment
- Full observability stack (dashboards, Slack alerts)
- Ponder schema migration framework
