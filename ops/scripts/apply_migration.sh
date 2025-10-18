#!/bin/bash

# Apply paper_bankroll migration
# Converts table to dynamic view

set -e  # Exit on error

echo "=========================================="
echo "Applying paper_bankroll Migration"
echo "=========================================="

# Load environment variables
if [ -f .env ]; then
    echo "✓ Loading .env file..."
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ .env file not found!"
    echo "Please create .env from .env.example"
    exit 1
fi

# Check DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set in .env"
    echo "Please add DATABASE_URL to your .env file"
    exit 1
fi

echo "✓ DATABASE_URL configured"

# Test database connection
echo ""
echo "Testing database connection..."
if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✓ Database connection successful"
else
    echo "❌ Cannot connect to database"
    echo "Please check your DATABASE_URL"
    exit 1
fi

# Show current state
echo ""
echo "Current paper_bankroll state:"
psql "$DATABASE_URL" -c "SELECT balance, total_trades, roi FROM paper_bankroll;" 2>/dev/null || echo "  (Not yet initialized or already migrated)"

# Ask for confirmation
echo ""
read -p "Apply migration? This will convert paper_bankroll table to view. (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled"
    exit 0
fi

# Apply migration
echo ""
echo "Applying migration..."
psql "$DATABASE_URL" -f infra/migrations/0002_bankroll_to_view.sql

# Verify migration
echo ""
echo "Verifying migration..."
psql "$DATABASE_URL" -c "
    SELECT
        CASE
            WHEN table_type = 'VIEW' THEN '✓ paper_bankroll is now a VIEW'
            WHEN table_type = 'BASE TABLE' THEN '❌ paper_bankroll is still a TABLE'
            ELSE '? Unknown state'
        END as status
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'paper_bankroll';
"

# Show new state
echo ""
echo "New paper_bankroll state (calculated from trades):"
psql "$DATABASE_URL" -c "SELECT balance, total_trades, winning_trades, total_pnl, roi FROM paper_bankroll;"

# Run integrity checks
echo ""
echo "=========================================="
echo "Running Data Integrity Checks"
echo "=========================================="
python ops/scripts/verify_data_integrity.py

echo ""
echo "=========================================="
echo "Migration Complete!"
echo "=========================================="
echo ""
echo "✅ paper_bankroll is now a dynamic view"
echo "✅ Balance calculated from paper_trades"
echo "✅ No more manual fixes needed"
echo ""
echo "Next steps:"
echo "  1. Test trading agent: make trade"
echo "  2. Test dashboard: make dashboard"
echo "  3. Commit changes: git add . && git commit"
