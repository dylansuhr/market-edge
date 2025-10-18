"""
RL Trading Agent

Autonomous day trading agent powered by Q-Learning.

This script:
1. Loads current market data from database
2. Uses RL agent to decide: BUY, SELL, or HOLD for each stock
3. Executes paper trades (mock trades for validation)
4. Updates Q-values based on outcomes
5. Learns and improves over time

Runs every 5 minutes during market hours (synchronized with ETL).

Usage:
    python ops/scripts/rl_trading_agent.py --symbols AAPL,MSFT
"""

import sys
import os
import argparse
from datetime import datetime
from typing import Dict, List, Tuple
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add packages to path
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
    save_q_table,
    load_q_table,
    insert_decision_log
)


# Default stocks (match ETL default)
DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'META', 'AMZN', 'JPM']

# Trading parameters
MAX_POSITION_SIZE = 10  # Max shares per stock
STARTING_CASH = 10000.0  # Virtual starting capital


def load_or_create_agent(stock_id: int) -> QLearningAgent:
    """
    Load existing agent or create new one.

    Each stock has its own agent (separate Q-tables).

    Args:
        stock_id: Stock identifier

    Returns:
        QLearningAgent (loaded or new)
    """
    q_table = load_q_table(stock_id)

    if q_table:
        # Load existing agent
        agent = QLearningAgent.load(q_table)
        return agent
    else:
        # Create new agent
        agent = QLearningAgent(
            learning_rate=0.1,
            discount_factor=0.95,
            exploration_rate=1.0,  # Start with high exploration
            exploration_decay=0.995,
            min_exploration=0.01
        )
        return agent


def get_current_state(symbol: str, stock_id: int) -> Tuple[TradingState, Dict]:
    """
    Get current trading state for a stock.

    Args:
        symbol: Stock ticker
        stock_id: Stock identifier

    Returns:
        Tuple of (TradingState, market_data_dict)

    Raises:
        Exception: If insufficient data
    """
    # Get recent prices
    prices = get_recent_prices(stock_id, limit=100)
    if len(prices) < 50:
        raise Exception(f"Insufficient price data ({len(prices)} bars)")

    # Get latest indicators
    indicators = get_latest_indicators(stock_id)
    if 'RSI' not in indicators or 'SMA_50' not in indicators or 'VWAP' not in indicators:
        raise Exception(f"Missing technical indicators")

    # Get current position
    positions = get_active_positions()
    position_qty = 0
    for pos in positions:
        if pos['stock_id'] == stock_id:
            position_qty = pos['quantity']
            break

    # Current and previous prices
    current_price = prices[0]['close']  # Most recent
    prev_price = prices[1]['close'] if len(prices) > 1 else current_price

    # Create trading state
    state = TradingState.from_market_data(
        rsi=indicators['RSI'],
        price=current_price,
        sma=indicators['SMA_50'],
        vwap=indicators['VWAP'],
        position_quantity=position_qty,
        prev_price=prev_price
    )

    market_data = {
        'price': current_price,
        'rsi': indicators['RSI'],
        'sma': indicators['SMA_50'],
        'vwap': indicators['VWAP'],
        'position_qty': position_qty
    }

    return state, market_data


