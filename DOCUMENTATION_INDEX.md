# Market-Edge - Documentation Index

**Last Updated:** October 18, 2025

---

## 📚 Documentation Structure

We've organized documentation into a clear, navigable structure with **3 core documents in root** and detailed guides in subdirectories:

### Root Level (Essential Documents)

#### [`README.md`](./README.md)
**Purpose:** Project overview and quick start guide
**Audience:** New developers, users, GitHub visitors
**Contents:**
- Project overview (AI-powered day trading with Q-Learning)
- Features and tech stack
- Quick start installation
- Running the system (ETL, trading, dashboard)
- Architecture diagram
- Q-Learning implementation details
- Configuration reference
- Troubleshooting guide
- Academic context (CS5100 project)

**When to use:** First-time setup, understanding what the project does

---

#### [`CLAUDE.md`](./CLAUDE.md)
**Purpose:** Comprehensive reference for AI assistants and active developers
**Audience:** Claude Code, developers working in the codebase
**Contents:**
- Essential commands (setup, operations, development)
- Environment variables reference
- Complete architecture breakdown
  - Monorepo structure
  - Data flow diagrams
  - Database schema (11 tables + views)
  - Q-Learning implementation (243 states, 3 actions)
  - Database layer functions (all idempotent)
- **Critical architectural principles** (single source of truth, no derived data storage)
- Common development tasks
- Debugging guides
- Project status and roadmap

**When to use:** Daily development, understanding architecture, troubleshooting

---

#### [`DOCUMENTATION_INDEX.md`](./DOCUMENTATION_INDEX.md) (this file)
**Purpose:** Navigation hub for all documentation
**Audience:** Everyone
**Contents:** You're reading it!

**When to use:** Finding the right documentation for your task

---

### `docs/` Directory (Deployment & Setup)

#### [`docs/SETUP.md`](./docs/SETUP.md)
**Purpose:** Detailed deployment and GitHub Actions setup
**Audience:** DevOps, deployment engineers
**Contents:**
- GitHub Actions configuration (ETL, trading, settlement workflows)
- Repository secrets setup (APCA_API_KEY_ID, APCA_API_SECRET_KEY, DATABASE_URL)
- Dashboard deployment
- Manual workflow testing
- System monitoring
- Production deployment to Vercel
- Troubleshooting automation issues

**When to use:** Setting up GitHub Actions, deploying to production

---

#### [`docs/DEPLOYMENT_CHECKLIST.md`](./docs/DEPLOYMENT_CHECKLIST.md)
**Purpose:** Step-by-step deployment verification
**Audience:** Anyone deploying changes
**Contents:**
- Pre-migration checks
- Apply migration steps
- Testing procedures
- Commit guidelines
- Post-deployment monitoring
- Rollback procedures
- Success criteria

**When to use:** Before/after applying database migrations or major changes

---

### `infra/migrations/` Directory (Database Migrations)

#### [`infra/migrations/README.md`](./infra/migrations/README.md)
**Purpose:** Database migration guide and architectural notes
**Audience:** Database administrators, developers
**Contents:**
- Migration summary (paper_bankroll table → view)
- Problem/solution explanation
- Detailed changelog
- How to apply migrations
- Performance notes
- Rollback procedures
- Architectural principles (why views > tables for derived data)
- Files modified list

**When to use:** Applying database migrations, understanding schema changes

---

#### [`infra/migrations/0001_init.sql`](./infra/migrations/0001_init.sql)
**Purpose:** Initial database schema
**Contents:**
- 11 tables (stocks, price_snapshots, technical_indicators, paper_trades, etc.)
- Views (active_positions, daily_pnl)
- Functions (calculate_win_rate)
- Triggers (auto-update timestamps)
- Sample data (commented out)

---

#### [`infra/migrations/0002_bankroll_to_view.sql`](./infra/migrations/0002_bankroll_to_view.sql)
**Purpose:** Convert paper_bankroll from table to dynamic view
**Contents:**
- Drop table, create view
- Balance calculation from paper_trades
- Migration notes and rationale
- Rollback instructions

#### [`infra/migrations/0004_remove_alpha_vantage_artifacts.sql`](./infra/migrations/0004_remove_alpha_vantage_artifacts.sql)
**Purpose:** Remove deprecated Alpha Vantage logging table
**Contents:**
- Drop `api_usage_log`
- Migration rationale (Alpaca Market Data is sole provider)
- Notes for applying the cleanup

---

### `ops/scripts/` Directory (Operational Scripts)

#### [`ops/scripts/market_data_etl.py`](./ops/scripts/market_data_etl.py)
**Purpose:** Fetch stock data from Alpaca Market Data
**Usage:** `python ops/scripts/market_data_etl.py --symbols AAPL,MSFT`

---

#### [`ops/scripts/rl_trading_agent.py`](./ops/scripts/rl_trading_agent.py)
**Purpose:** Q-Learning trading agent
**Usage:** `python ops/scripts/rl_trading_agent.py --exploit`

---

#### [`ops/scripts/settle_trades.py`](./ops/scripts/settle_trades.py)
**Purpose:** Close positions at end of day
**Usage:** `python ops/scripts/settle_trades.py`

---

#### [`ops/scripts/verify_data_integrity.py`](./ops/scripts/verify_data_integrity.py)
**Purpose:** Verify database consistency (5 integrity checks)
**Usage:** `python ops/scripts/verify_data_integrity.py`

---

#### [`ops/scripts/apply_migration.sh`](./ops/scripts/apply_migration.sh)
**Purpose:** Automated database migration with verification
**Usage:** `./ops/scripts/apply_migration.sh`

