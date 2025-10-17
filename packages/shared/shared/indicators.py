"""
Technical Indicators Module

Implements common day trading indicators:
- RSI (Relative Strength Index): Momentum indicator
- SMA (Simple Moving Average): Trend indicator
- EMA (Exponential Moving Average): Weighted trend indicator
- VWAP (Volume Weighted Average Price): Institutional price level
- Moving Average Crossover: Buy/sell signals

All functions are designed to be simple and well-documented for beginners.
"""

from typing import List, Dict, Tuple, Optional
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


def calculate_ema(prices: List[float], period: int) -> float:
    """
    Calculate EMA (Exponential Moving Average).

    EMA gives more weight to recent prices, making it more responsive than SMA.
    Used for:
    - Faster trend detection
    - MACD calculation (EMA-based)

    Formula:
        EMA_today = (Price_today * multiplier) + (EMA_yesterday * (1 - multiplier))
        multiplier = 2 / (period + 1)

    Args:
        prices: List of closing prices (oldest first)
        period: Number of periods (e.g., 12, 26 for MACD)

    Returns:
        EMA value

    Example:
        prices = [100, 101, 102, 103, 104, 105, 106, ...]  # 12+ prices
        ema_12 = calculate_ema(prices, period=12)
        # ema_12 = 104.5 (weighted toward recent prices)
    """
    if len(prices) < period:
        raise ValueError(f"Need at least {period} prices to calculate EMA")

    multiplier = 2.0 / (period + 1)
    ema = np.mean(prices[:period])  # Start with SMA

    for price in prices[period:]:
        ema = (price * multiplier) + (ema * (1 - multiplier))

    return float(round(ema, 2))


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


def detect_ma_crossover(
    fast_ma: List[float],
    slow_ma: List[float]
) -> Tuple[Optional[str], float]:
    """
    Detect moving average crossover signals.

    Classic strategy:
    - Golden Cross: Fast MA crosses ABOVE slow MA → BUY signal
    - Death Cross: Fast MA crosses BELOW slow MA → SELL signal

    Common combinations:
    - 5-period / 20-period (intraday)
    - 50-period / 200-period (daily)

    Args:
        fast_ma: Fast moving average values (last 2+ values)
        slow_ma: Slow moving average values (last 2+ values)

    Returns:
        Tuple of (signal, strength):
        - signal: 'BUY', 'SELL', or None
        - strength: How far apart the MAs are (% difference)

    Example:
        fast_ma = [177.5, 178.2]  # Was below, now above
        slow_ma = [178.0, 178.0]
        signal, strength = detect_ma_crossover(fast_ma, slow_ma)
        # signal = 'BUY', strength = 0.11% (bullish crossover)
    """
    if len(fast_ma) < 2 or len(slow_ma) < 2:
        raise ValueError("Need at least 2 values for each MA to detect crossover")

    # Current values
    fast_current = fast_ma[-1]
    slow_current = slow_ma[-1]

    # Previous values
    fast_previous = fast_ma[-2]
    slow_previous = slow_ma[-2]

    # Calculate strength (% difference between MAs)
    strength = abs((fast_current - slow_current) / slow_current) * 100

    # Detect crossover
    if fast_previous <= slow_previous and fast_current > slow_current:
        # Golden Cross (bullish)
        return ('BUY', round(strength, 2))
    elif fast_previous >= slow_previous and fast_current < slow_current:
        # Death Cross (bearish)
        return ('SELL', round(strength, 2))
    else:
        # No crossover
        return (None, round(strength, 2))


def generate_trading_signal(
    rsi: float,
    price: float,
    vwap: float,
    ma_signal: Optional[str]
) -> Dict:
    """
    Generate combined trading signal from multiple indicators.

    This is a SIMPLE multi-indicator strategy for beginners:
    1. RSI identifies overbought/oversold
    2. VWAP identifies institutional support/resistance
    3. MA crossover confirms trend direction

    Args:
        rsi: Current RSI value (0-100)
        price: Current stock price
        vwap: Current VWAP value
        ma_signal: Moving average crossover signal ('BUY', 'SELL', or None)

    Returns:
        Dictionary:
        {
            'action': 'BUY' | 'SELL' | 'HOLD',
            'confidence': 'HIGH' | 'MEDIUM' | 'LOW',
            'reasoning': 'RSI oversold (28) + price above VWAP + MA golden cross'
        }

    Example:
        signal = generate_trading_signal(
            rsi=28,           # Oversold
            price=178.50,     # Above VWAP
            vwap=177.80,
            ma_signal='BUY'   # Golden cross
        )
        # signal = {'action': 'BUY', 'confidence': 'HIGH', 'reasoning': '...'}
    """
    reasons = []
    buy_score = 0
    sell_score = 0

    # 1. RSI Analysis
    if rsi < 30:
        buy_score += 2
        reasons.append(f"RSI oversold ({rsi:.1f})")
    elif rsi > 70:
        sell_score += 2
        reasons.append(f"RSI overbought ({rsi:.1f})")
    else:
        reasons.append(f"RSI neutral ({rsi:.1f})")

    # 2. VWAP Analysis
    if price > vwap:
        buy_score += 1
        reasons.append(f"Price above VWAP (bullish)")
    elif price < vwap:
        sell_score += 1
        reasons.append(f"Price below VWAP (bearish)")

    # 3. MA Crossover Analysis
    if ma_signal == 'BUY':
        buy_score += 2
        reasons.append("MA golden cross")
    elif ma_signal == 'SELL':
        sell_score += 2
        reasons.append("MA death cross")

    # Determine action and confidence
    if buy_score >= 3:
        action = 'BUY'
        confidence = 'HIGH' if buy_score >= 4 else 'MEDIUM'
    elif sell_score >= 3:
        action = 'SELL'
        confidence = 'HIGH' if sell_score >= 4 else 'MEDIUM'
    else:
        action = 'HOLD'
        confidence = 'LOW'

    reasoning = " + ".join(reasons)

    return {
        'action': action,
        'confidence': confidence,
        'reasoning': reasoning,
        'buy_score': buy_score,
        'sell_score': sell_score
    }


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
    print("\n2. Moving Averages")
    sma_5 = calculate_sma(sample_prices, period=5)
    sma_10 = calculate_sma(sample_prices, period=10)
    print(f"   SMA(5): {sma_5:.2f}")
    print(f"   SMA(10): {sma_10:.2f}")

    # Test MA Crossover
    print("\n3. MA Crossover Detection")
    fast_ma = [178.5, 179.0]  # Last 2 values of 5-period MA
    slow_ma = [178.0, 178.2]  # Last 2 values of 10-period MA
    signal, strength = detect_ma_crossover(fast_ma, slow_ma)
    print(f"   Signal: {signal or 'None'}")
    print(f"   Strength: {strength:.2f}%")

    # Test VWAP
    print("\n4. VWAP Calculation")
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

    # Test combined signal
    print("\n5. Combined Trading Signal")
    signal = generate_trading_signal(
        rsi=rsi,
        price=180.0,
        vwap=vwap,
        ma_signal='BUY'
    )
    print(f"   Action: {signal['action']}")
    print(f"   Confidence: {signal['confidence']}")
    print(f"   Reasoning: {signal['reasoning']}")
