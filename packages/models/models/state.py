"""
Trading State Representation

Defines how the RL agent perceives the market environment.
The state encodes all relevant information for decision-making.
"""

from typing import Tuple
from dataclasses import dataclass


@dataclass
class TradingState:
    """
    Represents the current market state for RL agent.

    The state includes:
    - Technical indicators (RSI, MA position, VWAP)
    - Portfolio information (position, cash)
    - Price momentum

    This is discretized (binned) to keep Q-table manageable for beginners.
    """

    rsi_category: str          # 'OVERSOLD', 'NEUTRAL', 'OVERBOUGHT'
    ma_position: str           # 'ABOVE', 'AT', 'BELOW' (price vs MA)
    vwap_position: str         # 'ABOVE', 'AT', 'BELOW' (price vs VWAP)
    position_status: str       # 'LONG', 'FLAT', 'SHORT'
    price_momentum: str        # 'UP', 'FLAT', 'DOWN'

    def to_tuple(self) -> Tuple[str, str, str, str, str]:
        """
        Convert state to tuple for use as dictionary key in Q-table.

        Returns:
            Tuple of state features
        """
        return (
            self.rsi_category,
            self.ma_position,
            self.vwap_position,
            self.position_status,
            self.price_momentum
        )

    @staticmethod
    def from_market_data(
        rsi: float,
        price: float,
        sma: float,
        vwap: float,
        position_quantity: int,
        prev_price: float
    ) -> 'TradingState':
        """
        Create TradingState from raw market data.

        This function discretizes continuous values into categories.

        Args:
            rsi: RSI value (0-100)
            price: Current stock price
            sma: Simple moving average value
            vwap: Volume weighted average price
            position_quantity: Current position size (>0 = long, 0 = flat, <0 = short)
            prev_price: Previous price (for momentum calculation)

        Returns:
            TradingState object

        Example:
            state = TradingState.from_market_data(
                rsi=28,         # Oversold
                price=178.50,
                sma=179.00,     # Price below MA
                vwap=177.80,    # Price above VWAP
                position_quantity=0,  # Flat (no position)
                prev_price=178.20     # Price rising
            )
            # state = TradingState(
            #     rsi_category='OVERSOLD',
            #     ma_position='BELOW',
            #     vwap_position='ABOVE',
            #     position_status='FLAT',
            #     price_momentum='UP'
            # )
        """
        # Discretize RSI
        if rsi < 30:
            rsi_category = 'OVERSOLD'
        elif rsi > 70:
            rsi_category = 'OVERBOUGHT'
        else:
            rsi_category = 'NEUTRAL'

        # Discretize MA position
        ma_diff_pct = ((price - sma) / sma) * 100
        if ma_diff_pct > 0.5:
            ma_position = 'ABOVE'
        elif ma_diff_pct < -0.5:
            ma_position = 'BELOW'
        else:
            ma_position = 'AT'

        # Discretize VWAP position
        vwap_diff_pct = ((price - vwap) / vwap) * 100
        if vwap_diff_pct > 0.5:
            vwap_position = 'ABOVE'
        elif vwap_diff_pct < -0.5:
            vwap_position = 'BELOW'
        else:
            vwap_position = 'AT'

        # Discretize position status
        if position_quantity > 0:
            position_status = 'LONG'
        elif position_quantity < 0:
            position_status = 'SHORT'
        else:
            position_status = 'FLAT'

        # Discretize price momentum
        price_change_pct = ((price - prev_price) / prev_price) * 100
        if price_change_pct > 0.1:
            price_momentum = 'UP'
        elif price_change_pct < -0.1:
            price_momentum = 'DOWN'
        else:
            price_momentum = 'FLAT'

        return TradingState(
            rsi_category=rsi_category,
            ma_position=ma_position,
            vwap_position=vwap_position,
            position_status=position_status,
            price_momentum=price_momentum
        )

    def __repr__(self) -> str:
        """Human-readable state representation."""
        return (
            f"State(RSI={self.rsi_category}, "
            f"MA={self.ma_position}, "
            f"VWAP={self.vwap_position}, "
            f"Pos={self.position_status}, "
            f"Mom={self.price_momentum})"
        )


# Example usage
if __name__ == '__main__':
    """
    Test state representation with sample data.

    Run: python -m packages.models.models.state
    """
    print("=== Testing Trading State Representation ===\n")

    # Example 1: Oversold scenario
    print("1. Oversold Scenario (potential buy)")
    state1 = TradingState.from_market_data(
        rsi=28,           # Oversold
        price=178.50,
        sma=179.00,       # Price below MA
        vwap=177.80,      # Price above VWAP
        position_quantity=0,  # No position
        prev_price=178.20     # Rising
    )
    print(f"   {state1}")
    print(f"   Tuple: {state1.to_tuple()}")

    # Example 2: Overbought scenario
    print("\n2. Overbought Scenario (potential sell)")
    state2 = TradingState.from_market_data(
        rsi=75,           # Overbought
        price=182.00,
        sma=180.00,       # Price above MA
        vwap=181.50,      # Price above VWAP
        position_quantity=10,  # Long position
        prev_price=181.80      # Rising
    )
    print(f"   {state2}")
    print(f"   Tuple: {state2.to_tuple()}")

    # Example 3: Neutral scenario
    print("\n3. Neutral Scenario (hold)")
    state3 = TradingState.from_market_data(
        rsi=50,           # Neutral
        price=180.00,
        sma=180.10,       # At MA
        vwap=179.95,      # At VWAP
        position_quantity=0,  # Flat
        prev_price=180.05     # Flat
    )
    print(f"   {state3}")
    print(f"   Tuple: {state3.to_tuple()}")

    # Count total possible states
    print("\n4. State Space Size")
    rsi_states = 3  # OVERSOLD, NEUTRAL, OVERBOUGHT
    ma_states = 3   # ABOVE, AT, BELOW
    vwap_states = 3 # ABOVE, AT, BELOW
    pos_states = 3  # LONG, FLAT, SHORT
    mom_states = 3  # UP, FLAT, DOWN

    total_states = rsi_states * ma_states * vwap_states * pos_states * mom_states
    print(f"   Total possible states: {total_states}")
    print(f"   (manageable Q-table size for Q-Learning)")
