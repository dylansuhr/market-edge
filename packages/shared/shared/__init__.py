"""
Shared utilities package for Market-Edge.

Contains database operations, technical indicator calculations, and helper functions.
"""

from .db import (
    get_db_connection,
    upsert_stock,
    upsert_price_snapshot,
    insert_paper_trade,
    get_active_positions,
    get_paper_bankroll
)

from .indicators import (
    calculate_rsi,
    calculate_sma,
    calculate_vwap
)

__all__ = [
    # Database functions
    'get_db_connection',
    'upsert_stock',
    'upsert_price_snapshot',
    'insert_paper_trade',
    'get_active_positions',
    'get_paper_bankroll',

    # Technical indicator functions
    'calculate_rsi',
    'calculate_sma',
    'calculate_vwap'
]
