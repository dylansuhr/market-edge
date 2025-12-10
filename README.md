# Market-Edge

Q-Learning agent for autonomous day trading — learns profitable strategies through trial and error without hardcoded trading rules.

**CS5100 Final Project** — Northeastern University, Roux Institute

## Key Algorithm Files

| File | Purpose |
|------|---------|
| [`packages/models/models/ql_agent.py`](packages/models/models/ql_agent.py) | Q-Learning agent: Q-table, epsilon-greedy action selection, TD update |
| [`packages/models/models/state.py`](packages/models/models/state.py) | State discretization: 7 features → 4,860 discrete states |
| [`ops/scripts/rl_trading_agent.py`](ops/scripts/rl_trading_agent.py) | Trading loop: reward function, decision execution, learning cycle |
| [`packages/shared/shared/indicators.py`](packages/shared/shared/indicators.py) | Technical indicators: RSI, SMA, VWAP calculations |

## Tech Stack

| Layer | Technology |
|-------|------------|
| RL Agent | Python 3.10+, NumPy |
| Database | PostgreSQL 15 (Neon) |
| Dashboard | Next.js 14, TypeScript, Tailwind, Recharts |
| Market Data | Alpaca API |
| Automation | GitHub Actions |

## Live Dashboard

The dashboard visualizes the agent's learning progression with real trading data:

**URL:** [market-edge.vercel.app](https://market-edge-git-main-dylan-suhrs-projects.vercel.app/)

## Running Your Own Instance

This repo is configured for my Alpaca API and database credentials. To fork and run your own:

1. Create a [Neon](https://neon.tech) PostgreSQL database
2. Get [Alpaca](https://alpaca.markets) API keys (free tier works)
3. Add to `.env`: `DATABASE_URL`, `APCA_API_KEY_ID`, `APCA_API_SECRET_KEY`
4. Run `make db-migrate` then `make trade`

## Project Structure

```
market-edge/
├── packages/models/        # Q-Learning agent + state representation
├── ops/scripts/            # ETL, trading agent, settlement
├── apps/dashboard/         # Next.js visualization
├── infra/migrations/       # Database schema
└── .github/workflows/      # Automated trading (runs every 5 min)
```

---

Dylan Suhr
suhr.d@northeastern.edu