---

### `apps/dashboard/` Directory (Frontend)

#### [`apps/dashboard/README.md`](./apps/dashboard/README.md)
**Purpose:** Dashboard-specific documentation
**Audience:** Frontend developers
**Contents:**
- Setup instructions
- Pages overview (/, /trades, /performance, /agent)
- Architecture (Next.js 14, TypeScript, Tailwind)
- Database connection (read-only)
- Development tips

**When to use:** Working on the Next.js dashboard

---

## 📖 How to Use This Documentation

### For New Developers:

1. **Start with** [`README.md`](./README.md) - Understand the project and get it running
2. **Read** [`CLAUDE.md`](./CLAUDE.md) - Learn architecture, commands, and critical rules
3. **Reference** [`docs/SETUP.md`](./docs/SETUP.md) - Set up GitHub Actions automation
4. **Explore** `apps/dashboard/README.md` - Understand the dashboard

### For Active Development:

1. **Quick reference:** [`CLAUDE.md`](./CLAUDE.md) - Commands, architecture, troubleshooting
2. **Database changes:** `infra/migrations/README.md` - Migration guide
3. **Verification:** `ops/scripts/verify_data_integrity.py` - Run integrity checks

### For Deployment:

1. **Setup automation:** [`docs/SETUP.md`](./docs/SETUP.md) - GitHub Actions configuration
2. **Migration checklist:** [`docs/DEPLOYMENT_CHECKLIST.md`](./docs/DEPLOYMENT_CHECKLIST.md) - Pre/post steps
3. **Apply migration:** `ops/scripts/apply_migration.sh` - Automated migration script

### For Database Work:

1. **Schema reference:** `infra/migrations/0001_init.sql` - Complete database schema
2. **Migration guide:** `infra/migrations/README.md` - How to apply changes
3. **Integrity checks:** `ops/scripts/verify_data_integrity.py` - Verify consistency

---

## 🔍 Quick Lookup Table

| Need to... | See Document | Section |
|-----------|--------------|---------|
| Install and run project | `README.md` | Quick Start |
| Run ETL/trading/dashboard | `CLAUDE.md` | Essential Commands |
| Understand architecture | `CLAUDE.md` | Architecture |
| Add new stock symbol | `CLAUDE.md` | Common Development Tasks |
| Debug no trades | `CLAUDE.md` | Common Issues & Solutions |
| Set up GitHub Actions | `docs/SETUP.md` | GitHub Actions Setup |
| Apply database migration | `ops/scripts/apply_migration.sh` | Run the script |
| Understand migration changes | `infra/migrations/README.md` | Summary section |
| Verify data integrity | Terminal | `python ops/scripts/verify_data_integrity.py` |
| Deploy to production | `docs/SETUP.md` | Production Deployment |
| Troubleshoot API quota | `README.md` | Troubleshooting |
| Configure environment | `README.md` or `CLAUDE.md` | Configuration |
| Review Q-Learning logic | `README.md` | Q-Learning Implementation |
| Check database schema | `infra/migrations/0001_init.sql` | Full schema |
| Work on dashboard | `apps/dashboard/README.md` | Setup and architecture |

---

## 🗂️ Archived/Removed Documentation

The following files were removed to reduce root directory clutter (now in proper locations):

- ~~`SETUP.md`~~ → Moved to `docs/SETUP.md`
- ~~`DEPLOYMENT_CHECKLIST.md`~~ → Moved to `docs/DEPLOYMENT_CHECKLIST.md`
- ~~`MIGRATION_NOTES.md`~~ → Moved to `infra/migrations/README.md`
- ~~`apply_migration.sh`~~ → Moved to `ops/scripts/apply_migration.sh`
- ~~`fix_bankroll.sql`~~ → Deleted (hardcoded fix, replaced with proper architecture)
- ~~`docs/planning/`~~ → Deleted (duplicate CLAUDE.md, outdated files)
- ~~`claude/`~~ → Deleted (empty folder)

---

## 📝 Documentation Maintenance

### When to Update:

- **`README.md`**: After major features, tech stack changes, or installation process changes
- **`CLAUDE.md`**: After architectural changes, new critical rules, or significant refactoring
- **`docs/SETUP.md`**: After GitHub Actions workflow changes or deployment process updates
- **`infra/migrations/README.md`**: After new database migrations
- **`DOCUMENTATION_INDEX.md`**: After adding/removing/moving documentation files

### Update Frequency:

- `README.md`: As needed (major changes only)
- `CLAUDE.md`: Weekly during active development, monthly during maintenance
- `docs/SETUP.md`: After workflow/deployment changes
- `infra/migrations/README.md`: After each migration
- `DOCUMENTATION_INDEX.md`: After documentation structure changes

---

## 🎯 Current Status Summary

**System:** Core complete, automated trading active
**Database:** Dynamic view architecture (paper_bankroll calculated from paper_trades)
**Documentation:** ✅ Organized and consolidated (3 root docs + subdirectories)
**Code Quality:** ✅ Clean, idempotent operations, single source of truth
**Recent Changes:**
  - ✅ Documentation reorganization (Oct 18, 2025)
  - ✅ Database migration: table → view (Oct 18, 2025)
  - ✅ Architectural principle: Never store derived data

**Next Steps:**
  - Unit tests for RL agent
  - Performance analysis tools
  - Dashboard enhancements (AI decision log viewer)

---

**Document Version:** 1.0
**Last Updated:** October 18, 2025
**Maintained by:** Dylan Suhr
