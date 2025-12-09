"""
Trading State Representation

Discretizes continuous market data into buckets so the Q-table stays manageable.
"""

from typing import Tuple
from dataclasses import dataclass


@dataclass
class TradingState:
    """
    Market state for RL agent. 7 discretized features -> ~4800 possible states.
    """
    rsi_category: str       # OVERSOLD/WEAK/NEUTRAL/STRONG/OVERBOUGHT
    ma_position: str        # ABOVE/AT/BELOW (price vs SMA)
    vwap_position: str      # ABOVE/AT/BELOW (price vs VWAP)
    position_status: str    # LONG/FLAT/SHORT
    price_momentum: str     # UP/FLAT/DOWN
    cash_bucket: str        # HIGH/MEDIUM/LOW
    exposure_bucket: str    # NONE/LIGHT/HEAVY/OVEREXTENDED

    def to_tuple(self) -> Tuple[str, str, str, str, str, str, str]:
        """Convert to tuple for use as Q-table key."""
        return (
            self.rsi_category,
            self.ma_position,
            self.vwap_position,
            self.position_status,
            self.price_momentum,
            self.cash_bucket,
            self.exposure_bucket
        )

    @staticmethod
    def from_market_data(
        rsi: float,
        price: float,
        sma: float,
        vwap: float,
        position_quantity: int,
        prev_price: float,
        cash_available: float,
        total_exposure: float,
        starting_cash: float
    ) -> 'TradingState':
        """Discretize raw market data into categorical buckets."""
        # RSI buckets
        if rsi < 30:
            rsi_category = 'OVERSOLD'
        elif rsi < 45:
            rsi_category = 'WEAK'
        elif rsi < 55:
            rsi_category = 'NEUTRAL'
        elif rsi < 70:
            rsi_category = 'STRONG'
        else:
            rsi_category = 'OVERBOUGHT'

        # MA position (±0.5% threshold)
        ma_diff_pct = ((price - sma) / sma) * 100
        if ma_diff_pct > 0.5:
            ma_position = 'ABOVE'
        elif ma_diff_pct < -0.5:
            ma_position = 'BELOW'
        else:
            ma_position = 'AT'

        # VWAP position
        vwap_diff_pct = ((price - vwap) / vwap) * 100
        if vwap_diff_pct > 0.5:
            vwap_position = 'ABOVE'
        elif vwap_diff_pct < -0.5:
            vwap_position = 'BELOW'
        else:
            vwap_position = 'AT'

        # Position status
        if position_quantity > 0:
            position_status = 'LONG'
        elif position_quantity < 0:
            position_status = 'SHORT'
        else:
            position_status = 'FLAT'

        # Price momentum (±0.1% threshold)
        price_change_pct = ((price - prev_price) / prev_price) * 100
        if price_change_pct > 0.1:
            price_momentum = 'UP'
        elif price_change_pct < -0.1:
            price_momentum = 'DOWN'
        else:
            price_momentum = 'FLAT'

        # Cash availability (as % of starting capital)
        normalized_cash = max(cash_available, 0.0)
        normalized_exposure = max(total_exposure, 0.0)
        normalized_starting_cash = max(starting_cash, 1e-9)
        cash_ratio = normalized_cash / normalized_starting_cash
        if cash_ratio >= 0.7:
            cash_bucket = 'HIGH'
        elif cash_ratio >= 0.3:
            cash_bucket = 'MEDIUM'
        else:
            cash_bucket = 'LOW'

        # Portfolio exposure (as % of starting capital)
        exposure_ratio = normalized_exposure / normalized_starting_cash
        if exposure_ratio <= 0.05:
            exposure_bucket = 'NONE'
        elif exposure_ratio < 0.5:
            exposure_bucket = 'LIGHT'
        elif exposure_ratio <= 1.0:
            exposure_bucket = 'HEAVY'
        else:
            exposure_bucket = 'OVEREXTENDED'

        return TradingState(
            rsi_category=rsi_category,
            ma_position=ma_position,
            vwap_position=vwap_position,
            position_status=position_status,
            price_momentum=price_momentum,
            cash_bucket=cash_bucket,
            exposure_bucket=exposure_bucket
        )

    def __repr__(self) -> str:
        return (
            f"State(RSI={self.rsi_category}, "
            f"MA={self.ma_position}, "
            f"VWAP={self.vwap_position}, "
            f"Pos={self.position_status}, "
            f"Mom={self.price_momentum}, "
            f"Cash={self.cash_bucket}, "
            f"Exposure={self.exposure_bucket})"
        )


if __name__ == '__main__':
    # Quick test of state discretization
    print("=== Testing Trading State Representation ===\n")

    print("1. Oversold Scenario")
    state1 = TradingState.from_market_data(
        rsi=28, price=178.50, sma=179.00, vwap=177.80,
        position_quantity=0, prev_price=178.20,
        cash_available=85000.00, total_exposure=15000.00, starting_cash=100000.00
    )
    print(f"   {state1}")
    print(f"   Tuple: {state1.to_tuple()}")

    print("\n2. Overbought Scenario")
    state2 = TradingState.from_market_data(
        rsi=75, price=182.00, sma=180.00, vwap=181.50,
        position_quantity=10, prev_price=181.80,
        cash_available=42000.00, total_exposure=58000.00, starting_cash=100000.00
    )
    print(f"   {state2}")
    print(f"   Tuple: {state2.to_tuple()}")

    print("\n3. Neutral Scenario")
    state3 = TradingState.from_market_data(
        rsi=50, price=180.00, sma=180.10, vwap=179.95,
        position_quantity=0, prev_price=180.05,
        cash_available=100000.00, total_exposure=0.0, starting_cash=100000.00
    )
    print(f"   {state3}")
    print(f"   Tuple: {state3.to_tuple()}")

    # 5 * 3 * 3 * 3 * 3 * 3 * 4 = 4860 possible states
    print("\n4. State Space Size")
    total_states = 5 * 3 * 3 * 3 * 3 * 3 * 4
    print(f"   Total possible states: {total_states}")
