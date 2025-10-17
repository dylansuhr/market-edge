"""
Polygon.io API Provider

This module fetches real-time and historical stock market data from Polygon.io.
Free tier: 5 API calls per minute (7,200 per day)

Documentation: https://polygon.io/docs/stocks/getting-started
"""

import os
import time
import requests
from typing import Dict, List, Optional
from datetime import datetime, timedelta


class PolygonProvider:
    """
    Client for Polygon.io Stock Market API.

    Provides methods to fetch:
    - Real-time stock quotes
    - Intraday aggregate bars (1min, 5min, 15min intervals)
    - Historical price data (2 years on free tier)

    Free tier limits:
    - 5 API calls per minute
    - 2 years historical data
    - End-of-day data + minute aggregates
    """

    BASE_URL = "https://api.polygon.io"
    RATE_LIMIT_DELAY = 12  # seconds between requests (5 calls per minute = 12s delay)

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Polygon provider.

        Args:
            api_key: Polygon.io API key. If None, reads from POLYGON_API_KEY env var
        """
        self.api_key = api_key or os.getenv('POLYGON_API_KEY')
        if not self.api_key:
            raise ValueError("Polygon.io API key required. Set POLYGON_API_KEY environment variable.")

        self.last_request_time = 0  # Track last API call for rate limiting

    def _rate_limit(self):
        """
        Enforce rate limiting: Wait at least 12 seconds between API calls.
        Polygon.io free tier allows 5 calls per minute.
        """
        elapsed = time.time() - self.last_request_time
        if elapsed < self.RATE_LIMIT_DELAY:
            sleep_time = self.RATE_LIMIT_DELAY - elapsed
            print(f"[Rate Limit] Waiting {sleep_time:.1f}s before next API call...")
            time.sleep(sleep_time)

        self.last_request_time = time.time()

    def _make_request(self, endpoint: str, params: Dict = None) -> Dict:
        """
        Make HTTP request to Polygon.io API with rate limiting.

        Args:
            endpoint: API endpoint (e.g., '/v2/aggs/ticker/AAPL/range/1/day/...')
            params: Query parameters

        Returns:
            JSON response from API

        Raises:
            Exception: If API returns error or request fails
        """
        self._rate_limit()

        url = f"{self.BASE_URL}{endpoint}"
        params = params or {}
        params['apiKey'] = self.api_key

        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Check for API error messages
            if data.get('status') == 'ERROR':
                raise Exception(f"Polygon.io API Error: {data.get('error', 'Unknown error')}")

            return data

        except requests.exceptions.RequestException as e:
            raise Exception(f"HTTP request failed: {str(e)}")

    def get_last_quote(self, symbol: str) -> Dict:
        """
        Get the most recent quote for a stock symbol.

        Args:
            symbol: Stock ticker (e.g., 'AAPL', 'MSFT')

        Returns:
            Dictionary with quote data:
            {
                'symbol': 'AAPL',
                'price': 178.32,
                'bid': 178.30,
                'ask': 178.35,
                'timestamp': '2025-10-15 09:35:00'
            }
        """
        endpoint = f"/v2/last/trade/{symbol}"
        data = self._make_request(endpoint)

        if data.get('status') != 'OK':
            raise Exception(f"No quote data returned for {symbol}")

        results = data.get('results', {})
        timestamp = results.get('t', 0) / 1000  # Convert milliseconds to seconds

        return {
            'symbol': symbol,
            'price': results.get('p', 0),
            'size': results.get('s', 0),
            'timestamp': datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')
        }

    def get_aggregates(
        self,
        symbol: str,
        multiplier: int = 5,
        timespan: str = 'minute',
        from_date: str = None,
        to_date: str = None,
        limit: int = 120
    ) -> List[Dict]:
        """
        Get aggregate bars (OHLCV) for a stock.

        This is the PRIMARY method for fetching price data.
        One API call returns multiple bars with open, high, low, close, volume.

        Args:
            symbol: Stock ticker (e.g., 'AAPL')
            multiplier: Size of timespan (e.g., 5 for 5-minute bars)
            timespan: Unit of time ('minute', 'hour', 'day', 'week', 'month')
            from_date: Start date (YYYY-MM-DD format). Defaults to yesterday.
            to_date: End date (YYYY-MM-DD format). Defaults to today.
            limit: Max number of bars to return (default 120 = last 10 hours of 5-min bars)

        Returns:
            List of aggregate bars, oldest first:
            [
                {
                    'timestamp': '2025-10-15 09:35:00',
                    'open': 178.20,
                    'high': 178.45,
                    'low': 178.10,
                    'close': 178.32,
                    'volume': 1234567,
                    'vwap': 178.25  # Volume-weighted average price (provided by Polygon)
                },
                ...
            ]
        """
        # Default date range: last 14 days (ensures we get enough bars for SMA(50))
        # Need 50+ 5-minute bars, which is ~4-5 trading days of data
        if not from_date:
            from_date = (datetime.now() - timedelta(days=14)).strftime('%Y-%m-%d')
        if not to_date:
            to_date = datetime.now().strftime('%Y-%m-%d')

        endpoint = f"/v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{from_date}/{to_date}"
        params = {
            'adjusted': 'true',  # Adjust for splits/dividends
            'sort': 'asc',       # Oldest first
            'limit': limit
        }

        data = self._make_request(endpoint, params)

        if not data.get('results'):
            raise Exception(f"No aggregate data returned for {symbol}")

        # Convert to standardized format
        bars = []
        for result in data['results']:
            timestamp_ms = result['t']
            timestamp = datetime.fromtimestamp(timestamp_ms / 1000).strftime('%Y-%m-%d %H:%M:%S')

            bars.append({
                'timestamp': timestamp,
                'open': result['o'],
                'high': result['h'],
                'low': result['l'],
                'close': result['c'],
                'volume': result['v'],
                'vwap': result.get('vw', 0)  # VWAP provided by Polygon (bonus!)
            })

        return bars

    def get_intraday_prices(self, symbol: str, interval: str = '5min', outputsize: str = 'compact') -> List[Dict]:
        """
        Get intraday price data (for day trading).

        This is a compatibility method that matches Alpha Vantage's interface.
        Internally uses get_aggregates() with appropriate parameters.

        Args:
            symbol: Stock ticker (e.g., 'AAPL')
            interval: Time interval ('1min', '5min', '15min', '30min', '60min')
            outputsize: 'compact' (last 100 data points) or 'full' (not used, Polygon uses limit)

        Returns:
            List of price bars, newest first (matches Alpha Vantage format):
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
        # Parse interval string (e.g., '5min' -> multiplier=5, timespan='minute')
        interval_map = {
            '1min': (1, 'minute'),
            '5min': (5, 'minute'),
            '15min': (15, 'minute'),
            '30min': (30, 'minute'),
            '60min': (1, 'hour')
        }

        if interval not in interval_map:
            raise ValueError(f"Invalid interval: {interval}. Must be one of {list(interval_map.keys())}")

        multiplier, timespan = interval_map[interval]

        # Fetch aggregates (oldest first)
        bars = self.get_aggregates(
            symbol=symbol,
            multiplier=multiplier,
            timespan=timespan,
            limit=100 if outputsize == 'compact' else 500
        )

        # Reverse to newest first (match Alpha Vantage format)
        return list(reversed(bars))

    def get_previous_close(self, symbol: str) -> Dict:
        """
        Get the previous day's closing price.

        Useful for calculating daily returns and settlement.

        Args:
            symbol: Stock ticker

        Returns:
            Dictionary:
            {
                'symbol': 'AAPL',
                'close': 178.50,
                'high': 179.00,
                'low': 177.80,
                'open': 178.00,
                'volume': 45678901,
                'timestamp': '2025-10-14'
            }
        """
        endpoint = f"/v2/aggs/ticker/{symbol}/prev"
        data = self._make_request(endpoint)

        if not data.get('results'):
            raise Exception(f"No previous close data returned for {symbol}")

        result = data['results'][0]
        timestamp_ms = result['t']
        timestamp = datetime.fromtimestamp(timestamp_ms / 1000).strftime('%Y-%m-%d')

        return {
            'symbol': symbol,
            'close': result['c'],
            'high': result['h'],
            'low': result['l'],
            'open': result['o'],
            'volume': result['v'],
            'timestamp': timestamp
        }


