import importlib
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'packages'))

os.environ.setdefault('QUICK_EXIT_THRESHOLD', '10')
os.environ.setdefault('LINGERING_THRESHOLD', '30')
os.environ.setdefault('QUICK_EXIT_BONUS', '0.05')
os.environ.setdefault('LINGERING_PENALTY', '0.02')

rl_module = importlib.import_module('ops.scripts.rl_trading_agent')
calculate_reward = rl_module.calculate_reward

from models.models.state import TradingState  # noqa: E402


def _base_state():
    return TradingState(
        rsi_category='NEUTRAL',
        ma_position='AT',
        vwap_position='AT',
        position_status='FLAT',
        price_momentum='FLAT',
        cash_bucket='HIGH',
        exposure_bucket='LIGHT'
    )


def _market_data(**overrides):
    defaults = {
        'position_age_minutes': 0.0,
        'position_qty': 0,
        'price': 100.0,
        'prev_price': 100.0,
        'unrealized_pnl': 0.0
    }
    defaults.update(overrides)
    return defaults


def test_buy_reward_is_positive():
    reward = calculate_reward('BUY', True, 0.0, _base_state(), _market_data())
    assert reward > 0


def test_sell_quick_exit_gets_bonus():
    reward = calculate_reward(
        'SELL',
        True,
        realized_pnl=2.0,
        state=_base_state(),
        market_data=_market_data(position_age_minutes=5, position_qty=5)
    )
    assert reward > 2.0  # Includes quick exit bonus


def test_hold_penalized_when_price_drops():
    reward = calculate_reward(
        'HOLD',
        True,
        realized_pnl=0.0,
        state=_base_state(),
        market_data=_market_data(price=99.0, prev_price=101.0, position_qty=5, unrealized_pnl=-10.0)
    )
    assert reward < 0
