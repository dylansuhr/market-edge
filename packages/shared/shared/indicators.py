"""
Technical Indicators Module

RSI, SMA, and VWAP calculated locally from raw OHLCV data.
Saves API calls vs fetching pre-computed indicators.
"""

from typing import List, Dict
import numpy as np


def calculate_rsi(prices: List[float], period: int = 14) -> float:
    """
    RSI = 100 - (100 / (1 + RS)) where RS = avg_gain / avg_loss.
    Returns 0-100. <30 oversold, >70 overbought.
    """
    if len(prices) < period + 1:
        raise ValueError(f"Need at least {period + 1} prices to calculate RSI")

    deltas = np.diff(prices)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])

    # Smoothed averages for remaining periods
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return float(round(100.0 - (100.0 / (1.0 + rs)), 2))


def calculate_sma(prices: List[float], period: int) -> float:
    """Simple moving average of last N prices."""
    if len(prices) < period:
        raise ValueError(f"Need at least {period} prices to calculate SMA")
    return float(round(np.mean(prices[-period:]), 2))




def calculate_vwap(prices: List[Dict]) -> float:
    """
    VWAP = sum(price * volume) / sum(volume).
    Price above VWAP = bullish, below = bearish.
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
    return float(round(total_price_volume / total_volume, 2))


if __name__ == '__main__':
    # Quick test of indicators
    print("=== Testing Technical Indicators ===\n")

    sample_prices = [
        177.5, 177.8, 178.0, 177.9, 178.2,
        178.5, 178.3, 178.7, 179.0, 178.8,
        179.2, 179.5, 179.3, 179.7, 180.0
    ]

    print("1. RSI")
    rsi = calculate_rsi(sample_prices, period=14)
    print(f"   RSI(14): {rsi:.2f}")

    print("\n2. SMA")
    print(f"   SMA(5): {calculate_sma(sample_prices, period=5):.2f}")
    print(f"   SMA(10): {calculate_sma(sample_prices, period=10):.2f}")

    print("\n3. VWAP")
    sample_bars = [
        {'close': 178.0, 'volume': 1000000},
        {'close': 178.5, 'volume': 1200000},
        {'close': 179.0, 'volume': 900000}
    ]
    print(f"   VWAP: {calculate_vwap(sample_bars):.2f}")
