"""
Market data providers package.

This package contains integrations with external APIs for fetching stock market data.
"""

from .alpaca_provider import AlpacaProvider

__all__ = ['AlpacaProvider']