# Example usage
if __name__ == '__main__':
    """
    Test Polygon.io provider with sample queries.

    Run: python -m packages.providers.polygon_provider
    """
    provider = PolygonProvider()

    # Get last quote
    print("\n=== Last Quote ===")
    try:
        quote = provider.get_last_quote('AAPL')
        print(f"AAPL: ${quote['price']:.2f} at {quote['timestamp']}")
    except Exception as e:
        print(f"Error: {e}")

    # Get 5-minute aggregate bars
    print("\n=== 5-Minute Aggregate Bars (last 5 bars) ===")
    try:
        bars = provider.get_aggregates('AAPL', multiplier=5, timespan='minute', limit=5)
        for bar in bars:
            print(f"{bar['timestamp']}: ${bar['close']:.2f} (vol: {bar['volume']:,})")
    except Exception as e:
        print(f"Error: {e}")

    # Get intraday prices (Alpha Vantage compatible)
    print("\n=== Intraday Prices (Alpha Vantage format) ===")
    try:
        prices = provider.get_intraday_prices('AAPL', interval='5min', outputsize='compact')
        print(f"Fetched {len(prices)} price bars")
        for price in prices[:3]:
            print(f"{price['timestamp']}: ${price['close']:.2f}")
    except Exception as e:
        print(f"Error: {e}")

    # Get previous close
    print("\n=== Previous Close ===")
    try:
        prev = provider.get_previous_close('AAPL')
        print(f"AAPL previous close: ${prev['close']:.2f} on {prev['timestamp']}")
    except Exception as e:
        print(f"Error: {e}")
