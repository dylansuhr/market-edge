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
    save_q_table,
    get_db_connection
)
from models.models.ql_agent import QLearningAgent
from providers.alpaca_provider import AlpacaProvider


def get_closing_price(provider: AlpacaProvider, symbol: str) -> float:
    """
    Get closing price for a stock.

    Uses latest completed daily bar from Alpaca Market Data.

    Args:
        provider: Alpaca provider
        symbol: Stock ticker

    Returns:
        Closing price

    Raises:
        Exception: If price cannot be fetched
    """
    try:
        # Use latest daily bar (includes current day's close after market close)
        prev_close = provider.get_previous_close(symbol)
        return prev_close['close']
    except Exception as e:
        raise Exception(f"Failed to get closing price for {symbol}: {str(e)}")


def settle_position(
    provider: AlpacaProvider,
    position: Dict
) -> Dict:
    """
    Settle a single open position.

    Args:
        provider: Alpaca provider
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

        # Close position in database (synthetic SELL with realized P&L)
        pnl = close_position(stock_id, exit_price, datetime.now())
        pnl_pct = (pnl / (float(entry_price) * quantity)) * 100 if quantity > 0 else 0.0
        print(f"  P&L: ${pnl:+.2f} ({pnl_pct:+.2f}%)")

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


def decay_all_agents():
    """
    Decay exploration rate for ALL stock agents at end of day.

    CRITICAL FIX: Previously, finish_episode() was only called when
    positions existed at settlement. This meant exploration rate never
    decayed if all positions were closed during market hours.

    Now we ensure EVERY stock's agent gets exploration decay EVERY day,
    regardless of position status.
    """
    print("\n" + "=" * 60)
    print("DECAYING EXPLORATION RATES (ALL STOCKS)")
    print("=" * 60)

    try:
        # Get all stocks from database
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT stock_id, symbol
            FROM stocks
            WHERE symbol != '...'
            ORDER BY symbol
        """)
        all_stocks = cur.fetchall()
        conn.close()

        print(f"Processing {len(all_stocks)} stocks...")

        decayed_count = 0
        skipped_count = 0

        for stock_id, symbol in all_stocks:
            try:
                q_table = load_q_table(stock_id)
                if q_table:
                    agent = QLearningAgent.load(q_table)
                    old_epsilon = agent.exploration_rate

                    # Decay exploration rate (increments episode counter)
                    agent.finish_episode()
                    save_q_table(stock_id, agent.save())

                    new_epsilon = agent.exploration_rate
                    episodes = agent.total_episodes

                    print(f"  [{symbol}] ε: {old_epsilon:.4f} → {new_epsilon:.4f} (episode {episodes})")
                    decayed_count += 1
                else:
                    print(f"  [{symbol}] No Q-table found (agent not initialized yet)")
                    skipped_count += 1

            except Exception as e:
                print(f"  [{symbol}] ⚠️ Error: {str(e)}")
                skipped_count += 1

        print(f"\n✓ Decayed: {decayed_count} stocks")
        if skipped_count > 0:
            print(f"⚠ Skipped: {skipped_count} stocks")

    except Exception as e:
        print(f"✗ Failed to decay exploration rates: {str(e)}")
        import traceback
        traceback.print_exc()


def main():
    """Main settlement execution."""
    print("=" * 60)
    print("TRADE SETTLEMENT")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Initialize provider
    try:
        provider = AlpacaProvider()
        print("✓ Alpaca Market Data provider initialized")
    except Exception as e:
        print(f"✗ Failed to initialize provider: {str(e)}")
        sys.exit(1)

    # Get open positions
    positions = get_active_positions()
    print(f"\n📊 Open positions: {len(positions)}")

    # SETTLEMENT: Close any open positions at market close price
    if not positions:
        print("  No positions to settle (all closed during market hours)")
    else:

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
        print("SETTLEMENT SUMMARY")
        print(f"  Positions settled: {total_settled}/{len(positions)}")
        print(f"  Winning trades: {winning_trades}/{total_settled}")
        print(f"  Total P&L: ${total_pnl:+.2f}")
        print(f"  Bankroll after: ${new_balance:.2f}")

        if total_settled > 0:
            win_rate = (winning_trades / total_settled) * 100
            print(f"  Win rate: {win_rate:.1f}%")
        print("=" * 60)

    # CRITICAL: Decay exploration for ALL stocks (not just those with positions)
    # This ensures learning progresses even when positions close during market hours
    decay_all_agents()

    # Final summary
    print("\n" + "=" * 60)
    print("SETTLEMENT COMPLETE")
    print("=" * 60)


if __name__ == '__main__':
    main()
