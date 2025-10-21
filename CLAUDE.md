# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Market-Edge is an AI-powered day trading system using Q-Learning (reinforcement learning) to learn profitable trading strategies autonomously. It's an academic project (CS5100 - Foundations of AI) that:
- Fetches near real-time stock data every 5 minutes via Alpaca Market Data API
- Calculates technical indicators (RSI, SMA, VWAP) locally
- Uses Q-Learning agent to make BUY/SELL/HOLD decisions
- Executes paper trades (mock trades with $0 risk)
- Learns and improves through trial-and-error

**Tech Stack:**
- Backend: Python 3.10+ (RL agent, ETL, automation)
- Frontend: Next.js 14 (dashboard on port 3001)
- Database: PostgreSQL 15
- Data Source: Alpaca Market Data API (Basic plan: 200 calls/min, 10,000/day)
- Automation: GitHub Actions

## Essential Commands

### Setup & Verification
```bash
make install      # Install Python + Node.js dependencies
make db-migrate   # Run database migrations (infra/migrations/0001_init.sql)
make verify       # Verify system setup (env vars, DB connection, packages)
make db-ping      # Test database connection
```

### Daily Operations
```bash
make etl          # Fetch market data from Alpaca Market Data
make trade        # Run RL trading agent
make settle       # Settle open positions (run at market close)
make dashboard    # Start Next.js dashboard (localhost:3001)
```

### Development
```bash
# Python dependencies
pip install -r requirements.txt

# Dashboard (Next.js)
cd apps/dashboard
npm install
npm run dev       # Development server on port 3001
npm run build     # Production build
npm run lint      # Run linter

# Database operations
psql $DATABASE_URL -f infra/migrations/0001_init.sql  # Run migrations
psql $DATABASE_URL -c "SELECT * FROM paper_trades ORDER BY executed_at DESC LIMIT 10;"

# Python scripts
python ops/scripts/market_data_etl.py --symbols AAPL,MSFT
python ops/scripts/rl_trading_agent.py --exploit  # Force exploitation mode
python ops/scripts/settle_trades.py
```

### Testing
```bash
pytest                           # Run all tests
pytest tests/test_ql_agent.py   # Test specific module
pytest --cov                     # Run with coverage
```

## Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection string (write access for ETL/trading scripts)
- `DATABASE_READONLY_URL` - PostgreSQL connection string (read-only for dashboard)
- `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY` - Alpaca Market Data API credentials

**Configuration:**
- `SYMBOLS` - Comma-separated stock symbols (default: AAPL,MSFT,GOOGL,TSLA,NVDA,SPY,QQQ,META,AMZN,JPM)
- `INTERVAL` - Intraday bar size (default: 5min)
- `MAX_POSITION_SIZE` - Max shares per stock (default: 10)
- `STARTING_CASH` - Virtual capital (default: 10000.00)

**RL Hyperparameters:**
- `LEARNING_RATE` - Alpha (default: 0.1)
- `DISCOUNT_FACTOR` - Gamma (default: 0.95)
- `EXPLORATION_RATE` - Starting epsilon (default: 1.0)
- `EXPLORATION_DECAY` - Epsilon decay rate (default: 0.995)
- `MIN_EXPLORATION` - Minimum epsilon (default: 0.01)

See `.env.example` for full list and documentation.

## Architecture

### Monorepo Structure
```
market-edge/
├── apps/
│   └── dashboard/              # Next.js 14 dashboard (TypeScript, Tailwind)
│       ├── app/                # App Router pages
│       │   ├── page.tsx        # Overview (bankroll, positions, recent trades)
│       │   ├── trades/         # Trade history
│       │   ├── performance/    # Performance metrics
│       │   ├── agent/          # Q-Learning agent stats
│       │   └── api/            # API routes
│       └── lib/db.ts           # Database utilities (read-only)
├── packages/
│   ├── providers/
│   │   └── alpaca_provider.py  # Alpaca Market Data API client
│   ├── shared/shared/
│   │   ├── db.py               # Database operations (all writes go through here)
│   │   └── indicators.py       # Technical indicators (RSI, SMA, VWAP)
│   └── models/models/
│       ├── state.py            # Trading state representation (243 discrete states)
│       └── ql_agent.py         # Q-Learning agent implementation
├── ops/scripts/
│   ├── market_data_etl.py      # Fetch stock data from Alpaca Market Data
│   ├── rl_trading_agent.py     # RL agent trading logic
│   └── settle_trades.py        # Close positions at end of day
├── infra/migrations/
│   └── 0001_init.sql           # PostgreSQL schema (11 tables)
└── .github/workflows/          # GitHub Actions automation
    ├── market-data-etl.yml     # Run ETL every 5 min during market hours
    ├── trading-agent.yml       # Run agent every 5 min (2 min after ETL)
    └── settlement.yml          # Settle positions daily at 4:05 PM ET
```

