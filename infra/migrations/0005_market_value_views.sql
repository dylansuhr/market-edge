-- Migration: Market Value & Net Worth Views
-- Purpose:
--   1. Provide mark-to-market valuations for active positions
--   2. Expose portfolio net worth (cash + open positions) in a single view
-- Date: 2025-10-18

-- Active positions with latest market pricing
CREATE OR REPLACE VIEW active_positions_with_market_value AS
SELECT
    ap.stock_id,
    ap.symbol,
    ap.quantity,
    ap.avg_entry_price,
    COALESCE(ps.close, ap.avg_entry_price) AS current_price,
    ps.timestamp AS price_timestamp,
    ap.quantity * ap.avg_entry_price AS cost_basis,
    ap.quantity * COALESCE(ps.close, ap.avg_entry_price) AS market_value,
    (COALESCE(ps.close, ap.avg_entry_price) - ap.avg_entry_price) * ap.quantity AS unrealized_pnl,
    CASE
        WHEN ap.avg_entry_price = 0 THEN 0
        ELSE ((COALESCE(ps.close, ap.avg_entry_price) - ap.avg_entry_price) / ap.avg_entry_price) * 100
    END AS unrealized_pnl_pct
FROM active_positions ap
LEFT JOIN LATERAL (
    SELECT close, timestamp
    FROM price_snapshots
    WHERE stock_id = ap.stock_id
    ORDER BY timestamp DESC
    LIMIT 1
) ps ON TRUE
WHERE ap.quantity > 0;

-- Portfolio-level net worth summary
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
        ELSE ((pb.balance + COALESCE(SUM(apm.market_value), 0)) - 100000.00) / 100000.00
    END AS total_roi,
    pb.total_trades,
    pb.winning_trades,
    CASE
        WHEN pb.total_trades > 0 THEN (pb.winning_trades::numeric / pb.total_trades)
        ELSE 0
    END AS win_rate,
    pb.updated_at
FROM paper_bankroll pb
LEFT JOIN active_positions_with_market_value apm ON TRUE
GROUP BY
    pb.balance,
    pb.total_pnl,
    pb.roi,
    pb.total_trades,
    pb.winning_trades,
    pb.updated_at;
