-- Migration: Convert paper_bankroll from table to dynamic view
-- This ensures balance is always calculated from paper_trades (single source of truth)
-- No more manual fixes or drift out of sync!

-- ============================================================================
-- STEP 1: Drop the existing table (backup data first if needed)
-- ============================================================================

-- Optional: Backup existing data (uncomment if you want to preserve history)
/*
CREATE TABLE IF NOT EXISTS paper_bankroll_archive AS
SELECT * FROM paper_bankroll;
*/

DROP TABLE IF EXISTS paper_bankroll CASCADE;

-- ============================================================================
-- STEP 2: Create dynamic view that calculates balance from trades
-- ============================================================================

CREATE OR REPLACE VIEW paper_bankroll AS
SELECT
    1 as bankroll_id,  -- Dummy ID for compatibility

    -- BALANCE: Starting cash - spent on BUYs + received from SELLs
    (
        10000.00
        - COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'BUY'), 0)
        + COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'SELL'), 0)
    ) as balance,

    -- TOTAL TRADES: Count of closed trades
    COALESCE((SELECT COUNT(*) FROM paper_trades WHERE status = 'CLOSED'), 0)::INTEGER as total_trades,

    -- WINNING TRADES: Count of profitable closed trades
    COALESCE((SELECT COUNT(*) FROM paper_trades WHERE status = 'CLOSED' AND profit_loss > 0), 0)::INTEGER as winning_trades,

    -- TOTAL P&L: Sum of all profit/loss
    COALESCE((SELECT SUM(profit_loss) FROM paper_trades WHERE status = 'CLOSED'), 0.00) as total_pnl,

    -- ROI: (current balance - starting balance) / starting balance
    (
        (
            10000.00
            - COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'BUY'), 0)
            + COALESCE((SELECT SUM(quantity * price) FROM paper_trades WHERE action = 'SELL'), 0)
        ) - 10000.00
    ) / 10000.00 as roi,

    -- UPDATED_AT: Most recent trade timestamp
    COALESCE(
        (SELECT MAX(executed_at) FROM paper_trades),
        CURRENT_TIMESTAMP
    ) as updated_at;

COMMENT ON VIEW paper_bankroll IS 'Dynamic view that calculates bankroll from paper_trades (single source of truth)';

-- ============================================================================
-- STEP 3: Verify the view works
-- ============================================================================

-- Test query (should return current state)
SELECT
    balance,
    total_trades,
    winning_trades,
    total_pnl,
    roi,
    updated_at
FROM paper_bankroll;

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

-- WHY THIS CHANGE:
-- 1. Single Source of Truth: paper_trades is the only source
-- 2. Always Accurate: Balance calculated from actual transactions
-- 3. No Manual Fixes: Impossible to drift out of sync (no more fix_bankroll.sql!)
-- 4. Simpler Code: No need to update balance on every trade
-- 5. Better Architecture: Follows database normalization principles

-- BREAKING CHANGES:
-- - paper_bankroll is now read-only (INSERT/UPDATE will fail)
-- - adjust_paper_bankroll_balance() and update_paper_bankroll() are obsolete
-- - Application code must remove balance update logic

-- COMPATIBILITY:
-- - SELECT queries work exactly the same (transparent replacement)
-- - Same column names and types
-- - get_paper_bankroll() function works without changes

-- PERFORMANCE:
-- - View recalculates on each query (acceptable for low-frequency queries)
-- - If performance becomes an issue, can convert to MATERIALIZED VIEW
-- - Current usage: ~10 queries/minute from dashboard (negligible overhead)

-- ROLLBACK:
-- If you need to rollback, restore the table:
/*
DROP VIEW IF EXISTS paper_bankroll;
CREATE TABLE paper_bankroll (
    bankroll_id SERIAL PRIMARY KEY,
    balance NUMERIC(12, 2) NOT NULL,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    total_pnl NUMERIC(12, 2) DEFAULT 0.0,
    roi NUMERIC(8, 4) DEFAULT 0.0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO paper_bankroll (balance, total_trades, winning_trades, total_pnl, roi)
VALUES (10000.00, 0, 0, 0.00, 0.0000);
*/