### Data Flow
```
Alpaca Market Data API → ETL (market_data_etl.py) → PostgreSQL → RL Agent (rl_trading_agent.py) → Paper Trades → Dashboard
   (every 5 min)           ↓
                  Calculate RSI/SMA/VWAP locally
                  (saves API calls - only 1 call per stock)
                           ↓
                     Q-Learning Decision
                  (BUY/SELL/HOLD based on Q-values)
```

### Database Schema

**Key Tables** (see `infra/migrations/` for full schema):
- `stocks` - Stock metadata (symbol, name, exchange, sector)
- `price_snapshots` - OHLCV bars (every 5 min) - IMMUTABLE (never UPDATE, always INSERT)
- `technical_indicators` - RSI, SMA, VWAP values
- `paper_trades` - All executed trades (status: OPEN/CLOSED) - **SOURCE OF TRUTH** for balance
- `paper_bankroll` - **VIEW** (not table!) - Calculates balance, ROI, win rate from paper_trades
- `rl_model_states` - Q-tables persisted as JSON
- `trade_decisions_log` - All decisions (executed and skipped) for transparency
- `performance_metrics` - Daily stats

**Views:**
- `active_positions` - Current open positions
- `daily_pnl` - Daily profit/loss summary

**Functions:**
- `calculate_win_rate(stock_id)` - Calculate win rate for a stock

### Q-Learning Implementation

**State Space** (243 total states = 3^5):
- RSI: OVERSOLD (<30) / NEUTRAL (30-70) / OVERBOUGHT (>70)
- MA Position: BELOW / AT / ABOVE (price vs SMA_50)
- VWAP Position: BELOW / AT / ABOVE (price vs VWAP)
- Position Status: LONG (>0 shares) / FLAT (0) / SHORT (<0)
- Price Momentum: UP / FLAT / DOWN (vs previous price)

**Action Space:**
- BUY: Purchase shares (up to MAX_POSITION_SIZE)
- SELL: Close entire position
- HOLD: Do nothing

**Q-Value Update:**
```
Q(s, a) ← Q(s, a) + α[R + γ * max_a' Q(s', a') - Q(s, a)]
```
- **α (learning_rate):** 0.1 - How much to update Q-values
- **γ (discount_factor):** 0.95 - How much to value future rewards
- **Updates happen immediately** after each action (not just on settlement)

**Reward Function** (implemented in `ops/scripts/rl_trading_agent.py:calculate_reward()`):
- **BUY (executed):** -0.1 (penalty for committing capital)
- **SELL (executed):** realized_pnl (profit/loss from closing position)
- **HOLD:** -0.01 (opportunity cost)
- **Not executed:** 0 (no penalty)

**Learning Loop:**
1. Agent observes state (RSI, MA, VWAP, position, momentum)
2. Chooses action (ε-greedy: random with probability ε, best Q-value otherwise)
3. Executes action → receives reward
4. Updates Q(s,a) immediately using reward and next state
5. Exploration rate decays: ε × 0.995 after each episode

**Files:**
- `packages/models/models/state.py` - TradingState class (discretization logic)
- `packages/models/models/ql_agent.py` - QLearningAgent class (Q-table, epsilon-greedy)
- `packages/shared/shared/db.py` - save_q_table(), load_q_table() for persistence

### Database Layer (Idempotent Operations)

All database writes go through `packages/shared/shared/db.py`.

**Critical Architectural Principle:**
- ⚠️ **NEVER store derived/calculated data** - Always calculate dynamically from source of truth
- ⚠️ **NEVER create hardcoded fix scripts** - Fix the system, not the symptom
- ✅ **Single Source of Truth** - Each piece of data has exactly one authoritative source
- ✅ **Dynamic Calculations** - Use database views/functions to compute derived values
- ✅ **Example:** `paper_bankroll` is a VIEW (calculated from `paper_trades`), not a table

