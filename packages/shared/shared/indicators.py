"""
Technical Indicators Module

Implements the core indicators used by the Q-Learning agent:
- RSI (Relative Strength Index): Momentum indicator
- SMA (Simple Moving Average): Trend indicator
- VWAP (Volume Weighted Average Price): Institutional price level

"""

from typing import List, Dict
import numpy as np


def calculate_rsi(prices: List[float], period: int = 14) -> float:
    """
    Calculate RSI (Relative Strength Index).

    RSI measures momentum on a scale of 0-100:
    - RSI < 30: Oversold (potential BUY signal)
    - RSI > 70: Overbought (potential SELL signal)
    - RSI 30-70: Neutral

    Formula:
        RSI = 100 - (100 / (1 + RS))
        RS = Average Gain / Average Loss over period

    Args:
        prices: List of closing prices (oldest first)
        period: Look-back period (default 14)

    Returns:
        RSI value (0-100)

    Example:
        prices = [100, 102, 101, 103, 105, 104, 106, ...]  # 14+ prices
        rsi = calculate_rsi(prices, period=14)
        # rsi = 65.3 (neutral)
    """
    if len(prices) < period + 1:
        raise ValueError(f"Need at least {period + 1} prices to calculate RSI")

    # Calculate price changes
    deltas = np.diff(prices)

    # Separate gains and losses
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    # Calculate average gain and loss
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])

    # Calculate subsequent averages (smoothed)
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    # Calculate RS and RSI
    if avg_loss == 0:
        return 100.0  # No losses means maximally overbought

    rs = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))

    return float(round(rsi, 2))


def calculate_sma(prices: List[float], period: int) -> float:
    """
    Calculate SMA (Simple Moving Average).

    SMA is the average price over a period. Used for:
    - Trend identification (price above SMA = uptrend)
    - Support/resistance levels
    - Moving average crossover strategies

    Args:
        prices: List of closing prices (most recent last)
        period: Number of periods to average

    Returns:
        SMA value

    Example:
        prices = [100, 101, 102, 103, 104]
        sma_5 = calculate_sma(prices, period=5)
        # sma_5 = 102.0 (average of last 5 prices)
    """
    if len(prices) < period:
        raise ValueError(f"Need at least {period} prices to calculate SMA")

    recent_prices = prices[-period:]
    return float(round(np.mean(recent_prices), 2))




def calculate_vwap(prices: List[Dict]) -> float:
    """
    Calculate VWAP (Volume Weighted Average Price).

    VWAP is THE most important indicator for day traders:
    - Shows where institutions are buying/selling
    - Price > VWAP: Bullish (buying pressure)
    - Price < VWAP: Bearish (selling pressure)

    Formula:
        VWAP = Σ(Price * Volume) / Σ(Volume)

    Args:
        prices: List of price bars with 'close' and 'volume' keys
                [
                    {'close': 178.32, 'volume': 1234567},
                    {'close': 178.45, 'volume': 987654},
                    ...
                ]

    Returns:
        VWAP value

    Example:
        bars = [
            {'close': 100, 'volume': 1000},
            {'close': 101, 'volume': 1500},
            {'close': 102, 'volume': 800}
        ]
        vwap = calculate_vwap(bars)
        # vwap = 100.91 (volume-weighted average)
    """
    if not prices:
        raise ValueError("Need at least one price bar to calculate VWAP")

    total_volume = 0
    total_price_volume = 0

    for bar in prices:
        price = bar['close']
        volume = bar['volume']
        total_price_volume += price * volume
        total_volume += volume

    if total_volume == 0:
        return 0.0

    vwap = total_price_volume / total_volume
    return float(round(vwap, 2))






# Example usage
if __name__ == '__main__':
    """
    Test technical indicators with sample data.

    Run: python -m packages.shared.shared.indicators
    """
    print("=== Testing Technical Indicators ===\n")

    # Sample price data (AAPL intraday)
    sample_prices = [
        177.5, 177.8, 178.0, 177.9, 178.2,
        178.5, 178.3, 178.7, 179.0, 178.8,
        179.2, 179.5, 179.3, 179.7, 180.0
    ]

    # Test RSI
    print("1. RSI Calculation")
    rsi = calculate_rsi(sample_prices, period=14)
    print(f"   RSI (14): {rsi:.2f}")
    if rsi < 30:
        print("   → OVERSOLD (potential buy)")
    elif rsi > 70:
        print("   → OVERBOUGHT (potential sell)")
    else:
        print("   → NEUTRAL")

    # Test SMA
    print("\n2. SMA Calculation")
    sma_5 = calculate_sma(sample_prices, period=5)
    sma_10 = calculate_sma(sample_prices, period=10)
    print(f"   SMA(5): {sma_5:.2f}")
    print(f"   SMA(10): {sma_10:.2f}")

    # Test VWAP
    print("\n3. VWAP Calculation")
    sample_bars = [
        {'close': 178.0, 'volume': 1000000},
        {'close': 178.5, 'volume': 1200000},
        {'close': 179.0, 'volume': 900000}
    ]
    vwap = calculate_vwap(sample_bars)
    print(f"   VWAP: {vwap:.2f}")
    current_price = 179.0
    print(f"   Current Price: {current_price:.2f}")
    if current_price > vwap:
        print("   → Price above VWAP (bullish)")
    else:
        print("   → Price below VWAP (bearish)")
