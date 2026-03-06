---
title: "feat: Prediction Page UI Redesign"
type: feat
status: active
date: 2026-03-05
brainstorm: docs/brainstorms/2026-03-05-prediction-page-ui-redesign-brainstorm.md
---

# feat: Prediction Page UI Redesign

## Overview

Full redesign of the `/predictions` page with Polymarket-inspired clean aesthetics. Decompose the 653-line monolith into 7+ components, add pool donut chart, animated countdown, inline predict form, richer market cards with token icons, and consistent styling with the rest of ScaleX.

## Problem Statement / Motivation

The current prediction page is functional but visually basic:
- **Token display**: Shows raw contract addresses (`0xb1ad...58f7`) instead of token symbols/icons
- **No predict action**: Users can't predict from the UI — no form exists
- **Monolithic file**: 653 lines in one file, every other feature page is decomposed
- **Missing states**: No error handling, no wallet-disconnected states
- **Inconsistent styling**: Filter pills, card headers, and stat cards don't match lending/agents patterns
- **No pool visualization**: Plain text percentages instead of visual chart
- **No countdown**: Static "Ended" text instead of live countdown timer

## Proposed Solution

Polymarket-inspired clean redesign keeping the side-panel layout (`grid [1fr, 380px]`), with:

1. **Component decomposition** into separate files
2. **Token resolution** via hardcoded address-to-symbol map (matches known deployed tokens)
3. **CSS-only donut chart** for pool UP/DOWN distribution
4. **Animated countdown timer** with urgency colors
5. **Inline predict form** in detail panel (UP/DOWN toggle + amount + submit)
6. **Status-aware rendering** per component per market status
7. **Error/loading/empty states** using `TableStateWrapper` pattern
8. **Wallet-disconnected states** showing "Connect Wallet" prompts

## Technical Considerations

### Token Resolution
`baseToken` is a raw address. Create a `TOKEN_MAP` in `predictions/utils/tokens.ts` mapping known addresses to `{ symbol, decimals, icon }`. Use the existing `TokenIcon` component from `components/common/TokenIcon.tsx`. Collateral is IDRX (6 decimals) based on current on-chain data.

### Market Status Behavior Matrix

| Component | Open | SettlementRequested | Settled | Cancelled |
|---|---|---|---|---|
| CountdownTimer | Live countdown | "Settling..." | "Settled" | "Cancelled" |
| PredictForm | Active | Disabled | Hidden, show outcome | Hidden |
| MarketCard badge | Green | Yellow | Blue + outcome | Red |
| PoolChart | Live totals | Frozen | Final + outcome highlight | Show pool |
| Claim button | N/A | N/A | Visible if won | Visible (refund) |

### Predict Transaction Flow
1. User selects UP or DOWN toggle
2. Enters amount in IDRX input (validate: min stake, max balance, numeric)
3. Clicks "Predict" button
4. Button shows spinner + "Confirm in wallet..."
5. After wallet confirm: "Pending..." with spinner
6. On success: toast notification, invalidate queries, reset form
7. On failure: toast with error, re-enable form
8. On user reject: reset button state silently

### Wallet Disconnected States
- Market list + detail panel: Fully browsable (read-only)
- PredictForm: Show disabled with "Connect Wallet" button
- PositionsTable: Show "Connect wallet to view positions"
- Activity feed: Visible (public data)

### Mobile Layout
- Breakpoint: `lg` (1024px) — below this, switch to tab layout
- Tabs: Markets | Detail | Positions
- Detail tab shows full detail panel + predict form vertically stacked
- PoolChart renders at smaller size on mobile

## Implementation Plan

### Phase 1: Foundation — Component Decomposition + Utils

Extract components from the monolith into separate files. No visual changes yet — just structural refactoring to enable Phase 2.

**Files to create:**

#### `predictions/utils/tokens.ts`
```typescript
// Address-to-token mapping for known prediction market tokens
export const TOKEN_MAP: Record<string, { symbol: string; decimals: number }> = {
  '0xb1adfcdbfa28e8aa898acfdc8ac8d59d37fb58f7': { symbol: 'sxWETH', decimals: 18 },
  // Add other known tokens
};
export const COLLATERAL_DECIMALS = 6; // IDRX
export function resolveToken(address: string) { ... }
export function formatAmount(raw: string, decimals?: number) { ... }
export function formatTimeLeft(endTime: number) { ... }
export function shortenAddress(address: string) { ... }
```

