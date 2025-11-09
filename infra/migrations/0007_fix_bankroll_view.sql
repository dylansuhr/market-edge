-- Migration 0007: Fix paper_bankroll VIEW to return correct ROI and win_rate
--
-- PROBLEM: Current VIEW returns ROI as decimal (-0.0041) which application multiplies by 100
--          resulting in displayed value of -415% instead of -0.41%
--          Also, win_rate column is missing, causing incorrect display
--
-- SOLUTION: Return ROI and win_rate as percentages (multiply by 100 in VIEW)
--           Add explicit win_rate column
--
-- Run: psql $DATABASE_URL -f infra/migrations/0007_fix_bankroll_view.sql

-- ============================================================================
-- Drop and recreate paper_bankroll VIEW with correct calculations
-- ============================================================================

DROP VIEW IF EXISTS paper_bankroll CASCADE;

CREATE OR REPLACE VIEW paper_bankroll AS
SELECT
    1 as bankroll_id,  -- Dummy ID for compatibility

    -- BALANCE: Starting cash - spent on BUYs + received from SELLs
    (
        100000.00
        - COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'BUY'), 0)
        + COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'SELL'), 0)
    ) as balance,

    -- TOTAL TRADES: Count of closed trades
    COALESCE((SELECT COUNT(*) FROM paper_trades WHERE status = 'CLOSED'), 0)::INTEGER as total_trades,

    -- TOTAL P&L: Sum of all profit/loss
    COALESCE((SELECT SUM(profit_loss) FROM paper_trades WHERE status = 'CLOSED'), 0.00) as total_pnl,

    -- ROI: Return as PERCENTAGE (not decimal)
    -- (current balance - starting balance) / starting balance * 100
    (
        (
            (
                100000.00
                - COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'BUY'), 0)
                + COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'SELL'), 0)
            ) - 100000.00
        ) / 100000.00 * 100.0
    ) as roi,

    -- WIN RATE: Return as PERCENTAGE
    -- (winning trades / total closed trades) * 100
    CASE
        WHEN (SELECT COUNT(*) FROM paper_trades WHERE status = 'CLOSED') > 0
        THEN (
            COALESCE((SELECT COUNT(*) FROM paper_trades WHERE status = 'CLOSED' AND profit_loss > 0), 0)::FLOAT
            / (SELECT COUNT(*) FROM paper_trades WHERE status = 'CLOSED')::FLOAT
            * 100.0
        )
        ELSE 0.0
    END as win_rate,

    -- UPDATED_AT: Most recent trade timestamp
    COALESCE(
        (SELECT MAX(executed_at) FROM paper_trades),
        CURRENT_TIMESTAMP
    ) as updated_at;

COMMENT ON VIEW paper_bankroll IS 'Dynamic view that calculates bankroll from paper_trades (single source of truth). ROI and win_rate returned as percentages.';

-- ============================================================================
-- Verify the fix
-- ============================================================================

SELECT
    balance,
    total_trades,
    total_pnl,
    roi,
    win_rate,
    updated_at
FROM paper_bankroll;

-- Expected output with current data:
-- balance: $99,585.25
-- total_trades: 2503
-- total_pnl: -$415.12
-- roi: -0.41  (NOT -415.12!)
-- win_rate: 13.54 (NOT negative!)
-- updated_at: 2025-11-07 21:21:00

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

-- CHANGES FROM PREVIOUS VERSION (0002):
-- 1. ROI now multiplied by 100.0 to return percentage directly
-- 2. Added explicit win_rate column (was missing before)
-- 3. Both ROI and win_rate are percentages (no need for app to multiply by 100)

-- BREAKING CHANGES:
-- - Application code that multiplies ROI by 100 will now show incorrect values
-- - Need to update get_paper_bankroll() to NOT multiply ROI/win_rate

-- COMPATIBILITY:
-- - Column order changed: (balance, total_trades, total_pnl, roi, win_rate, updated_at)
-- - Previous: (balance, total_trades, winning_trades, total_pnl, roi, updated_at)
-- - Removed: winning_trades column (not useful, can calculate from win_rate)
-- - Added: win_rate column (percentage)
