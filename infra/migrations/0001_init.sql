-- Market-Edge Database Schema
-- PostgreSQL 15+
--
-- This schema supports:
-- - Real-time stock price tracking
-- - Technical indicator storage
-- - Paper trading (mock trades)
-- - RL agent Q-table persistence
-- - Performance metrics

-- Enable UUID extension (optional, for future use)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- STOCKS TABLE
-- ============================================================================
-- Stores stock metadata (ticker, company name, etc.)

CREATE TABLE IF NOT EXISTS stocks (
    stock_id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,      -- Stock ticker (e.g., 'AAPL')
    name VARCHAR(255) NOT NULL,               -- Company name (e.g., 'Apple Inc.')
    exchange VARCHAR(50) NOT NULL,            -- Exchange (e.g., 'NASDAQ', 'NYSE')
    sector VARCHAR(100),                      -- Industry sector (e.g., 'Technology')
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stocks_symbol ON stocks(symbol);

COMMENT ON TABLE stocks IS 'Stock metadata for all tracked securities';
COMMENT ON COLUMN stocks.symbol IS 'Unique stock ticker symbol';

-- ============================================================================
-- PRICE_SNAPSHOTS TABLE
-- ============================================================================
-- Stores intraday OHLCV (Open, High, Low, Close, Volume) data

CREATE TABLE IF NOT EXISTS price_snapshots (
    snapshot_id BIGSERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(stock_id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,             -- Bar timestamp (e.g., '2025-10-15 09:35:00')
    open NUMERIC(10, 2) NOT NULL,            -- Opening price
    high NUMERIC(10, 2) NOT NULL,            -- High price
    low NUMERIC(10, 2) NOT NULL,             -- Low price
    close NUMERIC(10, 2) NOT NULL,           -- Closing price
    volume BIGINT NOT NULL,                   -- Trading volume
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_id, timestamp)               -- Prevent duplicate timestamps
);

CREATE INDEX idx_price_snapshots_stock_timestamp ON price_snapshots(stock_id, timestamp DESC);
CREATE INDEX idx_price_snapshots_timestamp ON price_snapshots(timestamp DESC);

COMMENT ON TABLE price_snapshots IS 'Intraday OHLCV price data (5-minute bars)';
COMMENT ON COLUMN price_snapshots.timestamp IS 'Bar timestamp in ET (Eastern Time)';

-- ============================================================================
-- TECHNICAL_INDICATORS TABLE
-- ============================================================================
-- Stores calculated technical indicators (RSI, SMA, VWAP, etc.)

CREATE TABLE IF NOT EXISTS technical_indicators (
    indicator_id BIGSERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(stock_id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,             -- Indicator timestamp
    indicator_name VARCHAR(50) NOT NULL,      -- 'RSI', 'SMA_50', 'EMA_20', 'VWAP', etc.
    value NUMERIC(10, 4) NOT NULL,           -- Indicator value
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_id, timestamp, indicator_name)
);

CREATE INDEX idx_technical_indicators_stock_time ON technical_indicators(stock_id, timestamp DESC);
CREATE INDEX idx_technical_indicators_name ON technical_indicators(indicator_name);

COMMENT ON TABLE technical_indicators IS 'Technical indicator values (RSI, SMA, VWAP, etc.)';

-- ============================================================================
-- PAPER_TRADES TABLE
-- ============================================================================
-- Stores all paper trades (mock trades for system validation)

CREATE TABLE IF NOT EXISTS paper_trades (
    trade_id BIGSERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(stock_id) ON DELETE CASCADE,
    action VARCHAR(10) NOT NULL,              -- 'BUY' or 'SELL'
    quantity INTEGER NOT NULL,                -- Number of shares
    price NUMERIC(10, 2) NOT NULL,           -- Execution price
    strategy VARCHAR(50) DEFAULT 'RL_AGENT',  -- Trading strategy ('RL_AGENT', 'BASELINE', etc.)
    reasoning TEXT,                           -- AI decision explanation
    status VARCHAR(20) DEFAULT 'OPEN',        -- 'OPEN' or 'CLOSED'
    exit_price NUMERIC(10, 2),               -- Selling price (when closed)
    exit_time TIMESTAMP,                      -- Exit timestamp
    profit_loss NUMERIC(10, 2),              -- P&L (calculated on close)
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_action CHECK (action IN ('BUY', 'SELL')),
    CONSTRAINT chk_status CHECK (status IN ('OPEN', 'CLOSED'))
);

CREATE INDEX idx_paper_trades_stock ON paper_trades(stock_id);
CREATE INDEX idx_paper_trades_executed_at ON paper_trades(executed_at DESC);
CREATE INDEX idx_paper_trades_status ON paper_trades(status);

COMMENT ON TABLE paper_trades IS 'Paper trading history (mock trades with $0 risk)';
COMMENT ON COLUMN paper_trades.reasoning IS 'AI agent decision rationale';

-- ============================================================================
-- PAPER_BANKROLL TABLE
-- ============================================================================
-- Tracks paper trading bankroll over time

CREATE TABLE IF NOT EXISTS paper_bankroll (
    bankroll_id SERIAL PRIMARY KEY,
    balance NUMERIC(12, 2) NOT NULL,         -- Current balance
    total_trades INTEGER DEFAULT 0,           -- Total number of trades
    winning_trades INTEGER DEFAULT 0,         -- Number of profitable trades
    total_pnl NUMERIC(12, 2) DEFAULT 0.0,    -- Total profit/loss
    roi NUMERIC(8, 4) DEFAULT 0.0,           -- Return on investment (%)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert starting bankroll
INSERT INTO paper_bankroll (balance, total_trades, winning_trades, total_pnl, roi)
VALUES (10000.00, 0, 0, 0.00, 0.0000);

COMMENT ON TABLE paper_bankroll IS 'Paper trading virtual bankroll (starts at $10,000)';

-- ============================================================================
-- RL_MODEL_STATES TABLE
-- ============================================================================
-- Stores Q-Learning agent Q-tables for persistence

CREATE TABLE IF NOT EXISTS rl_model_states (
    model_id SERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(stock_id) ON DELETE CASCADE,
    model_type VARCHAR(50) DEFAULT 'Q_LEARNING',  -- 'Q_LEARNING', 'DQN', etc.
    q_table JSONB NOT NULL,                       -- Q-table as JSON
    hyperparameters JSONB,                        -- Learning rate, discount factor, etc.
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_id, model_type)
);

CREATE INDEX idx_rl_model_states_stock ON rl_model_states(stock_id);

COMMENT ON TABLE rl_model_states IS 'RL agent Q-tables and hyperparameters (for persistence)';
COMMENT ON COLUMN rl_model_states.q_table IS 'Q-table stored as JSON: {state: {action: q_value}}';

-- ============================================================================
-- PERFORMANCE_METRICS TABLE
-- ============================================================================
-- Daily performance metrics for analysis

CREATE TABLE IF NOT EXISTS performance_metrics (
    metric_id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    total_pnl NUMERIC(12, 2) DEFAULT 0.0,
    win_rate NUMERIC(5, 4) DEFAULT 0.0,      -- Win rate (0.0 - 1.0)
    avg_win NUMERIC(10, 2),                   -- Average winning trade
    avg_loss NUMERIC(10, 2),                  -- Average losing trade
    max_drawdown NUMERIC(10, 2),              -- Maximum drawdown
    sharpe_ratio NUMERIC(6, 4),               -- Risk-adjusted return
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date)
);

