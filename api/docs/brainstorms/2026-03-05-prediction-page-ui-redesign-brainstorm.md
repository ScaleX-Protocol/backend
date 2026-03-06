---
topic: Prediction Page UI Redesign
date: 2026-03-05
status: decided
approach: Polymarket-inspired Clean Redesign
---

# Prediction Page UI Redesign

## What We're Building

A full redesign of the prediction markets page (`/predictions`) following Polymarket-inspired clean aesthetics. The current page has basic market cards, a narrow detail panel, and a raw activity feed. We're upgrading every visual element while keeping the side-panel layout.

**Key deliverables:**
- Richer market cards with token display, live countdown badges, cleaner UP/DOWN bars
- Enhanced detail panel: donut/ring chart for pool distribution, animated countdown timer, inline predict action (UP/DOWN + amount + submit)
- Polished activity feed with agent badges and proper event type handling
- Component decomposition (current 653-line monolith into separate files)
- Consistent styling with rest of ScaleX app (filter pills, card headers, error states)

## Why This Approach

- **Polymarket reference**: Clean, minimal, card-based with clear percentage indicators — proven UX for prediction markets
- **Side panel layout preserved**: User prefers the current grid layout (market list + detail sidebar), just needs richer content
- **Inline predict action**: Reduces friction — users can predict directly from the detail panel without a modal
- **Component decomposition**: Current 653-line file is the only undecomposed feature page; splitting it matches lending/agents patterns

## Key Decisions

1. **Layout**: Keep `grid [1fr, 380px]` side-panel layout (widened from 320px for predict action)
2. **Detail panel style**: Polymarket-inspired — clean white-on-dark, clear hierarchy, inline action
3. **Pool visualization**: Donut/ring chart (CSS-only, no chart library) showing UP vs DOWN distribution
4. **Countdown timer**: Animated countdown with urgency colors (green > 1h, yellow > 10m, red < 10m)
5. **Predict action**: Inline UP/DOWN toggle buttons + amount input + submit in detail panel
6. **Market cards**: Show token pair, market type badge, UP/DOWN gradient bar, pool size, countdown badge
7. **Filter pills**: Adopt leaderboard style (`bg-[#F06718]/10 text-[#F06718]` active) instead of solid orange
8. **Activity feed**: Handle all event types (Predicted, Claimed, MarketCreated, MarketSettled), show agent badges
9. **Error states**: Add proper error handling from hooks (currently missing entirely)
10. **File structure**: Split into `MarketCard.tsx`, `MarketDetail.tsx`, `MarketEventsSection.tsx`, `PositionsTable.tsx`, `PredictForm.tsx`, `PoolChart.tsx`, `CountdownTimer.tsx`

## Resolved Questions

1. **Should we add a dedicated market page route (`/predictions/:id`)?** No — keep single page with side panel. Simpler, and the detail panel provides enough space.
2. **Chart library for donut chart?** No library — CSS-only conic-gradient ring chart. Keeps bundle small.
3. **Should positions table get the `TableStateWrapper` treatment?** Yes — adopt the shared component for consistent loading/error/empty states.
