# Market-Edge Makefile
# Convenient shortcuts for common operations

# Load environment variables from .env file if it exists
ifneq (,$(wildcard .env))
    include .env
    export
endif

.PHONY: help install etl trade settle dashboard db-migrate db-ping verify clean

# Default target
help:
	@echo "Market-Edge - AI Day Trading System"
	@echo ""
	@echo "Available commands:"
	@echo "  make install      - Install all dependencies (Python + Node.js)"
	@echo "  make etl          - Run market data ETL"
	@echo "  make trade        - Run RL trading agent"
	@echo "  make settle       - Settle open positions"
	@echo "  make dashboard    - Start Next.js dashboard"
	@echo "  make db-migrate   - Run database migrations"
	@echo "  make db-ping      - Test database connection"
	@echo "  make verify       - Verify system setup"
	@echo "  make clean        - Clean temporary files"

# Install dependencies
install:
	@echo "Installing Python dependencies..."
	pip install -r requirements.txt
	@echo "Installing Node.js dependencies..."
	cd apps/dashboard && npm install
	@echo "✓ All dependencies installed"

# Run market data ETL
etl:
	@echo "Running market data ETL..."
	python ops/scripts/market_data_etl.py

# Run RL trading agent
trade:
	@echo "Running RL trading agent..."
	python ops/scripts/rl_trading_agent.py

# Settle open positions
settle:
	@echo "Settling open positions..."
	python ops/scripts/settle_trades.py

# Start dashboard
dashboard:
	@echo "Starting Next.js dashboard..."
	cd apps/dashboard && npm run dev

# Run database migrations
db-migrate:
	@echo "Running database migrations..."
	@echo "→ Applying 0001_init.sql..."
	@psql "$(DATABASE_URL)" -f infra/migrations/0001_init.sql
	@echo "→ Applying 0002_bankroll_to_view.sql..."
	@psql "$(DATABASE_URL)" -f infra/migrations/0002_bankroll_to_view.sql
	@echo "→ Applying 0004_remove_alpha_vantage_artifacts.sql..."
	@psql "$(DATABASE_URL)" -f infra/migrations/0004_remove_alpha_vantage_artifacts.sql
	@echo "→ Applying 0005_market_value_views.sql..."
	@psql "$(DATABASE_URL)" -f infra/migrations/0005_market_value_views.sql
	@echo "→ Applying 0006_setup_readonly_user.sql..."
	@psql "$(DATABASE_URL)" -f infra/migrations/0006_setup_readonly_user.sql
	@echo "✓ All migrations applied successfully"

# Setup read-only user (separate command for convenience)
db-setup-readonly:
	@echo "Setting up read-only database user..."
	@psql "$(DATABASE_URL)" -f infra/migrations/0006_setup_readonly_user.sql
	@echo "✓ Read-only user configured"

# Test database connection
db-ping:
	@echo "Testing database connection..."
	psql $(DATABASE_URL) -c "SELECT 'Database connection successful!' as status;"

# Verify system setup
verify:
	@echo "Verifying system setup..."
	@echo ""
	@echo "1. Checking environment variables..."
	@test -n "$(DATABASE_URL)" || (echo "✗ DATABASE_URL not set" && exit 1)
	@test -n "$(POLYGON_API_KEY)" || (echo "✗ POLYGON_API_KEY not set" && exit 1)
	@echo "✓ Environment variables set"
	@echo ""
	@echo "2. Checking database connection..."
	@psql $(DATABASE_URL) -c "SELECT 1;" > /dev/null 2>&1 || (echo "✗ Database connection failed" && exit 1)
	@echo "✓ Database connected"
	@echo ""
	@echo "3. Checking Python packages..."
	@python -c "import psycopg2, requests, numpy" || (echo "✗ Python packages missing" && exit 1)
	@echo "✓ Python packages installed"
	@echo ""
	@echo "✓ System ready!"

# Clean temporary files
clean:
	@echo "Cleaning temporary files..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
	@echo "✓ Cleaned"
