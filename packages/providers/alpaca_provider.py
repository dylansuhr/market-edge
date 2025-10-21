"""
Alpaca Market Data v2 Provider

Fetches real-time and historical stock market data from Alpaca's Market Data API.

Documentation:
    https://docs.alpaca.markets/reference/market-data-api-overview
"""

from __future__ import annotations

import os
import time
from datetime import datetime
from typing import Dict, List, Optional

import requests


class AlpacaProvider:
    """
    Client for Alpaca Market Data v2 API.

    Provides methods to fetch:
    - Latest trades/quotes
    - Intraday aggregate bars (1min, 5min, 15min intervals)
    - Historical price data (multi-year)
    """

    DEFAULT_BASE_URL = "https://data.alpaca.markets/v2"
    MAX_RETRIES = 3
    BACKOFF_BASE_SECONDS = 1.5

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        """
        Initialize Alpaca provider.

        Args:
            api_key: Alpaca API key ID. Defaults to APCA_API_KEY_ID env var.
            api_secret: Alpaca API secret. Defaults to APCA_API_SECRET_KEY env var.
            base_url: Base URL for data API. Defaults to https://data.alpaca.markets/v2.
        """
        self.api_key = api_key or os.getenv("APCA_API_KEY_ID")
        self.api_secret = api_secret or os.getenv("APCA_API_SECRET_KEY")
        self.base_url = base_url or os.getenv("APCA_DATA_BASE_URL", self.DEFAULT_BASE_URL)

        if not self.api_key or not self.api_secret:
            raise ValueError("Alpaca API credentials required (APCA_API_KEY_ID / APCA_API_SECRET_KEY).")

    def _make_request(self, method: str, endpoint: str, params: Optional[Dict] = None) -> Dict:
        """
        Make HTTP request to Alpaca Market Data API with retry/backoff.

        Args:
            method: HTTP method (currently only GET is used).
            endpoint: API path (e.g., '/stocks/AAPL/bars').
            params: Query parameters.

        Returns:
            JSON response as dictionary.

        Raises:
            Exception: If all retries fail or API returns an error payload.
        """
        url = f"{self.base_url}{endpoint}"
        headers = {
            "APCA-API-KEY-ID": self.api_key,
            "APCA-API-SECRET-KEY": self.api_secret,
        }

        attempt = 0
        while attempt < self.MAX_RETRIES:
            try:
                response = requests.request(method, url, headers=headers, params=params, timeout=30)

                if response.status_code == 429:
                    wait = self.BACKOFF_BASE_SECONDS * (2 ** attempt)
                    remaining = response.headers.get("X-RateLimit-Remaining", "?")
                    reset = response.headers.get("X-RateLimit-Reset", "?")
                    print(f"[Alpaca] Rate limited (remaining={remaining}, reset={reset}). Retrying in {wait:.1f}s...")
                    time.sleep(wait)
                    attempt += 1
                    continue

                response.raise_for_status()
                data = response.json()

                if "error" in data:
                    raise Exception(f"Alpaca API error: {data['error'].get('message', 'Unknown error')}")

                return data
            except requests.exceptions.RequestException as exc:
                attempt += 1
                if attempt >= self.MAX_RETRIES:
                    raise Exception(f"HTTP request failed after {self.MAX_RETRIES} attempts: {exc}") from exc

                wait = self.BACKOFF_BASE_SECONDS * (2 ** attempt)
                print(f"[Alpaca] Request error: {exc}. Retrying in {wait:.1f}s...")
                time.sleep(wait)

        raise Exception("Exceeded maximum retries for Alpaca API request.")

    @staticmethod
    def _normalize_timestamp(ts: str) -> str:
        """
        Convert Alpaca ISO8601 timestamp to '%Y-%m-%d %H:%M:%S'.

        Args:
            ts: Timestamp string from API (ISO8601 with Z suffix).

        Returns:
            Normalized timestamp string.
        """
        # Alpaca timestamps look like '2024-01-12T15:55:00Z'
        if ts.endswith("Z"):
            ts = ts.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts)
        return dt.strftime("%Y-%m-%d %H:%M:%S")

    def get_last_quote(self, symbol: str) -> Dict:
        """
        Fetch latest trade/quote snapshot for a symbol.

        Args:
            symbol: Stock ticker (e.g., 'AAPL').

        Returns:
            Dictionary with quote data (price from latest trade, bid/ask from latest quote).
        """
        endpoint = f"/stocks/{symbol}/snapshot"
        data = self._make_request("GET", endpoint)

        snapshot = data.get("snapshot")
        if not snapshot:
            raise Exception(f"No snapshot data returned for {symbol}")

        latest_trade = snapshot.get("latestTrade") or {}
        latest_quote = snapshot.get("latestQuote") or {}

        trade_price = latest_trade.get("p")
        trade_size = latest_trade.get("s")
        trade_timestamp = latest_trade.get("t")

        if trade_timestamp:
            timestamp = self._normalize_timestamp(trade_timestamp)
        else:
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        return {
            "symbol": symbol,
            "price": trade_price,
            "size": trade_size,
            "bid": latest_quote.get("bp"),
            "ask": latest_quote.get("ap"),
            "timestamp": timestamp,
        }

    def get_aggregates(
        self,
        symbol: str,
        multiplier: int = 5,
        timespan: str = "minute",
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict]:
        """
        Fetch aggregate bars for a symbol.

        Args:
            symbol: Stock ticker (e.g., 'AAPL').
            multiplier: Size of the timeframe multiplier.
            timespan: Unit of time ('minute', 'hour', 'day', etc.).
            from_date: Optional ISO8601 start timestamp.
            to_date: Optional ISO8601 end timestamp.
            limit: Maximum number of bars to return.

        Returns:
            List of aggregate bars ordered oldest first.
        """
        timeframe_map = {
            "minute": "Min",
            "hour": "Hour",
            "day": "Day",
            "week": "Week",
            "month": "Month",
        }

        if timespan not in timeframe_map:
            raise ValueError(f"Invalid timespan '{timespan}'.")

        timeframe = f"{multiplier}{timeframe_map[timespan]}"
        params: Dict[str, str] = {
            "timeframe": timeframe,
            "limit": str(limit),
            "adjustment": "all",
        }
        if from_date:
            params["start"] = from_date
        if to_date:
            params["end"] = to_date

        endpoint = f"/stocks/{symbol}/bars"
        data = self._make_request("GET", endpoint, params=params)
        bars = data.get("bars", [])

        if not bars:
            raise Exception(f"No aggregate data returned for {symbol}")

        normalized = []
        for bar in bars:
            normalized.append(
                {
                    "timestamp": self._normalize_timestamp(bar["t"]),
                    "open": bar["o"],
                    "high": bar["h"],
                    "low": bar["l"],
                    "close": bar["c"],
                    "volume": bar["v"],
                    "vwap": bar.get("vw", 0),
                }
            )

        return normalized

    def get_intraday_prices(
        self,
        symbol: str,
        interval: str = "5min",
        outputsize: str = "compact",
    ) -> List[Dict]:
        """
        Fetch intraday price bars (Alpha Vantage compatible signature).

        Args:
            symbol: Stock ticker (e.g., 'AAPL').
            interval: Interval string ('1min', '5min', '15min', '30min', '60min').
            outputsize: 'compact' (100 bars) or 'full' (500 bars).

        Returns:
            List of price bars ordered newest first.
        """
        interval_map = {
            "1min": (1, "minute"),
            "5min": (5, "minute"),
            "15min": (15, "minute"),
            "30min": (30, "minute"),
            "60min": (1, "hour"),
        }

        if interval not in interval_map:
            raise ValueError(f"Invalid interval '{interval}'. Must be one of {list(interval_map.keys())}")

        multiplier, timespan = interval_map[interval]
        limit = 100 if outputsize == "compact" else 500

        bars = self.get_aggregates(
            symbol=symbol,
            multiplier=multiplier,
            timespan=timespan,
            limit=limit,
        )

        return list(reversed(bars))

    def get_previous_close(self, symbol: str) -> Dict:
        """
        Fetch the latest daily bar for the symbol.

        Args:
            symbol: Stock ticker.

        Returns:
            Dictionary containing previous close information.
        """
        params = {
            "timeframe": "1Day",
            "limit": "2",
            "adjustment": "all",
        }
        endpoint = f"/stocks/{symbol}/bars"
        data = self._make_request("GET", endpoint, params=params)
        bars = data.get("bars", [])

        if not bars:
            raise Exception(f"No previous close data returned for {symbol}")

        latest_bar = bars[-1]

        return {
            "symbol": symbol,
            "close": latest_bar["c"],
            "high": latest_bar["h"],
            "low": latest_bar["l"],
            "open": latest_bar["o"],
            "volume": latest_bar["v"],
            "timestamp": self._normalize_timestamp(latest_bar["t"]).split(" ")[0],
        }


