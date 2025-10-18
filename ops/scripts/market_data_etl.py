"""
Market Data ETL (Extract, Transform, Load)

Fetches stock market data from Polygon.io and loads into PostgreSQL.

This script runs every 5 minutes during market hours (9:30 AM - 4 PM ET)
to keep price data fresh for the RL trading agent.

Usage:
    python ops/scripts/market_data_etl.py --symbols AAPL,MSFT,GOOGL
"""

import sys
import os
import argparse
from datetime import datetime, time
from typing import List
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add packages to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'packages'))

from providers.polygon_provider import PolygonProvider
from shared.shared.db import (
    upsert_stock,
    get_stock_id,
    bulk_insert_price_snapshots,
    upsert_technical_indicator,
    get_recent_prices
)
from shared.shared.indicators import calculate_rsi, calculate_sma, calculate_vwap


# Default stocks to track (high-liquidity stocks)
DEFAULT_STOCKS = [
    ('AAPL', 'Apple Inc.', 'NASDAQ', 'Technology'),
    ('MSFT', 'Microsoft Corporation', 'NASDAQ', 'Technology'),
    ('GOOGL', 'Alphabet Inc.', 'NASDAQ', 'Technology'),
    ('TSLA', 'Tesla Inc.', 'NASDAQ', 'Automotive'),
    ('NVDA', 'NVIDIA Corporation', 'NASDAQ', 'Technology'),
    ('SPY', 'SPDR S&P 500 ETF', 'NYSE', 'ETF'),
    ('QQQ', 'Invesco QQQ Trust', 'NASDAQ', 'ETF'),
    ('META', 'Meta Platforms Inc.', 'NASDAQ', 'Technology'),
    ('AMZN', 'Amazon.com Inc.', 'NASDAQ', 'Technology'),
    ('JPM', 'JPMorgan Chase & Co.', 'NYSE', 'Finance')
]


def is_market_open() -> bool:
    """
    Check if US stock market is currently open.

    Market hours: Monday-Friday, 9:30 AM - 4:00 PM ET

    Returns:
        True if market is open, False otherwise
    """
    now = datetime.now()

    # Check if weekend
    if now.weekday() >= 5:  # Saturday=5, Sunday=6
        return False

    # Check if within market hours (9:30 AM - 4:00 PM)
    market_open = time(9, 30)
    market_close = time(16, 0)
    current_time = now.time()

    return market_open <= current_time <= market_close