CREATE INDEX idx_performance_metrics_date ON performance_metrics(date DESC);

COMMENT ON TABLE performance_metrics IS 'Daily trading performance metrics';

-- ============================================================================
-- TRADE_DECISIONS_LOG TABLE
-- ============================================================================
-- Logs all trading decisions (executed and skipped) for transparency

CREATE TABLE IF NOT EXISTS trade_decisions_log (
    decision_id BIGSERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(stock_id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    state JSONB NOT NULL,                     -- Trading state as JSON
    action VARCHAR(10) NOT NULL,              -- 'BUY', 'SELL', or 'HOLD'
    was_executed BOOLEAN DEFAULT FALSE,       -- True if trade was executed
    was_random BOOLEAN DEFAULT FALSE,         -- True if action was random (exploration)
    reasoning TEXT,                           -- Decision rationale
    q_values JSONB                            -- Q-values for all actions
);

CREATE INDEX idx_trade_decisions_log_stock ON trade_decisions_log(stock_id);
CREATE INDEX idx_trade_decisions_log_timestamp ON trade_decisions_log(timestamp DESC);

COMMENT ON TABLE trade_decisions_log IS 'Complete log of all AI trading decisions';

-- ============================================================================
-- API_USAGE_LOG TABLE
-- ============================================================================
-- Tracks Alpha Vantage API usage (500 calls/day limit)

CREATE TABLE IF NOT EXISTS api_usage_log (
    usage_id BIGSERIAL PRIMARY KEY,
    endpoint VARCHAR(100) NOT NULL,           -- API endpoint called
    symbol VARCHAR(10),                       -- Stock symbol (if applicable)
    status VARCHAR(20) NOT NULL,              -- 'SUCCESS', 'ERROR', 'RATE_LIMIT'
    response_time_ms INTEGER,                 -- Response time in milliseconds
    error_message TEXT,                       -- Error message (if any)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_usage_log_created_at ON api_usage_log(created_at DESC);
CREATE INDEX idx_api_usage_log_status ON api_usage_log(status);

COMMENT ON TABLE api_usage_log IS 'Alpha Vantage API call tracking';

-- ============================================================================
-- BACKTEST_RESULTS TABLE
-- ============================================================================
-- Stores historical backtest results

CREATE TABLE IF NOT EXISTS backtest_results (
    backtest_id SERIAL PRIMARY KEY,
    strategy_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_trades INTEGER,
    win_rate NUMERIC(5, 4),
    total_return NUMERIC(10, 4),              -- Total return (%)
    sharpe_ratio NUMERIC(6, 4),
    max_drawdown NUMERIC(10, 4),
    parameters JSONB,                         -- Strategy parameters
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backtest_results_strategy ON backtest_results(strategy_name);
CREATE INDEX idx_backtest_results_created_at ON backtest_results(created_at DESC);

COMMENT ON TABLE backtest_results IS 'Historical backtest performance results';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active positions view (open trades)
CREATE OR REPLACE VIEW active_positions AS
SELECT
    s.stock_id,
    s.symbol,
    SUM(CASE WHEN pt.action = 'BUY' THEN pt.quantity ELSE -pt.quantity END) as quantity,
    AVG(CASE WHEN pt.action = 'BUY' THEN pt.price END) as avg_entry_price,
    MAX(pt.executed_at) as last_trade_time
FROM paper_trades pt
JOIN stocks s ON pt.stock_id = s.stock_id
WHERE pt.status = 'OPEN'
GROUP BY s.stock_id, s.symbol
HAVING SUM(CASE WHEN pt.action = 'BUY' THEN pt.quantity ELSE -pt.quantity END) > 0;

COMMENT ON VIEW active_positions IS 'Current open trading positions';

-- Daily P&L view
CREATE OR REPLACE VIEW daily_pnl AS
SELECT
    DATE(executed_at) as trade_date,
    COUNT(*) as total_trades,
    SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
    SUM(profit_loss) as total_pnl,
    AVG(profit_loss) as avg_pnl
FROM paper_trades
WHERE status = 'CLOSED'
GROUP BY DATE(executed_at)
ORDER BY trade_date DESC;

COMMENT ON VIEW daily_pnl IS 'Daily profit/loss summary';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to calculate win rate
CREATE OR REPLACE FUNCTION calculate_win_rate(
    p_stock_id INTEGER DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
    v_winning_trades INTEGER;
    v_total_trades INTEGER;
BEGIN
    IF p_stock_id IS NULL THEN
        -- All stocks
        SELECT
            COUNT(*) FILTER (WHERE profit_loss > 0),
            COUNT(*)
        INTO v_winning_trades, v_total_trades
        FROM paper_trades
        WHERE status = 'CLOSED';
    ELSE
        -- Specific stock
        SELECT
            COUNT(*) FILTER (WHERE profit_loss > 0),
            COUNT(*)
        INTO v_winning_trades, v_total_trades
        FROM paper_trades
        WHERE status = 'CLOSED' AND stock_id = p_stock_id;
    END IF;

    IF v_total_trades = 0 THEN
        RETURN 0.0;
    END IF;

    RETURN v_winning_trades::NUMERIC / v_total_trades::NUMERIC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_win_rate IS 'Calculate win rate (% of profitable trades)';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stocks_updated_at
BEFORE UPDATE ON stocks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- GRANTS (read-only role for dashboard)
-- ============================================================================

-- Create read-only role for dashboard
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'market_edge_readonly') THEN
        CREATE ROLE market_edge_readonly WITH LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE postgres TO market_edge_readonly;
GRANT USAGE ON SCHEMA public TO market_edge_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO market_edge_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO market_edge_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO market_edge_readonly;

COMMENT ON ROLE market_edge_readonly IS 'Read-only access for Next.js dashboard';

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

-- Uncomment to insert sample stocks
/*
INSERT INTO stocks (symbol, name, exchange, sector) VALUES
('AAPL', 'Apple Inc.', 'NASDAQ', 'Technology'),
('MSFT', 'Microsoft Corporation', 'NASDAQ', 'Technology'),
('GOOGL', 'Alphabet Inc.', 'NASDAQ', 'Technology'),
('TSLA', 'Tesla Inc.', 'NASDAQ', 'Automotive'),
('NVDA', 'NVIDIA Corporation', 'NASDAQ', 'Technology'),
('SPY', 'SPDR S&P 500 ETF', 'NYSE', 'ETF'),
('QQQ', 'Invesco QQQ Trust', 'NASDAQ', 'ETF'),
('META', 'Meta Platforms Inc.', 'NASDAQ', 'Technology'),
('AMZN', 'Amazon.com Inc.', 'NASDAQ', 'Technology'),
('JPM', 'JPMorgan Chase & Co.', 'NYSE', 'Finance')
ON CONFLICT (symbol) DO NOTHING;
*/

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

-- Verify tables created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
