"""
RL Trading Agent

Runs every 5 min during market hours. Loads market data, makes BUY/SELL/HOLD
decisions via Q-learning, executes paper trades, and updates Q-values.
"""

import sys
import os
import argparse
from datetime import datetime
from typing import Dict, List, Tuple
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'packages'))

from models.models.ql_agent import QLearningAgent
from models.models.state import TradingState
from shared.shared.db import (
    get_stock_id,
    get_recent_prices,
    get_latest_indicators,
    insert_paper_trade,
    get_active_positions,
    get_paper_bankroll,
    get_stock_win_rate,
    save_q_table,
    load_q_table,
    insert_decision_log
)


DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'META', 'AMZN', 'JPM']
MAX_POSITION_SIZE = 25
STARTING_CASH = 100000.0
QUICK_EXIT_THRESHOLD_MINUTES = int(os.getenv('QUICK_EXIT_THRESHOLD', '10'))
LINGERING_THRESHOLD_MINUTES = int(os.getenv('LINGERING_THRESHOLD', '30'))
QUICK_EXIT_BONUS = float(os.getenv('QUICK_EXIT_BONUS', '0.05'))
LINGERING_PENALTY_PER_BLOCK = float(os.getenv('LINGERING_PENALTY', '0.02'))


def get_adaptive_decay_rate(win_rate_percent: float) -> float:
    """Higher win rate = faster decay (more exploitation)."""
    if win_rate_percent >= 50:
        return 0.98
    elif win_rate_percent <= 30:
        return 0.995
    else:
        return 0.99


def load_or_create_agent(stock_id: int) -> QLearningAgent:
    """Load agent from DB or create new one. Each stock has its own Q-table."""
    q_table = load_q_table(stock_id)

    if q_table:
        return QLearningAgent.load(q_table)
    else:
        learning_rate = float(os.getenv('LEARNING_RATE', '0.1'))
        discount_factor = float(os.getenv('DISCOUNT_FACTOR', '0.95'))
        exploration_rate = float(os.getenv('EXPLORATION_RATE', '1.0'))
        exploration_decay = float(os.getenv('EXPLORATION_DECAY', '0.99'))
        min_exploration = float(os.getenv('MIN_EXPLORATION', '0.01'))

        return QLearningAgent(
            learning_rate=learning_rate,
            discount_factor=discount_factor,
            exploration_rate=exploration_rate,
            exploration_decay=exploration_decay,
            min_exploration=min_exploration
        )


def get_current_state(symbol: str, stock_id: int) -> Tuple[TradingState, Dict]:
    """Build trading state from current market data and positions."""
    prices = get_recent_prices(stock_id, limit=100)
    if len(prices) < 50:
        raise Exception(f"Insufficient price data ({len(prices)} bars)")

    indicators = get_latest_indicators(stock_id)
    if 'RSI' not in indicators or 'SMA_50' not in indicators or 'VWAP' not in indicators:
        raise Exception(f"Missing technical indicators")

    positions = get_active_positions()
    bankroll = get_paper_bankroll()
    cash_balance = float(bankroll['balance'])
    total_exposure = 0.0
    position_qty = 0
    position_avg_entry = 0.0
    position_last_trade_time = None

    for pos in positions:
        qty = float(pos['quantity'])
        avg_price = float(pos['avg_entry_price'])
        total_exposure += abs(qty) * avg_price

        if pos['stock_id'] == stock_id:
            position_qty = int(qty)
            position_avg_entry = avg_price
            position_last_trade_time = pos.get('last_trade_time')

    current_price = prices[0]['close']
    prev_price = prices[1]['close'] if len(prices) > 1 else current_price
    unrealized_pnl = (current_price - position_avg_entry) * position_qty if position_qty > 0 else 0.0
    position_age_minutes = 0.0
    if position_last_trade_time:
        now = datetime.now(position_last_trade_time.tzinfo) if getattr(position_last_trade_time, 'tzinfo', None) else datetime.now()
        position_age_minutes = max((now - position_last_trade_time).total_seconds() / 60.0, 0.0)

    state = TradingState.from_market_data(
        rsi=indicators['RSI'],
        price=current_price,
        sma=indicators['SMA_50'],
        vwap=indicators['VWAP'],
        position_quantity=position_qty,
        prev_price=prev_price,
        cash_available=cash_balance,
        total_exposure=total_exposure,
        starting_cash=STARTING_CASH
    )

    market_data = {
        'price': current_price,
        'rsi': indicators['RSI'],
        'sma': indicators['SMA_50'],
        'vwap': indicators['VWAP'],
        'position_qty': position_qty,
        'avg_entry_price': position_avg_entry,
        'unrealized_pnl': unrealized_pnl,
        'prev_price': prev_price,
        'cash_balance': cash_balance,
        'total_exposure': total_exposure,
        'cash_bucket': state.cash_bucket,
        'exposure_bucket': state.exposure_bucket,
        'starting_cash': STARTING_CASH,
        'position_age_minutes': position_age_minutes,
        'last_trade_time': position_last_trade_time
    }

    return state, market_data


