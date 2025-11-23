#!/usr/bin/env python3
"""
Exploration Monitoring Report

Aggregates decision log data to show exploration vs exploitation rates,
episode counts, and ROI correlations for quick health checks.
"""

import sys
import os
import argparse
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'packages'))

from shared.shared.db import get_cursor, get_paper_bankroll  # noqa: E402


def fetch_decision_metrics(days: int):
    cutoff = datetime.now() - timedelta(days=days)
    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT
                DATE(tdl.timestamp) AS decision_day,
                s.symbol,
                COUNT(*) AS total_decisions,
                SUM(CASE WHEN was_random THEN 1 ELSE 0 END) AS random_decisions,
                SUM(CASE WHEN was_executed THEN 1 ELSE 0 END) AS executed_decisions
            FROM trade_decisions_log tdl
            JOIN stocks s ON s.stock_id = tdl.stock_id
            WHERE tdl.timestamp >= %s
            GROUP BY decision_day, s.symbol
            ORDER BY decision_day DESC, s.symbol
            """,
            (cutoff,)
        )
        return cur.fetchall()


def fetch_agent_stats():
    stats = {}
    with get_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT
                s.symbol,
                rms.hyperparameters
            FROM rl_model_states rms
            JOIN stocks s ON s.stock_id = rms.stock_id
            WHERE rms.model_type = 'Q_LEARNING'
        """
        )
        rows = cur.fetchall()
        for row in rows:
            hyper = row['hyperparameters'] or {}
            stats[row['symbol']] = {
                'episodes': int(hyper.get('total_episodes', 0)),
                'epsilon': float(hyper.get('exploration_rate', 1.0)),
                'decay': float(hyper.get('exploration_decay', 0.99))
            }
    return stats


def print_report(decision_rows, agent_stats, bankroll):
    if not decision_rows:
        print("No trade decisions found for the selected window.")
        return

    current_day = None
    for row in decision_rows:
        day = row['decision_day']
        if current_day != day:
            print("\n" + "=" * 40)
            print(f"📅 {day}")
            print("=" * 40)
            current_day = day

        symbol = row['symbol']
        total = row['total_decisions']
        random_decisions = row['random_decisions']
        executed = row['executed_decisions']
        percent_random = (random_decisions / total * 100) if total else 0

        agent = agent_stats.get(symbol, {})
        episodes = agent.get('episodes', 0)
        epsilon = agent.get('epsilon', 1.0)
        decay = agent.get('decay', 0.99)

        print(
            f"{symbol:<6} | decisions: {total:>4} "
            f"(explore {percent_random:5.1f}%) "
            f"| executed: {executed:>4} | episodes: {episodes:>5} "
            f"| ε={epsilon:0.3f} decay={decay:0.3f}"
        )

    print("\n" + "=" * 40)
    print(f"Bankroll snapshot: ${bankroll['balance']:.2f}")
    print(f"ROI: {bankroll['roi']:.2f}% | Win rate: {bankroll['win_rate']:.2f}%")
    print("=" * 40)


def main():
    parser = argparse.ArgumentParser(description="Exploration monitoring report")
    parser.add_argument('--days', type=int, default=3, help='Lookback window in days')
    args = parser.parse_args()

    decision_rows = fetch_decision_metrics(args.days)
    agent_stats = fetch_agent_stats()
    bankroll = get_paper_bankroll()

    print_report(decision_rows, agent_stats, bankroll)


if __name__ == '__main__':
    sys.exit(main())