#### `predictions/components/MarketCard.tsx`
Extract existing `MarketCard` component. Props: `{ market: PredictionMarket; isSelected: boolean; onClick: () => void }`.

#### `predictions/components/MarketDetail.tsx`
Extract existing `MarketDetail`. Props: `{ market: PredictionMarket }`.

#### `predictions/components/MarketEventsSection.tsx`
Extract existing `MarketEventsSection`. Props: `{ marketId: string }`.

#### `predictions/components/PositionsTable.tsx`
Extract existing `PositionsTable`. Props: `{ positions: PredictionPosition[]; markets: PredictionMarket[]; isLoading: boolean; error: Error | null }`.

#### `predictions/components/StatusFilter.tsx`
Extract existing `StatusFilter`. Props: `{ value: MarketStatus | undefined; onChange: (v: MarketStatus | undefined) => void }`.

#### `predictions/components/PredictionsContent.tsx`
Main orchestrator (was inline in `predictions.tsx`). The default export in `predictions.tsx` just renders `<PredictionsContent />`.

- [x] Create `predictions/utils/tokens.ts` with `TOKEN_MAP`, `resolveToken`, `formatAmount`, `formatTimeLeft`, `shortenAddress`
- [x] Extract `MarketCard.tsx` — no visual changes
- [x] Extract `MarketDetail.tsx` — no visual changes
- [x] Extract `MarketEventsSection.tsx` — no visual changes
- [x] Extract `PositionsTable.tsx` — no visual changes
- [x] Extract `StatusFilter.tsx` — no visual changes
- [x] Slim down `predictions.tsx` to just import `PredictionsContent`
- [x] Verify page still renders identically after extraction

### Phase 2: New Components — PoolChart, CountdownTimer, PredictForm

Create the three new components that don't exist yet.

#### `predictions/components/PoolChart.tsx`
CSS-only donut chart using `conic-gradient`. Props: `{ upPct: number; downPct: number; size?: number }`.
- Ring chart with UP (green `#4CAF50`) and DOWN (red `#F44336`) segments
- Center text showing dominant side percentage
- Minimum 5% visual width for minority side
- Empty pool (0/0) shows gray ring with "No stakes"

```tsx
// Core CSS approach:
// background: conic-gradient(#4CAF50 0% ${upPct}%, #F44336 ${upPct}% 100%);
// Inner circle overlay creates the donut hole
```

