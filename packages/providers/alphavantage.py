"""
Alpha Vantage API Provider

This module fetches real-time and historical stock market data from Alpha Vantage.
Free tier: 500 API calls per day (25 calls per minute rate limit)

Documentation: https://www.alphavantage.co/documentation/
"""

import os
import time
import requests
from typing import Dict, List, Optional
from datetime import datetime


class AlphaVantageProvider:
    """
    Client for Alpha Vantage Stock Market API.

    Provides methods to fetch:
    - Real-time stock quotes
    - Intraday price data (1min, 5min, 15min intervals)
    - Technical indicators (RSI, SMA, EMA)
    """

    BASE_URL = "https://www.alphavantage.co/query"
    RATE_LIMIT_DELAY = 12  # seconds between requests (5 calls per minute = 12s delay)

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Alpha Vantage provider.

        Args:
            api_key: Alpha Vantage API key. If None, reads from ALPHA_VANTAGE_API_KEY env var
        """
        self.api_key = api_key or os.getenv('ALPHA_VANTAGE_API_KEY')
        if not self.api_key:
            raise ValueError("Alpha Vantage API key required. Set ALPHA_VANTAGE_API_KEY environment variable.")

        self.last_request_time = 0  # Track last API call for rate limiting

    def _rate_limit(self):
        """
        Enforce rate limiting: Wait at least 12 seconds between API calls.
        Alpha Vantage free tier allows 5 calls per minute.
        """
        elapsed = time.time() - self.last_request_time
        if elapsed < self.RATE_LIMIT_DELAY:
            sleep_time = self.RATE_LIMIT_DELAY - elapsed
            print(f"[Rate Limit] Waiting {sleep_time:.1f}s before next API call...")
            time.sleep(sleep_time)

        self.last_request_time = time.time()

    def _make_request(self, params: Dict) -> Dict:
        """
        Make HTTP request to Alpha Vantage API with rate limiting.

        Args:
            params: Query parameters (function, symbol, interval, etc.)

        Returns:
            JSON response from API

        Raises:
            Exception: If API returns error or request fails
        """
        self._rate_limit()

        params['apikey'] = self.api_key

        try:
            response = requests.get(self.BASE_URL, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Check for API error messages
            if "Error Message" in data:
                raise Exception(f"Alpha Vantage API Error: {data['Error Message']}")
            if "Note" in data:
                # Rate limit message
                raise Exception(f"Alpha Vantage Rate Limit: {data['Note']}")

            return data

        except requests.exceptions.RequestException as e:
            raise Exception(f"HTTP request failed: {str(e)}")

    def get_quote(self, symbol: str) -> Dict:
        """
        Get real-time quote for a stock symbol.

        Args:
            symbol: Stock ticker (e.g., 'AAPL', 'MSFT')

        Returns:
            Dictionary with quote data:
            {
                'symbol': 'AAPL',
                'price': 178.32,
                'volume': 52341234,
                'timestamp': '2025-10-15 09:35:00',
                'change': 2.15,
                'change_percent': 1.22
            }
        """
        params = {
            'function': 'GLOBAL_QUOTE',
            'symbol': symbol
        }

        data = self._make_request(params)
        quote = data.get('Global Quote', {})

        if not quote:
            raise Exception(f"No quote data returned for {symbol}")

        return {
            'symbol': quote.get('01. symbol'),
            'price': float(quote.get('05. price', 0)),
            'volume': int(quote.get('06. volume', 0)),
            'timestamp': quote.get('07. latest trading day'),
            'change': float(quote.get('09. change', 0)),
            'change_percent': float(quote.get('10. change percent', '0%').replace('%', ''))
        }

    def get_intraday_prices(self, symbol: str, interval: str = '5min', outputsize: str = 'compact') -> List[Dict]:
        """
        Get intraday price data (for day trading).

        Args:
            symbol: Stock ticker (e.g., 'AAPL')
            interval: Time interval ('1min', '5min', '15min', '30min', '60min')
            outputsize: 'compact' (last 100 data points) or 'full' (full history)

        Returns:
            List of price bars, newest first:
            [
                {
                    'timestamp': '2025-10-15 09:35:00',
                    'open': 178.20,
                    'high': 178.45,
                    'low': 178.10,
                    'close': 178.32,
                    'volume': 1234567
                },
                ...
            ]
        """
        params = {
            'function': 'TIME_SERIES_INTRADAY',
            'symbol': symbol,
            'interval': interval,
            'outputsize': outputsize
        }

        data = self._make_request(params)
        time_series_key = f'Time Series ({interval})'
        time_series = data.get(time_series_key, {})

        if not time_series:
            raise Exception(f"No intraday data returned for {symbol}")

        # Convert to list of dictionaries (newest first)
        prices = []
        for timestamp, values in time_series.items():
            prices.append({
                'timestamp': timestamp,
                'open': float(values['1. open']),
                'high': float(values['2. high']),
                'low': float(values['3. low']),
                'close': float(values['4. close']),
                'volume': int(values['5. volume'])
            })

        return prices

    def get_rsi(self, symbol: str, interval: str = '5min', time_period: int = 14) -> List[Dict]:
        """
        Get RSI (Relative Strength Index) indicator.

        RSI measures momentum: 0-30 = oversold (potential buy), 70-100 = overbought (potential sell)

        Args:
            symbol: Stock ticker
            interval: Time interval ('1min', '5min', '15min', '30min', '60min', 'daily')
            time_period: Number of periods for RSI calculation (default 14)

        Returns:
            List of RSI values:
            [
                {'timestamp': '2025-10-15 09:35:00', 'rsi': 28.5},
                ...
            ]
        """
        params = {
            'function': 'RSI',
            'symbol': symbol,
            'interval': interval,
            'time_period': time_period,
            'series_type': 'close'
        }

        data = self._make_request(params)
        technical_analysis = data.get('Technical Analysis: RSI', {})

        if not technical_analysis:
            raise Exception(f"No RSI data returned for {symbol}")

        rsi_values = []
        for timestamp, values in technical_analysis.items():
            rsi_values.append({
                'timestamp': timestamp,
                'rsi': float(values['RSI'])
            })

        return rsi_values

    def get_sma(self, symbol: str, interval: str = '5min', time_period: int = 50) -> List[Dict]:
        """
        Get SMA (Simple Moving Average) indicator.

        Used for trend identification and moving average crossover strategies.

        Args:
            symbol: Stock ticker
            interval: Time interval
            time_period: Number of periods (e.g., 50 for 50-period SMA)

        Returns:
            List of SMA values:
            [
                {'timestamp': '2025-10-15 09:35:00', 'sma': 177.85},
                ...
            ]
        """
        params = {
            'function': 'SMA',
            'symbol': symbol,
            'interval': interval,
            'time_period': time_period,
            'series_type': 'close'
        }

        data = self._make_request(params)
        technical_analysis = data.get('Technical Analysis: SMA', {})

        if not technical_analysis:
            raise Exception(f"No SMA data returned for {symbol}")

        sma_values = []
        for timestamp, values in technical_analysis.items():
            sma_values.append({
                'timestamp': timestamp,
                'sma': float(values['SMA'])
            })

        return sma_values

    def get_vwap(self, symbol: str, interval: str = '5min') -> List[Dict]:
        """
        Get VWAP (Volume Weighted Average Price) indicator.

        VWAP is the most important indicator for day traders.
        - Price above VWAP = bullish (institutional buying)
        - Price below VWAP = bearish (institutional selling)

        Args:
            symbol: Stock ticker
            interval: Time interval

        Returns:
            List of VWAP values:
            [
                {'timestamp': '2025-10-15 09:35:00', 'vwap': 178.12},
                ...
            ]
        """
        params = {
            'function': 'VWAP',
            'symbol': symbol,
            'interval': interval
        }

        data = self._make_request(params)
        technical_analysis = data.get('Technical Analysis: VWAP', {})

        if not technical_analysis:
            raise Exception(f"No VWAP data returned for {symbol}")

        vwap_values = []
        for timestamp, values in technical_analysis.items():
            vwap_values.append({
                'timestamp': timestamp,
                'vwap': float(values['VWAP'])
            })

        return vwap_values


# Example usage
if __name__ == '__main__':
    """
    Test Alpha Vantage provider with sample queries.

    Run: python -m packages.providers.alphavantage
    """
    provider = AlphaVantageProvider()

    # Get real-time quote
    print("\n=== Real-Time Quote ===")
    quote = provider.get_quote('AAPL')
    print(f"AAPL: ${quote['price']:.2f} ({quote['change_percent']:+.2f}%)")

    # Get intraday prices
    print("\n=== Intraday Prices (last 5 bars) ===")
    prices = provider.get_intraday_prices('AAPL', interval='5min', outputsize='compact')
    for price in prices[:5]:
        print(f"{price['timestamp']}: ${price['close']:.2f} (vol: {price['volume']:,})")

    # Get RSI
    print("\n=== RSI Indicator ===")
    rsi_values = provider.get_rsi('AAPL', interval='5min')
    latest_rsi = rsi_values[0]
    print(f"RSI at {latest_rsi['timestamp']}: {latest_rsi['rsi']:.2f}")
    if latest_rsi['rsi'] < 30:
        print("  → OVERSOLD (potential buy signal)")
    elif latest_rsi['rsi'] > 70:
        print("  → OVERBOUGHT (potential sell signal)")
    else:
        print("  → NEUTRAL")
