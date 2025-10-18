"""
Data Integrity Verification Script

Verifies database consistency and data integrity across all tables.
Run this before/after deployments or when debugging data issues.

Usage:
    python ops/scripts/verify_data_integrity.py
"""

import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add packages to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'packages'))

from shared.shared.db import get_cursor


def check_paper_bankroll_consistency():
    """
    Verify paper_bankroll view calculates correctly from paper_trades.

    This check ensures the dynamic calculation matches what we expect.
    """
    print("\n[1/5] Checking paper_bankroll view consistency...")

    with get_cursor(commit=False) as cur:
        # Get balance from view
        cur.execute("SELECT balance, total_trades, winning_trades, total_pnl, roi FROM paper_bankroll")
        result = cur.fetchone()

        if not result:
            print("  ✗ Error: paper_bankroll view returned no data")
            return False

        view_balance = float(result['balance'])
        view_total_trades = result['total_trades']
        view_winning_trades = result['winning_trades']
        view_total_pnl = float(result['total_pnl'])
        view_roi = float(result['roi'])

        # Calculate balance manually from trades
        cur.execute("""
            SELECT
                COALESCE(SUM(quantity * price), 0) as total_spent
            FROM paper_trades
            WHERE action = 'BUY'
        """)
        total_spent = float(cur.fetchone()['total_spent'])

        cur.execute("""
            SELECT
                COALESCE(SUM(quantity * price), 0) as total_received
            FROM paper_trades
            WHERE action = 'SELL'
        """)
        total_received = float(cur.fetchone()['total_received'])

        expected_balance = 10000.00 - total_spent + total_received

        # Verify balance matches
        if abs(view_balance - expected_balance) < 0.01:  # Allow for rounding
            print(f"  ✓ Balance correct: ${view_balance:.2f}")
        else:
            print(f"  ✗ Balance mismatch!")
            print(f"    View reports: ${view_balance:.2f}")
            print(f"    Expected: ${expected_balance:.2f}")
            print(f"    Discrepancy: ${view_balance - expected_balance:.2f}")
            return False

        # Verify trade counts
        cur.execute("SELECT COUNT(*) as count FROM paper_trades WHERE status = 'CLOSED'")
        expected_total_trades = cur.fetchone()['count']

        if view_total_trades == expected_total_trades:
            print(f"  ✓ Total trades correct: {view_total_trades}")
        else:
            print(f"  ✗ Total trades mismatch: {view_total_trades} vs {expected_total_trades}")
            return False

        print(f"  ✓ ROI: {view_roi:.4%}")
        print(f"  ✓ Total P&L: ${view_total_pnl:.2f}")

    return True


