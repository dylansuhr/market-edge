# Capital Discipline Dashboard Plan

## Goal
Add a single place in the Next.js dashboard where we can assess cash usage, exposure, and reward health at a glance. Keep it separate from the existing overview to avoid clutter and make “Are we respecting capital limits?” obvious to operators.

## Page Placement
- Create a new route at `/capital` in the dashboard (`apps/dashboard/app/capital/page.tsx`).
- Link it from the sidebar alongside the existing Overview/Trades/Performance/Agent sections.
- Page layout: 2-column grid (metrics cards on the left, charts/tables on the right).

## Data Sources (already available)
- `trade_decisions_log` (state, action, rewards, timestamps)
- `active_positions_with_market_value` view (cost basis, market value, unrealized P&L)
- `paper_bankroll` view (cash balance)
- `price_snapshots` (for indicator freshness checks)
- `market_data_etl` job metadata (existing pipeline status API)

## Metrics to Display
### 1. **Cash & Exposure Buckets**
- Card: “Decision Mix (Today)”
- Calculation: group today’s `trade_decisions_log` by `state->>'cash_bucket'` and `state->>'exposure_bucket'`, count decisions.
- Visualization: stacked bar or grouped bar (cash buckets on X-axis, color-coded by exposure bucket).
- Warning rule: highlight if LOW cash bucket > 40% or OVEREXTENDED exposure > 20%.

### 2. **Average BUY Reward Trend**
- Line chart showing 5-run rolling average of rewards for executed BUY decisions (per timestamp).
- Data query: select executed BUYs from `trade_decisions_log` for current day, compute rolling mean server-side or in React.
- Warning rule: surface a banner if avg BUY reward < -0.10 over last hour.

### 3. **Portfolio Exposure Gauge**
- Gauge/Progress bar: `sum(cost_basis)` vs. `paper_bankroll.balance`.
- Also show market value vs. bankroll (net worth).
- Warning if cost basis ≥ 95% of bankroll, critical at ≥ 110%.

### 4. **Indicator Freshness**
- Table listing symbols missing SMA50 or RSI (less than required bar count).
- Query: check `price_snapshots` count per symbol and latest indicators in `technical_indicators`.
- Provide green check or red X per symbol.

### 5. **Pipeline Status & ETL Latency**
- Reuse existing workflow status model (or add small API route) to show last ETL/trading/settle run time.
- Color-coded badges: green < 10 minutes, amber 10–20, red > 20 minutes.

## UI Layout
```
┌─────────────────────────┬────────────────────────────┐
│ Cash/Exposure Mix Chart │ Buy Reward Trend (line)   │
├─────────────────────────┼────────────────────────────┤
│ Exposure Gauge Card     │ Indicator Freshness Table │
├─────────────────────────┴────────────────────────────┤
│ Pipeline Status Row (ETL / Trading / Settlement)     │
└──────────────────────────────────────────────────────┘
```

## Implementation Steps
1. **Routing & Shell**
   - Add `apps/dashboard/app/capital/page.tsx` with layout wrapper identical to existing pages.
   - Update navigation (sidebar component) to include “Capital Discipline”.

2. **API/Data Layer**
   - Add a service in `apps/dashboard/lib` that fetches aggregated metrics using SQL queries.
   - Optionally create a dedicated API route under `/app/api/capital/summary` to keep fetch logic server-side.

3. **Components**
   - Reuse existing card components (`SurfaceCard`, etc.).
   - Add simple chart components (using existing charting library; if none in use, prefer lightweight e.g., Recharts).
   - Build indicator table with red/green status tags.

4. **Warnings & Thresholds**
   - Implement helper functions to compute severity levels.
   - Display textual guidance (e.g., “Cash bucket skewed LOW — consider easing penalties”).

5. **Testing & Verification**
   - Unit test the aggregation functions (mock SQL responses).
   - Manual QA:
     - Reset sim and run ETL/trade once; confirm page handles “insufficient data” gracefully.
     - After the agent completes trades, verify charts reflect actual decisions/rewards.
   - Ensure page renders within acceptable time (< 1s server-side fetch).

6. **Documentation**
   - Update README and CLAUDE docs to mention new page.
   - Add quick usage note to `docs/dashboard-remediation-plan.md`.

## Future Enhancements (Optional)
- Allow timeframe selection (today, 7 days).
- Add drill-down to see raw decisions for extreme buckets.
- Integrate alerting (email/Slack) when thresholds breached.
- Persist thresholds in config so they can be adjusted without code changes.
