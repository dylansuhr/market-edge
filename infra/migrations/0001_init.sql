-- Market-Edge Database Schema (PostgreSQL 15+)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- STOCKS
CREATE TABLE IF NOT EXISTS stocks (
    stock_id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    exchange VARCHAR(50) NOT NULL,
    sector VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stocks_symbol ON stocks(symbol);

-- PRICE_SNAPSHOTS (5-min OHLCV bars)
CREATE TABLE IF NOT EXISTS price_snapshots (
    snapshot_id BIGSERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(stock_id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    open NUMERIC(10, 2) NOT NULL,
    high NUMERIC(10, 2) NOT NULL,
    low NUMERIC(10, 2) NOT NULL,
    close NUMERIC(10, 2) NOT NULL,
    volume BIGINT NOT NULL,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_id, timestamp)
);

CREATE INDEX idx_price_snapshots_stock_timestamp ON price_snapshots(stock_id, timestamp DESC);
CREATE INDEX idx_price_snapshots_timestamp ON price_snapshots(timestamp DESC);

-- TECHNICAL_INDICATORS (RSI, SMA, VWAP)
CREATE TABLE IF NOT EXISTS technical_indicators (
    indicator_id BIGSERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(stock_id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    indicator_name VARCHAR(50) NOT NULL,
    value NUMERIC(10, 4) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_id, timestamp, indicator_name)
);

CREATE INDEX idx_technical_indicators_stock_time ON technical_indicators(stock_id, timestamp DESC);
CREATE INDEX idx_technical_indicators_name ON technical_indicators(indicator_name);

-- PAPER_TRADES
CREATE TABLE IF NOT EXISTS paper_trades (
    trade_id BIGSERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(stock_id) ON DELETE CASCADE,
    action VARCHAR(10) NOT NULL,
    quantity INTEGER NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    strategy VARCHAR(50) DEFAULT 'RL_AGENT',
    reasoning TEXT,
    status VARCHAR(20) DEFAULT 'OPEN',
    exit_price NUMERIC(10, 2),
    exit_time TIMESTAMP,
    profit_loss NUMERIC(10, 2),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_action CHECK (action IN ('BUY', 'SELL')),
    CONSTRAINT chk_status CHECK (status IN ('OPEN', 'CLOSED'))
);

CREATE INDEX idx_paper_trades_stock ON paper_trades(stock_id);
CREATE INDEX idx_paper_trades_executed_at ON paper_trades(executed_at DESC);
CREATE INDEX idx_paper_trades_status ON paper_trades(status);

-- PAPER_BANKROLL (starts at $100k)
CREATE TABLE IF NOT EXISTS paper_bankroll (
    bankroll_id SERIAL PRIMARY KEY,
    balance NUMERIC(12, 2) NOT NULL,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    total_pnl NUMERIC(12, 2) DEFAULT 0.0,
    roi NUMERIC(8, 4) DEFAULT 0.0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO paper_bankroll (balance, total_trades, winning_trades, total_pnl, roi)
VALUES (100000.00, 0, 0, 0.00, 0.0000);

-- RL_MODEL_STATES (Q-table persistence)
CREATE TABLE IF NOT EXISTS rl_model_states (
    model_id SERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(stock_id) ON DELETE CASCADE,
    model_type VARCHAR(50) DEFAULT 'Q_LEARNING',
    q_table JSONB NOT NULL,
    hyperparameters JSONB,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(stock_id, model_type)
);

CREATE INDEX idx_rl_model_states_stock ON rl_model_states(stock_id);

-- PERFORMANCE_METRICS (daily stats)
CREATE TABLE IF NOT EXISTS performance_metrics (
    metric_id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    total_pnl NUMERIC(12, 2) DEFAULT 0.0,
    win_rate NUMERIC(5, 4) DEFAULT 0.0,
    avg_win NUMERIC(10, 2),
    avg_loss NUMERIC(10, 2),
    max_drawdown NUMERIC(10, 2),
    sharpe_ratio NUMERIC(6, 4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date)
);

CREATE INDEX idx_performance_metrics_date ON performance_metrics(date DESC);

-- TRADE_DECISIONS_LOG
CREATE TABLE IF NOT EXISTS trade_decisions_log (
    decision_id BIGSERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES stocks(stock_id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    state JSONB NOT NULL,
    action VARCHAR(10) NOT NULL,
    was_executed BOOLEAN DEFAULT FALSE,
    was_random BOOLEAN DEFAULT FALSE,
    reasoning TEXT,
    q_values JSONB
);

CREATE INDEX idx_trade_decisions_log_stock ON trade_decisions_log(stock_id);
CREATE INDEX idx_trade_decisions_log_timestamp ON trade_decisions_log(timestamp DESC);

-- API_USAGE_LOG (deprecated - switched to Alpaca)
CREATE TABLE IF NOT EXISTS api_usage_log (
    usage_id BIGSERIAL PRIMARY KEY,
    endpoint VARCHAR(100) NOT NULL,
    symbol VARCHAR(10),
    status VARCHAR(20) NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_usage_log_created_at ON api_usage_log(created_at DESC);
CREATE INDEX idx_api_usage_log_status ON api_usage_log(status);

-- BACKTEST_RESULTS
CREATE TABLE IF NOT EXISTS backtest_results (
    backtest_id SERIAL PRIMARY KEY,
    strategy_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_trades INTEGER,
    win_rate NUMERIC(5, 4),
    total_return NUMERIC(10, 4),
    sharpe_ratio NUMERIC(6, 4),
    max_drawdown NUMERIC(10, 4),
    parameters JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_backtest_results_strategy ON backtest_results(strategy_name);
CREATE INDEX idx_backtest_results_created_at ON backtest_results(created_at DESC);

-- VIEWS

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

-- FUNCTIONS

CREATE OR REPLACE FUNCTION calculate_win_rate(p_stock_id INTEGER DEFAULT NULL)
RETURNS NUMERIC AS $$
DECLARE
    v_winning_trades INTEGER;
    v_total_trades INTEGER;
BEGIN
    IF p_stock_id IS NULL THEN
        SELECT COUNT(*) FILTER (WHERE profit_loss > 0), COUNT(*)
        INTO v_winning_trades, v_total_trades
        FROM paper_trades WHERE status = 'CLOSED';
    ELSE
        SELECT COUNT(*) FILTER (WHERE profit_loss > 0), COUNT(*)
        INTO v_winning_trades, v_total_trades
        FROM paper_trades WHERE status = 'CLOSED' AND stock_id = p_stock_id;
    END IF;

    IF v_total_trades = 0 THEN RETURN 0.0; END IF;
    RETURN v_winning_trades::NUMERIC / v_total_trades::NUMERIC;
END;
$$ LANGUAGE plpgsql;

-- TRIGGERS

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

-- GRANTS (read-only role for dashboard)

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

-- Verify tables created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