def calculate_reward(
    action: str,
    executed: bool,
    realized_pnl: float,
    state: TradingState,
    market_data: Dict
) -> float:
    """
    Compute reward for Q-learning. BUY gets small positive, SELL gets P&L,
    HOLD has slight penalty. Bonuses for quick exits, penalties for lingering losers.
    """
    position_age_minutes = market_data.get('position_age_minutes', 0.0)
    position_qty = market_data.get('position_qty', 0)
    price = market_data.get('price', 0.0)
    prev_price = market_data.get('prev_price', price)
    unrealized_pnl = market_data.get('unrealized_pnl', 0.0)

    if action == 'HOLD':
        reward = -0.005
        if state.cash_bucket == 'LOW':
            reward -= 0.005
        if state.exposure_bucket in ('HEAVY', 'OVEREXTENDED'):
            reward -= 0.005

        if position_qty > 0:
            price_change_pct = ((price - prev_price) / max(prev_price, 1e-6)) * 100
            reward += max(min(price_change_pct / 100.0, 0.02), -0.02)

            if unrealized_pnl != 0:
                reward += max(min(unrealized_pnl / 1000.0, 0.05), -0.05)
        return reward

    if not executed:
        return 0.0

    if action == 'BUY':
        reward = 0.02
        if state.cash_bucket == 'LOW':
            reward -= 0.01
        if state.exposure_bucket in ('HEAVY', 'OVEREXTENDED'):
            reward -= 0.02
        return reward

    if action == 'SELL':
        reward = realized_pnl
        if realized_pnl > 0 and position_age_minutes <= QUICK_EXIT_THRESHOLD_MINUTES:
            reward += QUICK_EXIT_BONUS
        if realized_pnl < 0 and position_age_minutes >= LINGERING_THRESHOLD_MINUTES:
            penalty_steps = int(position_age_minutes // max(LINGERING_THRESHOLD_MINUTES / 3, 1))
            reward -= LINGERING_PENALTY_PER_BLOCK * penalty_steps
        if state.cash_bucket == 'LOW':
            reward += 0.02
        if state.exposure_bucket in ('HEAVY', 'OVEREXTENDED'):
            reward += 0.02
        return reward

    return 0.0


def execute_action(
    agent: QLearningAgent,
    symbol: str,
    stock_id: int,
    action: str,
    market_data: Dict,
    was_random: bool,
    state: TradingState
) -> Dict:
    """Execute BUY/SELL/HOLD, log decision, update Q-values. Returns result dict."""
    price = market_data['price']
    position_qty = market_data['position_qty']

    result = {
        'action': action,
        'price': price,
        'quantity': 0,
        'executed': False,
        'reasoning': '',
        'realized_pnl': 0.0
    }

    reasoning_parts = [
        f"RSI={market_data['rsi']:.1f}",
        f"Price vs SMA: {((price - market_data['sma']) / market_data['sma'] * 100):+.2f}%",
        f"Price vs VWAP: {((price - market_data['vwap']) / market_data['vwap'] * 100):+.2f}%",
        f"Cash bucket={state.cash_bucket}",
        f"Exposure={state.exposure_bucket}"
    ]
    if was_random:
        reasoning_parts.append("(EXPLORATION)")
    reasoning = " | ".join(reasoning_parts)
    q_values = agent.get_q_values(state)

    if action == 'BUY':
        if position_qty < MAX_POSITION_SIZE:
            qty_to_buy = min(5, MAX_POSITION_SIZE - position_qty)
            bankroll = get_paper_bankroll()
            cost = qty_to_buy * price
            if bankroll['balance'] >= cost:
                trade_result = insert_paper_trade(
                    stock_id=stock_id,
                    action='BUY',
                    quantity=qty_to_buy,
                    price=price,
                    strategy='RL_AGENT',
                    reasoning=reasoning
                )

                result['quantity'] = qty_to_buy
                result['executed'] = True
                result['realized_pnl'] = trade_result['realized_pnl']
                result['reasoning'] = f"BUY {qty_to_buy} @ ${price:.2f} - {reasoning}"

                print(f"    🟢 BUY {qty_to_buy} shares @ ${price:.2f}")
            else:
                result['reasoning'] = f"BUY skipped (insufficient cash: ${bankroll['balance']:.2f} < ${cost:.2f})"
                print(f"    ⚠️ BUY skipped (insufficient cash)")
        else:
            result['reasoning'] = f"BUY skipped (max position reached: {position_qty} shares)"
            print(f"    ⚠️ BUY skipped (max position)")

    elif action == 'SELL':
        if position_qty > 0:
            trade_result = insert_paper_trade(
                stock_id=stock_id,
                action='SELL',
                quantity=position_qty,
                price=price,
                strategy='RL_AGENT',
                reasoning=reasoning
            )

            result['quantity'] = position_qty
            result['executed'] = True
            result['realized_pnl'] = trade_result['realized_pnl']
            result['reasoning'] = f"SELL {position_qty} @ ${price:.2f} (P&L: ${trade_result['realized_pnl']:.2f}) - {reasoning}"

            print(f"    🔴 SELL {position_qty} shares @ ${price:.2f} (P&L: ${trade_result['realized_pnl']:.2f})")
        else:
            result['reasoning'] = f"SELL skipped (no position)"
            print(f"    ⚠️ SELL skipped (no position)")

    elif action == 'HOLD':
        result['reasoning'] = f"HOLD - {reasoning}"
        print(f"    ⚪ HOLD (no action)")

    try:
        state_dict = {
            'rsi': market_data['rsi'],
            'price': price,
            'sma': market_data['sma'],
            'vwap': market_data['vwap'],
            'position_qty': position_qty,
            'cash_balance': market_data['cash_balance'],
            'total_exposure': market_data['total_exposure'],
            'cash_bucket': state.cash_bucket,
            'exposure_bucket': state.exposure_bucket,
            'starting_cash': market_data['starting_cash']
        }
        insert_decision_log(
            stock_id=stock_id,
            state=state_dict,
            action=action,
            was_executed=result['executed'],
            was_random=was_random,
            reasoning=result['reasoning'],
            q_values=q_values
        )
    except Exception as e:
        print(f"    ⚠️ Failed to log decision: {str(e)}")

    try:
        reward = calculate_reward(
            action,
            result['executed'],
            result['realized_pnl'],
            state,
            market_data
        )
        next_state, next_market_data = get_current_state(symbol, stock_id)
        agent.update_q_value(state, action, reward, next_state, done=False)
        agent.finish_episode()

        if reward != 0:
            print(f"    🧠 Q-Learning: Reward={reward:.2f}")
    except Exception as e:
        print(f"    ⚠️ Failed to update Q-values: {str(e)}")

    return result


def trade_single_stock(symbol: str, portfolio_win_rate: float, force_exploit: bool = False) -> Dict:
    """Run trading logic for one stock. Returns result dict."""
    print(f"\n[{symbol}]")

    try:
        stock_id = get_stock_id(symbol)
        if not stock_id:
            print(f"  ✗ Stock not found in database")
            return {'success': False, 'error': 'Stock not found'}

        agent = load_or_create_agent(stock_id)
        stock_win_rate = get_stock_win_rate(stock_id)
        decay_rate = get_adaptive_decay_rate(stock_win_rate if stock_win_rate is not None else portfolio_win_rate)
        agent.set_exploration_decay(decay_rate)
        stats = agent.get_stats()
        print(f"  Agent: {stats['total_episodes']} episodes, ε={stats['exploration_rate']:.3f}")
        print(f"  Decay target: {stats['exploration_decay']:.3f}")

        state, market_data = get_current_state(symbol, stock_id)
        print(f"  State: {state}")
        print(f"  Price: ${market_data['price']:.2f} | RSI: {market_data['rsi']:.1f} | Position: {market_data['position_qty']} shares")

        action, was_random = agent.choose_action(state, force_exploit=force_exploit)
        print(f"  Decision: {action} (random={was_random})")

        result = execute_action(agent, symbol, stock_id, action, market_data, was_random, state)
        save_q_table(stock_id, agent.save())

        return {
            'success': True,
            'symbol': symbol,
            'action': action,
            'executed': result['executed'],
            'reasoning': result['reasoning']
        }

    except Exception as e:
        import traceback
        print(f"  ✗ Error: {str(e)}")
        traceback.print_exc()
        return {'success': False, 'error': str(e)}


def main():
    parser = argparse.ArgumentParser(description='RL Trading Agent')
    parser.add_argument(
        '--symbols',
        type=str,
        help='Comma-separated list of stock symbols'
    )
    parser.add_argument(
        '--exploit',
        action='store_true',
        help='Force exploitation (no exploration)'
    )
    args = parser.parse_args()

    print("=" * 60)
    print("RL TRADING AGENT")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    if args.symbols:
        symbols = [s.strip() for s in args.symbols.split(',')]
    else:
        symbols = DEFAULT_SYMBOLS

    print(f"\n📈 Trading {len(symbols)} stocks...")
    bankroll = get_paper_bankroll()
    portfolio_win_rate = bankroll['win_rate']
    print(f"💰 Bankroll: ${bankroll['balance']:.2f} | ROI: {bankroll['roi']:.2f}% | Win Rate: {bankroll['win_rate']:.1f}%")
    print(f"🎯 Adaptive exploration decay will be computed per stock")

    results = []
    for symbol in symbols:
        result = trade_single_stock(symbol, portfolio_win_rate, force_exploit=args.exploit)
        results.append(result)

    print("\n" + "=" * 60)
    print("TRADING SESSION COMPLETE")

    successful = sum(1 for r in results if r['success'])
    executed = sum(1 for r in results if r.get('executed', False))

    print(f"  Stocks processed: {successful}/{len(symbols)}")
    print(f"  Actions executed: {executed}")
    print("=" * 60)


if __name__ == '__main__':
    main()
