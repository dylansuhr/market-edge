"""
Trade Settlement Script

Runs at market close (4:05 PM ET) to:
1. Close all open positions at market close price
2. Calculate profit/loss for each trade
3. Update paper bankroll
4. Train RL agents on day's experiences

This implements the "intraday only" strategy - no overnight positions.

Usage:
    python ops/scripts/settle_trades.py
"""

import sys
import os
from datetime import datetime
from typing import List, Dict
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add packages to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'packages'))

from shared.shared.db import (
    get_active_positions,
    close_position,
    get_paper_bankroll,
    get_recent_prices,
    load_q_table,
    save_q_table
)
from models.models.ql_agent import QLearningAgent
from providers.polygon_provider import PolygonProvider


def get_closing_price(provider: PolygonProvider, symbol: str) -> float:
    """
    Get closing price for a stock.

    Uses previous day's close (free tier compatible endpoint).

    Args:
        provider: Polygon.io provider
        symbol: Stock ticker

    Returns:
        Closing price

    Raises:
        Exception: If price cannot be fetched
    """
    try:
        # Use previous close endpoint (free tier compatible)
        prev_close = provider.get_previous_close(symbol)
        return prev_close['close']
    except Exception as e:
        raise Exception(f"Failed to get closing price for {symbol}: {str(e)}")


def calculate_trade_pnl(
    entry_price: float,
    exit_price: float,
    quantity: int,
    action: str
) -> float:
    """
    Calculate profit/loss for a trade.

    Args:
        entry_price: Purchase price
        exit_price: Selling price
        quantity: Number of shares
        action: 'BUY' (long) or 'SELL' (short)

    Returns:
        Profit/loss (positive = profit, negative = loss)
    """
    if action == 'BUY':
        # Long position: profit when price rises
        pnl = (exit_price - entry_price) * quantity
    else:
        # Short position: profit when price falls
        pnl = (entry_price - exit_price) * quantity

    return pnl


def settle_position(
    provider: PolygonProvider,
    position: Dict
) -> Dict:
    """
    Settle a single open position.

    Args:
        provider: Polygon.io provider
        position: Position dictionary from database

    Returns:
        Settlement result dictionary
    """
    symbol = position['symbol']
    stock_id = position['stock_id']
    quantity = position['quantity']
    entry_price = position['avg_entry_price']

    print(f"\n[{symbol}]")
    print(f"  Position: {quantity} shares @ ${entry_price:.2f}")

    try:
        # Get closing price
        exit_price = get_closing_price(provider, symbol)
        print(f"  Closing price: ${exit_price:.2f}")

        # Calculate P&L
        pnl = calculate_trade_pnl(entry_price, exit_price, quantity, 'BUY')
        pnl_pct = (pnl / (entry_price * quantity)) * 100

        print(f"  P&L: ${pnl:+.2f} ({pnl_pct:+.2f}%)")

        # Close position in database
        close_position(stock_id, exit_price, datetime.now())

        # Update RL agent (reward signal)
        try:
            q_table = load_q_table(stock_id)
            if q_table:
                agent = QLearningAgent.load(q_table)

                # Reward is the profit/loss
                # Positive reward = agent learns to repeat this behavior
                # Negative reward = agent learns to avoid this behavior
                # Note: Actual Q-value update happens in real-time during trading
                # This is just for end-of-day episode closure

                agent.finish_episode()  # Decay exploration rate
                save_q_table(stock_id, agent.save())

                stats = agent.get_stats()
                print(f"  Agent updated: ε={stats['exploration_rate']:.4f}, episodes={stats['total_episodes']}")
        except Exception as e:
            print(f"  ⚠️ Failed to update agent: {str(e)}")

        return {
            'symbol': symbol,
            'pnl': pnl,
            'pnl_pct': pnl_pct,
            'success': True
        }

    except Exception as e:
        print(f"  ✗ Settlement failed: {str(e)}")
        return {
            'symbol': symbol,
            'pnl': 0.0,
            'pnl_pct': 0.0,
            'success': False,
            'error': str(e)
        }


def main():
    """Main settlement execution."""
    print("=" * 60)
    print("TRADE SETTLEMENT")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Initialize provider
    try:
        provider = PolygonProvider()
        print("✓ Polygon.io provider initialized")
    except Exception as e:
        print(f"✗ Failed to initialize provider: {str(e)}")
        sys.exit(1)

    # Get open positions
    positions = get_active_positions()
    print(f"\n📊 Open positions: {len(positions)}")

    if not positions:
        print("  No positions to settle")
        print("\n" + "=" * 60)
        print("SETTLEMENT COMPLETE (no positions)")
        print("=" * 60)
        return

    # Get current bankroll
    bankroll_before = get_paper_bankroll()
    print(f"💰 Bankroll before: ${bankroll_before['balance']:.2f}")

    # Settle each position
    results = []
    for position in positions:
        result = settle_position(provider, position)
        results.append(result)

    # Calculate total P&L
    total_pnl = sum(r['pnl'] for r in results if r['success'])
    winning_trades = sum(1 for r in results if r['success'] and r['pnl'] > 0)
    total_settled = sum(1 for r in results if r['success'])

    # Bankroll is automatically updated via paper_bankroll VIEW (no manual update needed)
    # Balance calculated from: starting_cash - BUY_total + SELL_total
    new_balance = get_paper_bankroll()['balance']

    # Summary
    print("\n" + "=" * 60)
    print("SETTLEMENT COMPLETE")
    print(f"  Positions settled: {total_settled}/{len(positions)}")
    print(f"  Winning trades: {winning_trades}/{total_settled}")
    print(f"  Total P&L: ${total_pnl:+.2f}")
    print(f"  Bankroll after: ${new_balance:.2f}")

    if total_settled > 0:
        win_rate = (winning_trades / total_settled) * 100
        print(f"  Win rate: {win_rate:.1f}%")

    print("=" * 60)


if __name__ == '__main__':
    main()
