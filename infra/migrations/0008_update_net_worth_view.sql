-- Migration 0008: Update net_worth_summary view to use new paper_bankroll schema
--
-- PROBLEM: net_worth_summary references pb.winning_trades which no longer exists
-- after migration 0007 changed paper_bankroll VIEW schema
--
-- SOLUTION: Recreate net_worth_summary to use pb.win_rate instead
--
-- Run: psql $DATABASE_URL -f infra/migrations/0008_update_net_worth_view.sql

-- ============================================================================
-- Drop and recreate net_worth_summary VIEW
-- ============================================================================

DROP VIEW IF EXISTS net_worth_summary CASCADE;

-- Portfolio-level net worth summary (compatible with new paper_bankroll schema)
CREATE OR REPLACE VIEW net_worth_summary AS
SELECT
    100000.00::numeric AS starting_cash,
    pb.balance AS cash_balance,
    COALESCE(SUM(apm.market_value), 0) AS open_positions_market_value,
    COALESCE(SUM(apm.cost_basis), 0) AS open_positions_cost_basis,
    COALESCE(SUM(apm.unrealized_pnl), 0) AS total_unrealized_pnl,
    pb.total_pnl AS realized_pnl,
    pb.total_pnl + COALESCE(SUM(apm.unrealized_pnl), 0) AS total_pnl,
    pb.balance + COALESCE(SUM(apm.market_value), 0) AS net_worth,
    pb.roi AS realized_roi,
    CASE
        WHEN 100000.00 = 0 THEN 0
        ELSE ((pb.balance + COALESCE(SUM(apm.market_value), 0)) - 100000.00) / 100000.00 * 100.0
    END AS total_roi,
    pb.total_trades,
    -- Calculate winning_trades from win_rate for backward compatibility
    ROUND((pb.win_rate / 100.0) * pb.total_trades) AS winning_trades,
    pb.win_rate AS win_rate,
    pb.updated_at
FROM paper_bankroll pb
LEFT JOIN active_positions_with_market_value apm ON TRUE
GROUP BY
    pb.balance,
    pb.total_pnl,
    pb.roi,
    pb.total_trades,
    pb.win_rate,
    pb.updated_at;

COMMENT ON VIEW net_worth_summary IS 'Portfolio net worth summary combining cash balance and open positions market value. Updated for paper_bankroll migration 0007.';

-- ============================================================================
-- Verify the view works
-- ============================================================================

SELECT
    starting_cash,
    cash_balance,
    open_positions_market_value,
    total_unrealized_pnl,
    realized_pnl,
    total_pnl,
    net_worth,
    realized_roi,
    total_roi,
    total_trades,
    winning_trades,
    win_rate
FROM net_worth_summary
LIMIT 1;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

-- CHANGES FROM PREVIOUS VERSION (0005):
-- 1. Removed direct reference to pb.winning_trades (column no longer exists)
-- 2. Calculate winning_trades from win_rate for dashboard backward compatibility
-- 3. total_roi now multiplied by 100 to return percentage (consistent with pb.roi)
-- 4. Depends on paper_bankroll returning win_rate as percentage (migration 0007)

-- BACKWARD COMPATIBILITY:
-- - Dashboard code expecting winning_trades column will continue to work
-- - winning_trades is now calculated: ROUND((win_rate / 100) * total_trades)
-- - All ROI values are percentages (not decimals)