def fetch_and_store_stock_data(
    provider: PolygonProvider,
    symbol: str,
    name: str,
    exchange: str,
    sector: str,
    interval: str = '5min'
) -> int:
    """
    Fetch and store data for a single stock.

    Args:
        provider: Polygon.io API provider
        symbol: Stock ticker (e.g., 'AAPL')
        name: Company name
        exchange: Stock exchange
        sector: Industry sector
        interval: Time interval ('1min', '5min', '15min', '30min', '60min')

    Returns:
        Number of price snapshots inserted
    """
    print(f"\n[{symbol}] Fetching data...")

    # 1. Upsert stock metadata
    stock_id = upsert_stock(symbol, name, exchange, sector)
    print(f"  ✓ Stock ID: {stock_id}")

    # 2. Fetch intraday prices from Polygon.io
    # NOTE: This is ONE API call that gets all OHLCV data
    try:
        prices = provider.get_intraday_prices(symbol, interval=interval, outputsize='compact')
        print(f"  ✓ Fetched {len(prices)} price bars")
    except Exception as e:
        print(f"  ✗ Failed to fetch prices: {str(e)}")
        return 0

    if len(prices) == 0:
        print(f"  ⚠ No price data available for {symbol}")
        return 0

    # 3. Transform and load price data
    snapshots = []
    for price in prices:
        snapshots.append({
            'stock_id': stock_id,
            'timestamp': price['timestamp'],
            'open': price['open'],
            'high': price['high'],
            'low': price['low'],
            'close': price['close'],
            'volume': price['volume']
        })

    inserted = bulk_insert_price_snapshots(snapshots)
    print(f"  ✓ Inserted {inserted} new price snapshots")

    # 4. Calculate and store technical indicators (NO additional API calls!)
    # We calculate RSI, SMA, VWAP locally using the price data we already have
    # BUT we need to check the DATABASE for total bars, not just the API response
    try:
        # Get ALL recent prices from database (for SMA calculation)
        all_prices = get_recent_prices(stock_id, limit=100)
        # Convert Decimal to float
        close_prices = [float(p['close']) for p in reversed(all_prices)]

        print(f"  Database has {len(all_prices)} total bars")

        # RSI (14-period) - needs at least 15 prices
        if len(close_prices) >= 15:
            rsi = calculate_rsi(close_prices, period=14)
            latest_timestamp = prices[0]['timestamp']  # Newest timestamp
            upsert_technical_indicator(
                stock_id,
                latest_timestamp,
                'RSI',
                rsi
            )
            print(f"  ✓ RSI: {rsi:.2f}")
        else:
            print(f"  ⚠ Need 15+ prices for RSI (have {len(close_prices)})")

        # SMA (50-period) - needs at least 50 prices
        if len(close_prices) >= 50:
            sma = calculate_sma(close_prices, period=50)
            latest_timestamp = prices[0]['timestamp']
            upsert_technical_indicator(
                stock_id,
                latest_timestamp,
                'SMA_50',
                sma
            )
            print(f"  ✓ SMA(50): {sma:.2f}")
        else:
            print(f"  ⚠ Need 50+ prices for SMA(50) (have {len(close_prices)})")

        # VWAP - needs at least 1 price with volume
        # Use API response prices (they're already floats)
        vwap_bars = [{'close': float(p['close']), 'volume': int(p['volume'])} for p in prices]
        vwap = calculate_vwap(vwap_bars)
        latest_timestamp = prices[0]['timestamp']
        upsert_technical_indicator(
            stock_id,
            latest_timestamp,
            'VWAP',
            vwap
        )
        print(f"  ✓ VWAP: {vwap:.2f}")

    except Exception as e:
        print(f"  ⚠ Warning: Failed to calculate indicators: {str(e)}")

    return inserted


def main():
    """Main ETL execution."""
    parser = argparse.ArgumentParser(description='Market Data ETL')
    parser.add_argument(
        '--symbols',
        type=str,
        help='Comma-separated list of stock symbols (e.g., AAPL,MSFT,GOOGL)'
    )
    parser.add_argument(
        '--interval',
        type=str,
        default='5min',
        choices=['1min', '5min', '15min', '30min', '60min'],
        help='Time interval for intraday data'
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Run even if market is closed (for testing)'
    )

    args = parser.parse_args()

    print("=" * 60)
    print("MARKET DATA ETL")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Check if market is open
    if not args.force and not is_market_open():
        print("\n⚠ Market is closed. Exiting.")
        print("  (Use --force to run anyway)")
        return

    print("\n✓ Market is open")

    # Initialize provider
    try:
        provider = PolygonProvider()
        print("✓ Polygon.io provider initialized")
    except Exception as e:
        print(f"✗ Failed to initialize provider: {str(e)}")
        sys.exit(1)

    # Determine which stocks to process
    if args.symbols:
        # Parse comma-separated symbols
        symbols = args.symbols.split(',')
        stocks = [(s.strip(), f"{s.strip()} Stock", 'NASDAQ', 'Unknown') for s in symbols]
    else:
        stocks = DEFAULT_STOCKS

    print(f"\n📊 Processing {len(stocks)} stocks...")

    # Process each stock
    total_inserted = 0
    for symbol, name, exchange, sector in stocks:
        try:
            inserted = fetch_and_store_stock_data(
                provider,
                symbol,
                name,
                exchange,
                sector,
                interval=args.interval
            )
            total_inserted += inserted
        except Exception as e:
            print(f"\n✗ [{symbol}] Fatal error: {str(e)}")
            continue

    # Summary
    print("\n" + "=" * 60)
    print(f"ETL COMPLETE")
    print(f"  Total stocks processed: {len(stocks)}")
    print(f"  Total price snapshots inserted: {total_inserted}")
    print("=" * 60)


if __name__ == '__main__':
    main()