**Why This Matters:**
- Storing derived data (like balance) leads to inconsistencies when not updated correctly
- Manual fixes (like `fix_bankroll.sql`) are band-aids that don't address root cause
- Views ensure data is always correct by definition (impossible to drift out of sync)

Key functions:

**Stock Operations:**
- `upsert_stock(symbol, name, exchange, sector)` - Insert or update stock (uses ON CONFLICT)
- `get_stock_id(symbol)` - Get stock_id for a symbol

**Price Data:**
- `upsert_price_snapshot(stock_id, timestamp, open, high, low, close, volume)` - Idempotent insert
- `bulk_insert_price_snapshots(snapshots)` - Batch insert for efficiency
- `get_recent_prices(stock_id, limit=100)` - Get recent OHLCV bars

**Technical Indicators:**
- `upsert_technical_indicator(stock_id, timestamp, indicator_name, value)` - Idempotent insert
- `get_latest_indicators(stock_id)` - Returns dict like {'RSI': 28.5, 'SMA_50': 177.85, 'VWAP': 178.12}

**Paper Trading:**
- `insert_paper_trade(stock_id, action, quantity, price, strategy, reasoning)` - Returns `Dict` with trade_id, realized_pnl, closed_trades
  - **BUY:** Inserts with status='OPEN'
  - **SELL:** Matches against open BUY lots (FIFO), calculates P&L, marks both as 'CLOSED'
- `get_active_positions()` - Get all open BUY positions
- `close_position(stock_id, exit_price, exit_time)` - Close all open BUY positions (for end-of-day settlement), returns total P&L
- `get_paper_bankroll()` - Get current balance, ROI, win rate (reads from paper_bankroll VIEW)
- **Trade Lifecycle:** BUY opens position → SELL closes it (FIFO) → P&L calculated immediately
- **Balance:** Calculated dynamically from `paper_trades` via database view (single source of truth)
- **Removed:** `update_paper_bankroll()`, `adjust_paper_bankroll_balance()` - no longer needed

**RL Model:**
- `save_q_table(stock_id, agent_data)` - Persist Q-table to database
- `load_q_table(stock_id)` - Load Q-table from database

**AI Logging:**
- `insert_decision_log(stock_id, state, action, was_executed, was_random, reasoning, q_values)` - Log all decisions
- `get_recent_decisions(stock_id, limit=50)` - Get recent AI decisions

**Critical:** Scripts are safe to re-run - no duplicates created due to ON CONFLICT clauses.

### Technical Indicators

All indicators calculated locally in `packages/shared/shared/indicators.py`:
- `calculate_rsi(prices, period=14)` - Relative Strength Index
- `calculate_sma(prices, period=50)` - Simple Moving Average
- `calculate_vwap(bars)` - Volume Weighted Average Price

This reduces API calls by 75% (1 call per stock instead of 4).

### Automation (GitHub Actions)

**Workflows:**
- **ETL** (`.github/workflows/market-data-etl.yml`): Every 5 min during market hours (9:30 AM - 4 PM ET, Mon-Fri)
- **Trading** (`.github/workflows/trading-agent.yml`): Every 5 min, 2 minutes after ETL
- **Settlement** (`.github/workflows/settlement.yml`): Daily at 4:05 PM ET

**API Quota Management:**
- Alpaca Market Data Basic: 200 calls/min, 10,000 calls/day
- Current usage: ~780 calls/day (10 stocks × 1 call/run × 78 runs)
- 92% safety margin (9,220 calls unused)

## Critical Rules

### Compliance
1. **NO real-money trading** - Paper trades only
2. Dashboard uses `DATABASE_READONLY_URL` (separate read-only role)
3. **NEVER log or commit API keys**
4. Respect Alpaca quota (200 calls/min, 10,000/day); handle HTTP 429 with backoff
5. Rate limiting handled via automatic retries—no fixed sleep required

### Code Quality
1. **All database writes through `packages/shared/shared/db.py`** - No raw SQL in scripts
2. **Idempotent operations** - Scripts must be safe to re-run
3. **Well-commented code** - Explain "why", not just "what" (academic project)
4. **Environment-based config** - No hardcoded values
5. **Immutable price_snapshots** - NEVER UPDATE, always INSERT

