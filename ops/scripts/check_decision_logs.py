#!/usr/bin/env python3
"""
Quick script to check decision log counts and recent entries.
"""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add packages/shared to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'packages'))

from shared.shared.db import get_cursor

def main():
    with get_cursor() as cur:
        # Count decision logs
        cur.execute('SELECT COUNT(*) as count FROM trade_decisions_log')
        result = cur.fetchone()
        print(f'Decision log entries: {result["count"]}')

        # Get recent decisions if any
        cur.execute('''
            SELECT symbol, action, timestamp, was_executed, was_random
            FROM trade_decisions_log
            JOIN stocks USING (stock_id)
            ORDER BY timestamp DESC
            LIMIT 10
        ''')
        recent = cur.fetchall()
        if recent:
            print('\nRecent decisions:')
            for row in recent:
                status = "EXECUTED" if row["was_executed"] else "SKIPPED"
                random = " (EXPLORE)" if row["was_random"] else ""
                print(f'  {row["timestamp"]}: {row["symbol"]} -> {row["action"]} [{status}]{random}')
        else:
            print('\nNo decision logs found')

        # Count paper trades for comparison
        cur.execute('SELECT COUNT(*) as count FROM paper_trades')
        trades = cur.fetchone()
        print(f'\nPaper trades: {trades["count"]}')

        # Check recent paper trades
        cur.execute('''
            SELECT symbol, action, executed_at
            FROM paper_trades
            JOIN stocks USING (stock_id)
            ORDER BY executed_at DESC
            LIMIT 5
        ''')
        recent_trades = cur.fetchall()
        if recent_trades:
            print('\nRecent paper trades:')
            for row in recent_trades:
                print(f'  {row["executed_at"]}: {row["symbol"]} -> {row["action"]}')

if __name__ == '__main__':
    main()
