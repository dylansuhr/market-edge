# Dashboard Remediation Plan

## Phase 1 – Core Data Truth (Sprint 1)

### Tasks
- [x] Create `active_positions_with_market_value` and `net_worth_summary` views (`infra/migrations/0005_market_value_views.sql`)
- [x] Update overview page to consume new views (`apps/dashboard/app/page.tsx`)
- [x] Update performance page to remove duplicate metrics and add empty-state messaging (`apps/dashboard/app/performance/page.tsx`)
- [x] Add cursor pagination + status filters to AI log API/UI (`apps/dashboard/app/api/ai-log/route.ts`, `apps/dashboard/app/ai-log/page.tsx`)

### Success Criteria
- Overview shows net worth, cash balance, open exposure, unrealized + total P&L from SQL views
- Active positions table displays mark-to-market values and unrealized P&L
- Performance page no longer repeats ROI/total trades and displays “coming soon” when metrics table empty
- AI log returns 50 decisions per request with “Load More” pagination and filters

---

## Phase 2 – Trades Pagination & Stock Detail (Sprint 2)

### Tasks
- [x] Build paginated trades API with symbol/action/date filters (`apps/dashboard/app/api/trades/route.ts`)
- [x] Create basic stock detail page (`apps/dashboard/app/stocks/[symbol]/page.tsx`)
- [x] Link all symbol references to stock detail route (overview, trades, AI log)

### Success Criteria
- Trades API supports cursor pagination and filtering
- Stock detail page lists current position, trade history, and AI decisions per symbol
- Users can navigate to `/stocks/[symbol]` from anywhere in the dashboard

---

## Phase 3 – Automation Visibility & Pipeline Status (Sprint 3)

### Tasks
- [x] Implement GitHub Actions proxy endpoint (`apps/dashboard/app/api/automation/route.ts`)
- [x] Add automation timeline page (`apps/dashboard/app/automation/page.tsx`)
- [x] Surface pipeline status card on overview (last ETL/trade/settle run)

### Success Criteria
- Automation page shows last runs grouped by workflow with status badges
- Overview “Pipeline Status” card displays timestamps/status for latest ETL, trading, settlement
- GitHub API responses cached to avoid rate limit noise; failures surface clearly in UI

---

## Future Enhancements
- Plain-language AI decision summaries (ai-log)
  - Format explanations using technical state deltas (RSI, SMA, VWAP) in human language
  - Surface short explanation beneath reasoning on AI log and stock detail
  - Provide quick links to glossary (optional, phase after initial rollout)
- CSV exports for trades and AI decisions
  - Extend `/api/trades` and `/api/ai-log` with export endpoints recycling cursor/filter logic
  - Add date-range selectors and “Download CSV” buttons once pagination stable
- Daily performance metrics pipeline + charts
  - Implement `ops/scripts/calculate_daily_metrics.py` to populate `performance_metrics`
  - Trigger post-settlement (4:10 PM ET) via automation
  - Re-enable performance page charts/tables once data collected
- Price charts on stock detail page
  - Integrate lightweight line chart (e.g., using the latest 30 days) fed from `price_snapshots`
  - Overlay trade markers (BUY/SELL) for visual context
- Shared infinite-scroll component
  - Extract load-more logic into reusable component once used in ≥3 places
  - Improve accessibility (loading indicators, disabled states)

---

_Last updated: 18 Oct 2025_