### RL Best Practices
1. **Always save Q-table after updates** - Use `save_q_table()` after agent learns
2. **Decay exploration rate** - Epsilon must decrease over time
3. **Log all decisions** - Use `insert_decision_log()` for transparency
4. **Validate states** - Check for None/NaN before using
5. **Separate train/deploy** - Use `--exploit` flag for deployment (no exploration)

## Common Development Tasks

### Adding a New Stock Symbol
1. Edit `.env`: `SYMBOLS=AAPL,MSFT,GOOGL,TSLA,NEW_STOCK`
2. Run `make etl` to fetch data
3. Run `make trade` - agent automatically starts trading it

### Debugging No Trades
```sql
-- Check if data exists
SELECT COUNT(*) FROM price_snapshots WHERE stock_id = (SELECT stock_id FROM stocks WHERE symbol = 'AAPL');

-- Check if indicators exist
SELECT * FROM technical_indicators WHERE stock_id = (SELECT stock_id FROM stocks WHERE symbol = 'AAPL') ORDER BY timestamp DESC LIMIT 5;

-- Check agent exploration rate
SELECT hyperparameters->>'exploration_rate' FROM rl_model_states WHERE stock_id = (SELECT stock_id FROM stocks WHERE symbol = 'AAPL');

-- Check recent decisions
SELECT * FROM trade_decisions_log ORDER BY timestamp DESC LIMIT 20;
```

### Tuning Hyperparameters
Edit `.env`:
```bash
LEARNING_RATE=0.2          # Increase for faster learning (more volatile)
DISCOUNT_FACTOR=0.99       # Increase to value future rewards more
EXPLORATION_DECAY=0.99     # Increase for faster shift to exploitation
```
Then restart agent: `make trade`

### Viewing Recent Performance
```sql
-- Recent trades
SELECT s.symbol, pt.action, pt.quantity, pt.price, pt.profit_loss, pt.executed_at
FROM paper_trades pt
JOIN stocks s ON pt.stock_id = s.stock_id
ORDER BY executed_at DESC LIMIT 20;

-- Current bankroll
SELECT * FROM paper_bankroll ORDER BY updated_at DESC LIMIT 1;

-- Active positions
SELECT * FROM active_positions;

-- Win rate by stock
SELECT s.symbol, calculate_win_rate(s.stock_id) as win_rate
FROM stocks s;
```

## Common Issues & Solutions

**"No quote data returned":**
- Cause: API key invalid or quota exceeded
- Fix: Check `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY` in `.env`, verify usage on Alpaca dashboard

**"Insufficient price data (X bars)":**
- Cause: Not enough historical bars to calculate indicators (need 50+)
- Fix: Wait for data accumulation (50 bars × 5 min = 4+ hours), or fetch historical data

**"Q-table not updating":**
- Cause: Exploration rate stuck at 1.0 (always random), or Q-table not being saved
- Fix: Check `save_q_table()` is called after agent updates, verify exploration decay

**"Win rate stuck at 50%":**
- Cause: Agent hasn't learned yet (still exploring)
- Fix: Wait longer (need 100+ trades), check exploration rate is decaying

**Dashboard shows stale data:**
- Cause: Using wrong DATABASE_URL
- Fix: Ensure dashboard uses `DATABASE_READONLY_URL` environment variable

## Project Status

**Implemented:**
- ✅ Alpaca Market Data integration (migrated from Polygon.io)
- ✅ Technical indicators (RSI, SMA, VWAP) calculated locally
- ✅ Q-Learning agent with epsilon-greedy exploration
- ✅ State representation (243 discrete states)
- ✅ Paper trading with bankroll management
- ✅ Database schema (11 tables, idempotent operations)
- ✅ Automation scripts (ETL, trading, settlement)
- ✅ Next.js dashboard (basic version)
- ✅ GitHub Actions workflows

**In Progress:**
- Dashboard enhancements (AI decision log viewer)
- Unit tests for RL agent
- Performance analysis tools

## Additional Documentation

For more detailed information, see:
- `docs/planning/CLAUDE.md` - Comprehensive project context
- `docs/planning/SETUP_GUIDE.md` - Detailed setup instructions
- `apps/dashboard/README.md` - Dashboard-specific documentation
- `.env.example` - Full environment variable documentation

---

**Built with:** Python 3.10+, PostgreSQL 15, Q-Learning, Alpaca Market Data API, Next.js 14
**License:** Academic use only
**Status:** Core system complete, automated trading active
