# Market-Edge

An AI-powered day trading system using Q-Learning (reinforcement learning) to autonomously learn profitable trading strategies. This academic project demonstrates the application of RL algorithms to financial markets through paper trading (zero-risk mock trades).

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![PostgreSQL 15](https://img.shields.io/badge/postgresql-15-blue.svg)](https://www.postgresql.org/)
[![Next.js 14](https://img.shields.io/badge/next.js-14-black.svg)](https://nextjs.org/)

## Overview

Market-Edge combines reinforcement learning with technical analysis to create an autonomous trading agent that:
- Fetches near real-time stock data every 5 minutes via Alpaca Market Data API
- Calculates technical indicators (RSI, SMA, VWAP) locally
- Uses Q-Learning to make BUY/SELL/HOLD decisions
- Executes paper trades to validate strategies without financial risk
- Continuously learns and improves through trial-and-error

**Academic Context:** CS5100 (Foundations of AI) final project at Northeastern University

## Features

- **Q-Learning Agent**: Tabular RL with epsilon-greedy exploration (2,916 discrete states)
- **Paper Trading**: Mock trading with $100,000 virtual capital, zero risk
- **Technical Indicators**: RSI, SMA, VWAP calculated locally to minimize API calls
- **Automated Workflows**: GitHub Actions for ETL, trading, and settlement
- **Real-time Dashboard**: Next.js web interface for monitoring performance
- **Persistent Learning**: Q-tables saved to PostgreSQL for continuous improvement

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 15+
- [Alpaca Market Data API key](https://app.alpaca.markets) (Basic plan is free)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd market-edge

# Install dependencies
make install

# Configure environment variables
cp .env.example .env
# Edit .env and add your DATABASE_URL and APCA_API_KEY_ID/APCA_API_SECRET_KEY

# Initialize database
make db-migrate

# Verify setup
make verify
```

### Running the System

```bash
# Fetch market data
make etl

# Run trading agent
make trade

# Start dashboard (http://localhost:3001)
make dashboard

# Settle positions at end of day
make settle
```

## Architecture

```
┌─────────────┐
│ Alpaca Data │ ← Stock market data API
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ ETL Script      │ ← Fetch OHLCV data every 5 min
│ (market_data_   │   Calculate RSI, SMA, VWAP
│  etl.py)        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ PostgreSQL DB   │ ← Store prices, indicators, trades
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ RL Agent        │ ← Q-Learning decision making
│ (rl_trading_    │   BUY/SELL/HOLD based on state
│  agent.py)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Paper Trades    │ ← Execute mock trades
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Dashboard       │ ← Monitor performance (Next.js)
│ (localhost:3001)│
└─────────────────┘
```

## Tech Stack

- **Backend**: Python 3.10+ (psycopg2, numpy, pandas)
- **Frontend**: Next.js 14 with TypeScript and Tailwind CSS
- **Database**: PostgreSQL 15
- **Data Provider**: Alpaca Market Data API
- **Automation**: GitHub Actions
- **Testing**: pytest

## Project Structure

```
market-edge/
├── apps/
│   └── dashboard/          # Next.js web dashboard
├── packages/
│   ├── providers/          # API clients (Alpaca)
│   ├── shared/             # Database & indicators
│   └── models/             # Q-Learning agent & state
├── ops/scripts/            # Operational scripts
│   ├── market_data_etl.py  # Data fetching
│   ├── rl_trading_agent.py # Trading logic
│   └── settle_trades.py    # Position settlement
├── infra/migrations/       # Database schema
└── .github/workflows/      # Automation workflows
```

## Q-Learning Implementation

### State Space (2,916 states)
- **RSI**: Oversold (<30) / Neutral (30-70) / Overbought (>70)
- **Price vs SMA**: Below / At / Above
- **Price vs VWAP**: Below / At / Above
- **Position**: Long / Flat / Short
- **Momentum**: Up / Flat / Down
- **Cash Availability**: High (≥70%), Medium (30-70%), Low (<30%) of bankroll remaining
- **Portfolio Exposure**: None (<5%), Light (<50%), Heavy (≤100%), Overextended (>100%) of bankroll deployed

### Action Space
- **BUY**: Purchase shares (up to max position size)
- **SELL**: Close entire position
- **HOLD**: No action

### Reward Function
```python
reward = profit_loss - (overtrading_penalty if action != HOLD else 0)
```

### Hyperparameters
- Learning rate (α): 0.1
- Discount factor (γ): 0.95
- Exploration rate (ε): 1.0 → 0.01 (decays over time)

## Configuration

Environment variables (`.env`):
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:port/market_edge
DATABASE_READONLY_URL=postgresql://readonly:pass@host:port/market_edge

# API
APCA_API_KEY_ID=your_key_here
APCA_API_SECRET_KEY=your_secret_here

# Trading
SYMBOLS=AAPL,MSFT,GOOGL,TSLA,NVDA,SPY,QQQ,META,AMZN,JPM
MAX_POSITION_SIZE=25
STARTING_CASH=100000.00

# RL Parameters
LEARNING_RATE=0.1
DISCOUNT_FACTOR=0.95
EXPLORATION_RATE=1.0
EXPLORATION_DECAY=0.995
MIN_EXPLORATION=0.01
```

See `.env.example` for full configuration options.

## Dashboard

The web dashboard (Next.js) provides real-time monitoring:

- **Overview**: Bankroll balance, ROI, win rate, active positions
- **Trades**: Complete trade history with P&L
- **Performance**: Daily metrics and statistics
- **Agent Stats**: Q-table size, exploration rate, decision logs

Access at: http://localhost:3001

## Automation

GitHub Actions workflows handle automated operation:

1. **Market Data ETL**: Every 5 minutes during market hours (9:30 AM - 4 PM ET)
2. **Trading Agent**: Every 5 minutes, 2 minutes after ETL
3. **Daily Settlement**: 4:05 PM ET to close all positions

Configure secrets in GitHub repository settings:
- `APCA_API_KEY_ID`
- `APCA_API_SECRET_KEY`
- `DATABASE_URL`

## Performance Expectations

Learning curve over 12 weeks:

| Week | Win Rate | ROI | Exploration Rate |
|------|----------|-----|------------------|
| 1-2  | ~50%     | 0%  | 100% → 70%       |
| 4-6  | ~53%     | 1-2%| 30-50%           |
| 12+  | 55-57%   | 3-5%| ~1%              |

## Development

### Commands

```bash
# Setup
make install        # Install dependencies
make db-migrate     # Run migrations
make verify         # Verify configuration

# Operations
make etl            # Run ETL
make trade          # Run trading agent
make settle         # Settle positions
make dashboard      # Start dashboard

# Development
make clean          # Clean temporary files
pytest              # Run tests
```

### Database

```bash
# Connect to database
psql $DATABASE_URL

# Common queries
SELECT * FROM paper_trades ORDER BY executed_at DESC LIMIT 10;
SELECT * FROM paper_bankroll ORDER BY updated_at DESC LIMIT 1;
SELECT * FROM active_positions;
```

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov

# Test specific module
pytest tests/test_ql_agent.py
```

## Troubleshooting

**No trades executing:**
- Check if market is open (Mon-Fri, 9:30 AM - 4 PM ET)
- Verify sufficient price data (need 50+ bars for indicators)
- Check exploration rate (if 1.0, agent is purely random)

**API quota exceeded:**
- Alpaca Market Data Basic: 200 calls/min, 10,000/day
- Check workflow logs for HTTP 429; reduce symbol count or polling interval if needed

**Dashboard shows no data:**
- Run `make etl` manually to populate database
- Verify `DATABASE_READONLY_URL` in `apps/dashboard/.env.local`

See `CLAUDE.md` for comprehensive troubleshooting guide.

## Documentation

- **CLAUDE.md**: Comprehensive guide for AI assistants (architecture, commands, best practices)
- **SETUP.md**: Detailed setup instructions for GitHub Actions and deployment
- **.env.example**: Configuration reference with all options
- **apps/dashboard/README.md**: Dashboard-specific documentation

## API Rate Limits

Alpaca Market Data Basic:
- 200 API calls per minute
- 10,000 calls per day
- Current usage: ~780 calls/day (92% buffer)

Technical indicators calculated locally to minimize API usage.

## Academic Use

This project is for educational purposes only. Not intended for real-money trading.

**Key Learning Objectives:**
- Reinforcement learning (Q-Learning algorithm)
- State space discretization
- Exploration vs exploitation tradeoff
- Reward function design
- Applied ML in financial markets

## Future Enhancements

Post-graduation roadmap:
- Deep Q-Network (DQN) with neural networks
- Real-time WebSocket data feeds
- Multi-stock portfolio optimization
- Advanced risk management
- Live trading with real capital

## Contributing

This is an academic project. For questions or feedback:
- Dylan Suhr - dylan.suhr@northeastern.edu
- Course: CS5100 (Foundations of AI)
- Institution: Northeastern University (Roux Institute)

## License

Academic use only. All rights reserved.

## Acknowledgments

- **Data Provider**: [Alpaca Market Data](https://app.alpaca.markets)
- **RL Theory**: Sutton & Barto - "Reinforcement Learning: An Introduction"
- **Architecture**: Inspired by SportsEdge project
- **Course**: CS5100 - Foundations of AI, Northeastern University

---

**Built with:** Python 3.10+, PostgreSQL 15, Q-Learning, Alpaca Market Data API, Next.js 14
**Status:** ✅ Core system complete, automated trading active
**Last Updated:** October 2025