# Example usage
if __name__ == "__main__":
    provider = AlpacaProvider()

    print("\n=== Snapshot ===")
    try:
        quote = provider.get_last_quote("AAPL")
        print(f"AAPL: ${quote['price']} bid={quote['bid']} ask={quote['ask']} at {quote['timestamp']}")
    except Exception as exc:
        print(f"Error fetching snapshot: {exc}")

    print("\n=== 5-minute bars (last 5) ===")
    try:
        bars = provider.get_aggregates("AAPL", multiplier=5, timespan="minute", limit=5)
        for bar in bars:
            print(f"{bar['timestamp']}: {bar['close']} (vol {bar['volume']})")
    except Exception as exc:
        print(f"Error fetching bars: {exc}")

    print("\n=== Intraday prices (Alpha Vantage format) ===")
    try:
        prices = provider.get_intraday_prices("AAPL", interval="5min")
        print(f"Fetched {len(prices)} bars, newest: {prices[0]['timestamp']} ${prices[0]['close']}")
    except Exception as exc:
        print(f"Error fetching intraday prices: {exc}")

    print("\n=== Previous close ===")
    try:
        prev = provider.get_previous_close("AAPL")
        print(f"Previous close: ${prev['close']} on {prev['timestamp']}")
    except Exception as exc:
        print(f"Error fetching previous close: {exc}")