def calculate_reward(action: str, executed: bool, realized_pnl: float) -> float:
    """
    Calculate reward for Q-learning based on action and outcome.

    Reward structure:
    - BUY (executed): Small negative penalty for committing capital (-0.1)
    - SELL (executed): Realized P&L (positive if profit, negative if loss)
    - HOLD: Small penalty for inaction/opportunity cost (-0.01) - ALWAYS applies
    - Not executed (BUY/SELL failed): No reward (0)

    Args:
        action: 'BUY', 'SELL', or 'HOLD'
        executed: Whether action was actually executed
        realized_pnl: Profit/loss from trade (for SELL)

    Returns:
        Reward value for Q-learning update
    """
    # HOLD penalty applies even if not "executed" (HOLD is always applicable)
    if action == 'HOLD':
        return -0.01

    # For BUY/SELL, only reward if executed
    if not executed:
        return 0.0

    if action == 'BUY':
        # Small penalty for committing capital
        return -0.1
    elif action == 'SELL':
        # Realized P&L is the reward
        return realized_pnl
    else:
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
    """
    Execute trading action (paper trade).

    Args:
        agent: QLearningAgent
        symbol: Stock ticker
        stock_id: Stock identifier
        action: 'BUY', 'SELL', or 'HOLD'
        market_data: Current market data
        was_random: Whether action was random (exploration)
        state: Trading state (for logging)

    Returns:
        Dictionary with execution results
    """
    price = market_data['price']
    position_qty = market_data['position_qty']

    result = {
        'action': action,
        'price': price,
        'quantity': 0,
        'executed': False,
        'reasoning': '',
        'realized_pnl': 0.0  # Track P&L for Q-learning rewards
    }

    # Build reasoning
    reasoning_parts = [
        f"RSI={market_data['rsi']:.1f}",
        f"Price vs SMA: {((price - market_data['sma']) / market_data['sma'] * 100):+.2f}%",
        f"Price vs VWAP: {((price - market_data['vwap']) / market_data['vwap'] * 100):+.2f}%"
    ]
    if was_random:
        reasoning_parts.append("(EXPLORATION)")
    reasoning = " | ".join(reasoning_parts)

    # Get Q-values for logging
    q_values = agent.get_q_values(state)

    # Execute action
    if action == 'BUY':
        if position_qty < MAX_POSITION_SIZE:
            # Buy shares (up to max position)
            qty_to_buy = min(5, MAX_POSITION_SIZE - position_qty)  # Buy 5 shares at a time

            # Check if we have cash
            bankroll = get_paper_bankroll()
            cost = qty_to_buy * price
            if bankroll['balance'] >= cost:
                # Execute buy
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
            # Sell all shares
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

    # Log ALL decisions to database for transparency
    try:
        state_dict = {
            'rsi': market_data['rsi'],
            'price': price,
            'sma': market_data['sma'],
            'vwap': market_data['vwap'],
            'position_qty': position_qty
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

    # Q-LEARNING UPDATE: Learn from this action
    try:
        # Calculate reward based on action outcome
        reward = calculate_reward(action, result['executed'], result['realized_pnl'])

        # Get next state after action (current market state)
        next_state, next_market_data = get_current_state(symbol, stock_id)

        # Update Q-value (done=False since position may still be open)
        agent.update_q_value(state, action, reward, next_state, done=False)

        if reward != 0:
            print(f"    🧠 Q-Learning: Reward={reward:.2f}")
    except Exception as e:
        print(f"    ⚠️ Failed to update Q-values: {str(e)}")

    return result


def trade_single_stock(symbol: str, force_exploit: bool = False) -> Dict:
    """
    Run trading logic for a single stock.

    Args:
        symbol: Stock ticker
        force_exploit: If True, always use best action (no exploration)

    Returns:
        Dictionary with results
    """
    print(f"\n[{symbol}]")

    try:
        # Get stock ID
        stock_id = get_stock_id(symbol)
        if not stock_id:
            print(f"  ✗ Stock not found in database")
            return {'success': False, 'error': 'Stock not found'}

        # Load or create agent
        agent = load_or_create_agent(stock_id)
        stats = agent.get_stats()
        print(f"  Agent: {stats['total_episodes']} episodes, ε={stats['exploration_rate']:.3f}")

        # Get current state
        state, market_data = get_current_state(symbol, stock_id)
        print(f"  State: {state}")
        print(f"  Price: ${market_data['price']:.2f} | RSI: {market_data['rsi']:.1f} | Position: {market_data['position_qty']} shares")

        # Choose action
        action, was_random = agent.choose_action(state, force_exploit=force_exploit)
        print(f"  Decision: {action} (random={was_random})")

        # Execute action
        result = execute_action(agent, symbol, stock_id, action, market_data, was_random, state)

        # Save updated Q-table
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
    """Main trading agent execution."""
    parser = argparse.ArgumentParser(description='RL Trading Agent')
    parser.add_argument(
        '--symbols',
        type=str,
        help='Comma-separated list of stock symbols'
    )
    parser.add_argument(
        '--exploit',
        action='store_true',
        help='Force exploitation (no exploration) - use for deployment'
    )

    args = parser.parse_args()

    print("=" * 60)
    print("RL TRADING AGENT")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Determine which stocks to trade
    if args.symbols:
        symbols = [s.strip() for s in args.symbols.split(',')]
    else:
        symbols = DEFAULT_SYMBOLS

    print(f"\n📈 Trading {len(symbols)} stocks...")

    # Get current bankroll
    bankroll = get_paper_bankroll()
    print(f"💰 Bankroll: ${bankroll['balance']:.2f} | ROI: {bankroll['roi']:.2%} | Win Rate: {bankroll['win_rate']:.1%}")

    # Trade each stock
    results = []
    for symbol in symbols:
        result = trade_single_stock(symbol, force_exploit=args.exploit)
        results.append(result)

    # Summary
    print("\n" + "=" * 60)
    print("TRADING SESSION COMPLETE")

    successful = sum(1 for r in results if r['success'])
    executed = sum(1 for r in results if r.get('executed', False))

    print(f"  Stocks processed: {successful}/{len(symbols)}")
    print(f"  Actions executed: {executed}")
    print("=" * 60)


if __name__ == '__main__':
    main()