def check_active_positions():
    """Verify active_positions view is consistent."""
    print("\n[2/5] Checking active positions...")

    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT
                symbol,
                quantity,
                avg_entry_price
            FROM active_positions
        """)
        positions = cur.fetchall()

        if not positions:
            print("  ✓ No active positions")
            return True

        for pos in positions:
            symbol = pos['symbol']
            quantity = pos['quantity']
            avg_price = float(pos['avg_entry_price'])

            if quantity <= 0:
                print(f"  ✗ Invalid quantity for {symbol}: {quantity}")
                return False

            print(f"  ✓ {symbol}: {quantity} shares @ ${avg_price:.2f}")

    return True


def check_q_tables():
    """Verify Q-tables exist for stocks with trades."""
    print("\n[3/5] Checking Q-table persistence...")

    with get_cursor(commit=False) as cur:
        # Get stocks with trades
        cur.execute("""
            SELECT DISTINCT s.stock_id, s.symbol
            FROM stocks s
            JOIN paper_trades pt ON pt.stock_id = s.stock_id
        """)
        stocks_with_trades = cur.fetchall()

        if not stocks_with_trades:
            print("  ✓ No trades yet, Q-tables not expected")
            return True

        # Check if Q-tables exist
        for stock in stocks_with_trades:
            stock_id = stock['stock_id']
            symbol = stock['symbol']

            cur.execute("""
                SELECT q_table, hyperparameters
                FROM rl_model_states
                WHERE stock_id = %s AND model_type = 'Q_LEARNING'
            """, (stock_id,))

            result = cur.fetchone()
            if result:
                print(f"  ✓ {symbol}: Q-table persisted")
            else:
                print(f"  ⚠ {symbol}: No Q-table found (agent may not have learned yet)")

    return True


def check_price_data():
    """Verify price data integrity."""
    print("\n[4/5] Checking price data integrity...")

    with get_cursor(commit=False) as cur:
        # Check for duplicate timestamps
        cur.execute("""
            SELECT stock_id, timestamp, COUNT(*) as count
            FROM price_snapshots
            GROUP BY stock_id, timestamp
            HAVING COUNT(*) > 1
        """)

        duplicates = cur.fetchall()
        if duplicates:
            print(f"  ✗ Found {len(duplicates)} duplicate price snapshots!")
            for dup in duplicates[:5]:  # Show first 5
                print(f"    Stock {dup['stock_id']} at {dup['timestamp']}: {dup['count']} entries")
            return False

        # Check for reasonable price ranges
        cur.execute("""
            SELECT
                s.symbol,
                MIN(ps.close) as min_price,
                MAX(ps.close) as max_price
            FROM price_snapshots ps
            JOIN stocks s ON s.stock_id = ps.stock_id
            GROUP BY s.symbol
        """)

        price_ranges = cur.fetchall()
        for pr in price_ranges:
            symbol = pr['symbol']
            min_price = float(pr['min_price'])
            max_price = float(pr['max_price'])

            # Sanity check: prices should be positive and reasonable
            if min_price <= 0 or max_price > 100000:
                print(f"  ✗ Suspicious price range for {symbol}: ${min_price:.2f} - ${max_price:.2f}")
                return False

        print(f"  ✓ No duplicate timestamps found")
        print(f"  ✓ Price ranges look reasonable")

    return True


def check_trade_integrity():
    """Verify trade data integrity."""
    print("\n[5/5] Checking trade integrity...")

    with get_cursor(commit=False) as cur:
        # Check for orphaned trades (stock_id doesn't exist)
        cur.execute("""
            SELECT COUNT(*) as count
            FROM paper_trades pt
            WHERE NOT EXISTS (
                SELECT 1 FROM stocks s WHERE s.stock_id = pt.stock_id
            )
        """)

        orphaned = cur.fetchone()['count']
        if orphaned > 0:
            print(f"  ✗ Found {orphaned} orphaned trades (invalid stock_id)")
            return False

        # Check for negative quantities
        cur.execute("""
            SELECT COUNT(*) as count
            FROM paper_trades
            WHERE quantity <= 0
        """)

        invalid_qty = cur.fetchone()['count']
        if invalid_qty > 0:
            print(f"  ✗ Found {invalid_qty} trades with invalid quantity")
            return False

        # Check for negative prices
        cur.execute("""
            SELECT COUNT(*) as count
            FROM paper_trades
            WHERE price <= 0
        """)

        invalid_price = cur.fetchone()['count']
        if invalid_price > 0:
            print(f"  ✗ Found {invalid_price} trades with invalid price")
            return False

        print("  ✓ No orphaned trades")
        print("  ✓ All quantities are positive")
        print("  ✓ All prices are positive")

    return True


def main():
    """Run all integrity checks."""
    print("=" * 60)
    print("DATA INTEGRITY VERIFICATION")
    print("=" * 60)

    checks = [
        check_paper_bankroll_consistency,
        check_active_positions,
        check_q_tables,
        check_price_data,
        check_trade_integrity
    ]

    results = []
    for check in checks:
        try:
            result = check()
            results.append(result)
        except Exception as e:
            print(f"  ✗ Error: {str(e)}")
            results.append(False)

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    passed = sum(results)
    total = len(results)

    if all(results):
        print(f"✅ All checks passed ({passed}/{total})")
        print("\nDatabase integrity verified!")
        return 0
    else:
        print(f"❌ Some checks failed ({passed}/{total})")
        print("\nPlease review errors above and fix data inconsistencies.")
        return 1


if __name__ == '__main__':
    sys.exit(main())
