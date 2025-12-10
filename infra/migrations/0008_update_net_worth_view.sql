-- Update net_worth_summary to use new paper_bankroll schema (win_rate instead of winning_trades)

DROP VIEW IF EXISTS net_worth_summary CASCADE;

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

-- Verify
SELECT net_worth, total_roi, win_rate FROM net_worth_summary LIMIT 1;
