#!/usr/bin/env python3
"""
Test script to verify BUY→SELL cycle and P&L accounting.
"""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add packages/shared to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'packages' / 'shared'))

from shared.db import get_cursor

def main():
    with get_cursor() as cur:
        print("=" * 60)
        print("TRADE CYCLE VERIFICATION")
        print("=" * 60)

        # Check recent trades
        print("\n1. Recent Paper Trades (showing P&L structure):")
        cur.execute('''
            SELECT
                t.trade_id,
                s.symbol,
                t.action,
                t.quantity,
                t.price,
                t.status,
                t.profit_loss,
                t.executed_at
            FROM paper_trades t
            JOIN stocks s USING (stock_id)
            ORDER BY t.executed_at DESC
            LIMIT 15
        ''')
        trades = cur.fetchall()

        for trade in trades:
            pnl_str = f"${trade['profit_loss']:.2f}" if trade['profit_loss'] is not None else "NULL"
            print(f"  [{trade['trade_id']}] {trade['symbol']} {trade['action']} "
                  f"{trade['quantity']} @ ${trade['price']:.2f} | "
                  f"Status: {trade['status']} | P&L: {pnl_str}")

        # Check for any BUY trades with profit_loss set (should be NULL)
        print("\n2. BUY Trades with P&L Set (should be empty - BUG if any):")
        cur.execute('''
            SELECT trade_id, stock_id, action, status, profit_loss
            FROM paper_trades
            WHERE action = 'BUY' AND profit_loss IS NOT NULL
        ''')
        bad_buys = cur.fetchall()

        if bad_buys:
            print("  ⚠️ FOUND BUG: BUY trades should NOT have profit_loss set!")
            for trade in bad_buys:
                print(f"    Trade {trade['trade_id']}: {trade['action']} "
                      f"{trade['status']} P&L={trade['profit_loss']}")
        else:
            print("  ✅ Good: No BUY trades have P&L set")

        # Check open positions
        print("\n3. Open Positions:")
        cur.execute('''
            SELECT
                s.symbol,
                t.quantity,
                t.price AS entry_price,
                t.executed_at
            FROM paper_trades t
            JOIN stocks s USING (stock_id)
            WHERE t.action = 'BUY' AND t.status = 'OPEN'
            ORDER BY t.executed_at DESC
        ''')
        open_pos = cur.fetchall()

        if open_pos:
            for pos in open_pos:
                print(f"  {pos['symbol']}: {pos['quantity']} shares @ "
                      f"${pos['entry_price']:.2f} (opened {pos['executed_at']})")
        else:
            print("  No open positions")

        # Check bankroll
        print("\n4. Current Bankroll:")
        cur.execute('SELECT * FROM paper_bankroll')
        bankroll = cur.fetchone()
        print(f"  Balance: ${bankroll['balance']:.2f}")
        print(f"  ROI: {bankroll['roi']:.2%}")
        print(f"  Win Rate: {bankroll['win_rate']:.1%}")
        print(f"  Total Trades: {bankroll['total_trades']}")
        print(f"  Winning Trades: {bankroll['winning_trades']}")

        # Check for SELL trades
        print("\n5. Recent SELL Trades (should have P&L):")
        cur.execute('''
            SELECT
                t.trade_id,
                s.symbol,
                t.quantity,
                t.price,
                t.profit_loss,
                t.executed_at
            FROM paper_trades t
            JOIN stocks s USING (stock_id)
            WHERE t.action = 'SELL'
            ORDER BY t.executed_at DESC
            LIMIT 5
        ''')
        sells = cur.fetchall()

        if sells:
            for sell in sells:
                pnl_str = f"${sell['profit_loss']:.2f}" if sell['profit_loss'] is not None else "NULL (BUG!)"
                print(f"  {sell['symbol']} SELL {sell['quantity']} @ ${sell['price']:.2f} | "
                      f"P&L: {pnl_str}")
        else:
            print("  No SELL trades yet")

        print("\n" + "=" * 60)
        print("VERIFICATION COMPLETE")
        print("=" * 60)

if __name__ == '__main__':
    main()