#### `predictions/components/CountdownTimer.tsx`
Live countdown timer. Props: `{ endTime: number; status: MarketStatus }`.
- Updates every second via `useEffect` + `setInterval`
- Colors: green (`> 1h`), yellow (`> 10m`), red (`< 10m`), gray (ended)
- Shows "Ended" when countdown reaches 0 (doesn't go negative)
- Shows "Settling..." for `SettlementRequested` status
- Shows "Settled" / "Cancelled" for terminal statuses
- Displays `Xd Xh Xm Xs` format, dropping zero leading segments

#### `predictions/components/PredictForm.tsx`
Inline prediction form. Props: `{ market: PredictionMarket; onSuccess?: () => void }`.
- UP/DOWN toggle buttons (green/red, highlighted when selected)
- For Absolute markets: labels change to "Above/Below"
- Amount input with IDRX suffix and max button
- Submit button with transaction state handling
- Disabled with "Connect Wallet" when no wallet
- Disabled with "Market expired" when `endTime` passed
- Disabled when status !== Open

- [x] Create `PoolChart.tsx` — CSS-only donut with conic-gradient
- [x] Create `CountdownTimer.tsx` — live countdown with urgency colors
- [x] Create `PredictForm.tsx` — UP/DOWN toggle + amount input + submit
- [ ] Add `usePredictTransaction` hook for contract interaction (optional — can inline in PredictForm)

### Phase 3: Visual Redesign — MarketCard

Redesign `MarketCard` with Polymarket-inspired clean aesthetics.

**Before:** Raw address `0xb1ad...58f7 / IDRX`, basic progress bar, plain text stats
**After:** Token icon + symbol pair, gradient UP/DOWN bar with percentage labels, countdown badge, pool size

```
┌─────────────────────────────────────────────┐
│ [ETH icon] sxWETH / IDRX    Above/Below    │
│                                   [Open]    │
│                                             │
│ ██████████░░░░░░░░░░░░░░░░░░░░░░           │
│ UP 35%                      DOWN 65%        │
│                                             │
│ Pool: 1,250.00 IDRX          ⏱ 2h 15m     │
└─────────────────────────────────────────────┘
```

- [x] Add `TokenIcon` from `components/common/TokenIcon.tsx` showing base token
- [x] Replace `shortenAddress(market.baseToken)` with `resolveToken(market.baseToken).symbol`
- [x] Redesign UP/DOWN bar with gradient colors and percentage labels on both sides
- [x] Add `CountdownTimer` badge in bottom-right
- [x] Style status badge: Open=green, Settling=yellow, Settled=blue, Cancelled=red
- [x] Add settled outcome indicator (checkmark on winning side)
- [x] Hover state: `border-[#333333]` transition, subtle lift

### Phase 4: Visual Redesign — MarketDetail Panel

Redesign the detail panel (right side, widened to 380px).

```
┌─── Market Detail ────────────────────┐
│ [ETH] sxWETH / IDRX       [Open]    │
│ Above / Below · Market #3            │
├──────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐             │
│ │Total Pool│ │  Ends   │             │
│ │1,250 IDRX│ │ 2h 15m  │             │
│ └─────────┘ └─────────┘             │
│                                      │
│     ┌──────────────┐                 │
│     │  [Donut]     │                 │
│     │  35% UP      │                 │
│     │  65% DOWN    │                 │
│     └──────────────┘                 │
│                                      │
│ Opening TWAP     19,434,826,460      │
│ Strike Price     19,434,826,460      │
├──────────────────────────────────────┤
│ ┌─── Predict ───────────────────┐    │
│ │ [  UP  ] [  DOWN  ]          │    │
│ │ Amount: [________] IDRX      │    │
│ │ [    Predict UP    ]         │    │
│ └──────────────────────────────┘    │
├──────────────────────────────────────┤
│ Recent Activity                      │
│ UP   0x27dD...7cB7   10.00 IDRX    │
│ DOWN 0x1234...5678    5.00 IDRX    │
│                        Agent #1414  │
└──────────────────────────────────────┘
```

- [x] Widen detail panel from 320px to 380px
- [x] Add card header with token icon + pair name + status badge
- [x] 2x1 stats grid: Total Pool, Countdown Timer (using `CountdownTimer` component)
- [x] Add `PoolChart` donut with UP/DOWN percentages
- [x] Add TWAP/Strike Price key-value rows with dividers
- [x] Integrate `PredictForm` below stats
- [x] Integrate `MarketEventsSection` at bottom
- [x] Style card wrapper: `bg-[#0C0C0C] rounded-[24px] border border-[#1F1F1F]`
- [x] Style card header: `p-5 border-b border-[#1F1F1F]` matching lending pattern
- [x] "Select a market" placeholder with icon when no market selected

### Phase 5: Visual Redesign — StatusFilter, PositionsTable, Events

Polish remaining components for consistency.

**StatusFilter:**
- [x] Adopt leaderboard filter pill style: active = `bg-[#F06718]/10 text-[#F06718] border border-[#F06718]/20`, inactive = `text-[#808080] hover:bg-[#1A1A1A]`

**PositionsTable:**
- [x] Wrap with `TableStateWrapper` for loading/error/empty states
- [ ] Add Claim button per position (for Settled markets where user won)
- [ ] Show "Connect wallet to view positions" when disconnected
- [x] Show market outcome badge (Won/Lost) on settled positions
- [x] Format amounts with proper decimals

**MarketEventsSection:**
- [x] Handle all 6 event types: MarketCreated, Predicted, SettlementRequested, MarketSettled, Claimed, MarketCancelled
- [x] Color-code: Predicted UP = green, Predicted DOWN = red, Claimed = orange, MarketCreated = gray, SettlementRequested = yellow, MarketSettled = blue, MarketCancelled = red
- [x] Agent badges: link to `/agents/:id` with bot icon (existing implementation)
- [x] Add proper loading skeleton

### Phase 6: Error States + Polish

- [ ] Add error boundary for the entire predictions page
- [x] Handle `usePredictionMarkets` error state: show error banner with retry button
- [x] Handle `useUserPositions` error state in PositionsTable
- [x] Handle `usePredictionEvents` error state in MarketEventsSection
- [x] Add empty state for market list: "No markets found" with appropriate icon
- [ ] Add Framer Motion transitions for market selection (detail panel slide-in)
- [x] Ensure all card backgrounds, borders, and radii match design system tokens

## File Structure After Redesign

```
features/predictions/
├── components/
│   ├── predictions.tsx          # Default export, renders PredictionsContent
│   ├── PredictionsContent.tsx   # Main orchestrator with layout
│   ├── MarketCard.tsx           # Individual market card
│   ├── MarketDetail.tsx         # Detail panel (stats + chart + form + events)
│   ├── MarketEventsSection.tsx  # Activity feed with agent badges
│   ├── PositionsTable.tsx       # User positions with claim actions
│   ├── StatusFilter.tsx         # Market status filter pills
│   ├── PredictForm.tsx          # Inline UP/DOWN predict form
│   ├── PoolChart.tsx            # CSS donut chart
│   └── CountdownTimer.tsx       # Live countdown with urgency colors
├── hooks/
│   ├── usePredictionMarkets.ts  # Existing
│   ├── useUserPositions.ts      # Existing
│   └── usePredictionEvents.ts   # Existing
├── types/
│   └── prediction.types.ts      # Existing
└── utils/
    └── tokens.ts                # Token resolution, formatting utils
```

## Acceptance Criteria

- [ ] Page loads with market list showing token icons and symbols (not raw addresses)
- [ ] Clicking a market shows rich detail panel with donut chart, countdown, and predict form
- [ ] CountdownTimer counts down live with color changes at 1h/10m thresholds
- [ ] Pool donut chart shows correct UP/DOWN distribution, handles 0/0 and 100/0 edge cases
- [ ] PredictForm allows UP/DOWN selection, amount input, and shows "Connect Wallet" when disconnected
- [ ] PredictForm disabled for non-Open markets with appropriate message
- [ ] StatusFilter uses leaderboard pill style (orange/10 active state)
- [ ] PositionsTable shows loading/error/empty states via TableStateWrapper
- [ ] Activity feed handles all 6 event types with distinct styling
- [ ] Agent badges link to `/agents/:agentTokenId`
- [ ] Error states displayed for all three data hooks
- [ ] Mobile layout switches to tabs at `lg` breakpoint
- [ ] All card headers, backgrounds, borders match lending/agents design system
- [ ] No 653-line monolith — all components in separate files

## Dependencies & Risks

- **Token address mapping**: Must be hardcoded for now. If new tokens are added to prediction markets, the map needs updating. Consider querying the currencies API for dynamic resolution in a future iteration.
- **Contract interaction for PredictForm**: Needs `predict(marketId, predictUp, amount)` and `claim(marketId)` contract calls. If the contract ABI/address isn't available in the frontend config, the predict form will be display-only initially.
- **PredictForm may be display-only in Phase 2**: If contract interaction isn't wired up, the form renders but submit is disabled. This is acceptable for a visual redesign — wiring can follow.

## References

- **Brainstorm**: `docs/brainstorms/2026-03-05-prediction-page-ui-redesign-brainstorm.md`
- **Lending page pattern**: `/Users/renaka/gtx/frontend/apps/web/src/features/lending/components/lending.tsx`
- **Agent detail pattern**: `/Users/renaka/gtx/frontend/apps/web/src/features/agents/components/AgentDetail.tsx`
- **TableStateWrapper**: `/Users/renaka/gtx/frontend/apps/web/src/features/overview/components/tables/TableStateWrapper.tsx`
- **TokenIcon**: `/Users/renaka/gtx/frontend/apps/web/src/components/common/TokenIcon.tsx`
- **Token config**: `/Users/renaka/gtx/frontend/apps/web/src/configs/tokens.ts`
- **Leaderboard filter pills**: `/Users/renaka/gtx/frontend/apps/web/src/features/leaderboard/components/LeaderboardTable.tsx`
- **Current predictions monolith**: `/Users/renaka/gtx/frontend/apps/web/src/features/predictions/components/predictions.tsx`
- **Polymarket**: https://polymarket.com (visual reference)
