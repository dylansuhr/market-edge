-- Fix paper_bankroll VIEW: return ROI and win_rate as percentages

DROP VIEW IF EXISTS paper_bankroll CASCADE;

CREATE OR REPLACE VIEW paper_bankroll AS
SELECT
    1 as bankroll_id,
    (
        100000.00
        - COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'BUY'), 0)
        + COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'SELL'), 0)
    ) as balance,
    COALESCE((SELECT COUNT(*) FROM paper_trades WHERE status = 'CLOSED'), 0)::INTEGER as total_trades,
    COALESCE((SELECT SUM(profit_loss) FROM paper_trades WHERE status = 'CLOSED'), 0.00) as total_pnl,
    (
        (
            (
                100000.00
                - COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'BUY'), 0)
                + COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'SELL'), 0)
            ) - 100000.00
        ) / 100000.00 * 100.0
    ) as roi,
    CASE
        WHEN (SELECT COUNT(*) FROM paper_trades WHERE status = 'CLOSED') > 0
        THEN (
            COALESCE((SELECT COUNT(*) FROM paper_trades WHERE status = 'CLOSED' AND profit_loss > 0), 0)::FLOAT
            / (SELECT COUNT(*) FROM paper_trades WHERE status = 'CLOSED')::FLOAT
            * 100.0
        )
        ELSE 0.0
    END as win_rate,
    COALESCE(
        (SELECT MAX(executed_at) FROM paper_trades),
        CURRENT_TIMESTAMP
    ) as updated_at;

-- Verify
SELECT balance, total_trades, total_pnl, roi, win_rate, updated_at
FROM paper_bankroll;
