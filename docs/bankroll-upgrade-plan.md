# Bankroll Upgrade Plan (10K → 100K)

## Goals
- Increase simulated bankroll from $10,000 to $100,000 so the agent can take more concurrent trades without cash constraints.
- Enrich agent inputs with bankroll awareness (cash/inventory state features) to encourage capital management learning.
- Revisit reward structure to balance exploration with disciplined trade sizing under the larger bankroll.
- Keep existing ticker universe (10 symbols), 5-minute cadence, and market-hours trading window; treat faster polling or additional symbols as future enhancements.

## Phase 0 – Preparation *(Owner: You)*
1. **Confirm acceptance criteria**
   - Bankroll view (`paper_bankroll`) shows $100,000 starting balance.
   - No residual trades/decision logs remain from prior sessions.
   - Agent state includes cash/position context.
   - Reward function reflects cash usage with the larger bankroll.
2. **Schedule downtime** (optional) so the nightly cron jobs don’t run mid-migration; pause GitHub Actions if needed.

## Phase 1 – Configuration Baseline *(Owner: Codex)*
1. Update `.env.example`, `README.md`, `CLAUDE.md`, and documentation to reference the new default bankroll.
2. Modify `.env` locally:
   - `STARTING_CASH=100000.00`
   - `MAX_POSITION_SIZE=25` to allow larger position sizing with the bigger bankroll (≈$13K max per symbol at $520/share).
3. Ensure scheduled workflows don’t hardcode the old amount (they shouldn’t, but confirm).

## Phase 2 – Database & Reset *(Joint)*
1. Codex: verify schema still depends on `STARTING_CASH` only via calculated views (should read starting cash from `paper_trades` logic). Document if any SQL assumes 10k.
2. You: truncate runtime tables once code is ready (`price_snapshots`, `technical_indicators`, `paper_trades`, `trade_decisions_log`, `performance_metrics`, `rl_model_states`) to start fresh.
3. Run ETL seed and one trading pass to populate baseline data after modifications.

## Phase 3 – Agent State Enhancements *(Owner: Codex)*
1. Review `packages/models/models/state.py` to confirm current discretization (RSI, SMA delta, VWAP delta, position, momentum).
2. Add **cash bucket** feature:
   - Compute available cash ratio (`cash / starting_cash`) and bucket into e.g., `HIGH (≥70%) / MEDIUM (30–70%) / LOW (<30%)`.
   - Update `State` enum definitions and `get_current_state` to include new dimension.
3. Add **position exposure bucket** (optional but recommended) to capture total invested capital relative to bankroll; define discrete levels (NONE / LIGHT / HEAVY).
4. Update Q-table size documentation (state space grows by factor of new buckets) and ensure persistence handles new states.

## Phase 4 – Reward Function Review *(Owner: Codex)*
1. Inspect `calculate_reward` in `ops/scripts/rl_trading_agent.py`.
2. Adjust BUY penalty so it scales with exposure; options:
   - Multiply penalty by fraction of bankroll committed.
   - Add penalty when cash bucket drops to LOW to deter over-allocation.
3. Verify SELL reward still uses realized P&L; ensure it’s insensitive to bankroll scaling (may normalize by trade cost if needed).
4. Document the new reward rationale in code comments and `docs/` (e.g., `CLAUDE.md`).

## Phase 5 – Testing & Validation *(Joint)*
1. **Unit-level checks** (Codex)
   - Run agent decision function with mock cash levels to confirm state encoding.
   - Validate reward outputs for BUY/SELL/HOLD across cash buckets.
2. **Integration checks** (You)
   - `python3 ops/scripts/market_data_etl.py --force` to seed data.
   - `python3 ops/scripts/rl_trading_agent.py --force` (optional flag) to ensure the agent trades without crashes under new state space.
   - `python3 ops/scripts/settle_trades.py --force` after market hours to confirm bankroll view updates correctly.
3. Monitor GitHub Actions for at least one trading session; ensure no unexpected 429s, state serialization errors, or cash bucket misalignments.

## Phase 6 – Documentation & Follow-up *(Joint)*
1. Codex: update `docs/alpaca-market-data-integration-plan.md` (or add a new section) noting the bankroll upgrade and rationale.
2. You: record the reset date and bankroll shift in ops notes or CHANGELOG for traceability.
3. Review backlog items for future iterations:
   - Expand ticker list once the agent handles larger exposure.
   - Explore 1-minute cadence once rate-limit comfort is proven.

## Out-of-Scope / Deferred
- Changing symbol universe or polling frequency.
- Introducing leverage or shorting beyond current rules.
- Offline backtesting or historical replay pipelines.

## Questions to Clarify (if needed)
- Desired `MAX_POSITION_SIZE` with $100K bankroll?
- Should cash buckets be symmetric (3 levels) or more granular?
- Any compliance/logging requirements when bankroll changes?
*(Assume defaults above if no further guidance.)*
