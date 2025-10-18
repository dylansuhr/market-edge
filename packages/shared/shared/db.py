"""
Database operations module.

All database writes go through this module to ensure:
1. Idempotent operations (safe to re-run scripts)
2. Consistent error handling
3. Connection pooling
4. Transaction management

Database: PostgreSQL (Neon or local)
ORM: psycopg2 (lightweight, no ORM overhead)
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from contextlib import contextmanager


def get_db_connection():
    """
    Get PostgreSQL database connection.

    Reads from DATABASE_URL environment variable.
    Format: postgresql://user:password@host:port/database

    Returns:
        psycopg2 connection object

    Raises:
        ValueError: If DATABASE_URL not set
        psycopg2.Error: If connection fails
    """
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")

    try:
        conn = psycopg2.connect(database_url)
        return conn
    except psycopg2.Error as e:
        raise Exception(f"Database connection failed: {str(e)}")


@contextmanager
def get_cursor(commit=True):
    """
    Context manager for database cursor with automatic commit/rollback.

    Usage:
        with get_cursor() as cur:
            cur.execute("INSERT INTO ...")

    Args:
        commit: If True, commits transaction on success. If False, rollback.

    Yields:
        Database cursor (returns rows as dictionaries)
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        yield cur
        if commit:
            conn.commit()
        else:
            conn.rollback()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()


# ============================================================================
# STOCK OPERATIONS
# ============================================================================

def upsert_stock(symbol: str, name: str, exchange: str = 'NASDAQ', sector: str = None) -> int:
    """
    Insert or update stock metadata.

    Uses ON CONFLICT to prevent duplicates (idempotent operation).

    Args:
        symbol: Stock ticker (e.g., 'AAPL')
        name: Company name (e.g., 'Apple Inc.')
        exchange: Stock exchange (e.g., 'NASDAQ', 'NYSE')
        sector: Industry sector (e.g., 'Technology', 'Finance')

    Returns:
        stock_id (primary key)
    """
    with get_cursor() as cur:
        cur.execute("""
            INSERT INTO stocks (symbol, name, exchange, sector)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (symbol) DO UPDATE
            SET name = EXCLUDED.name,
                exchange = EXCLUDED.exchange,
                sector = EXCLUDED.sector,
                updated_at = CURRENT_TIMESTAMP
            RETURNING stock_id
        """, (symbol, name, exchange, sector))

        result = cur.fetchone()
        return result['stock_id']


def get_stock_id(symbol: str) -> Optional[int]:
    """
    Get stock_id for a given symbol.

    Args:
        symbol: Stock ticker (e.g., 'AAPL')

    Returns:
        stock_id or None if not found
    """
    with get_cursor(commit=False) as cur:
        cur.execute("SELECT stock_id FROM stocks WHERE symbol = %s", (symbol,))
        result = cur.fetchone()
        return result['stock_id'] if result else None


# ============================================================================
# PRICE DATA OPERATIONS
# ============================================================================

def upsert_price_snapshot(
    stock_id: int,
    timestamp: datetime,
    open_price: float,
    high: float,
    low: float,
    close: float,
    volume: int
) -> int:
    """
    Insert or update price snapshot (OHLCV data).

    Uses ON CONFLICT to prevent duplicate timestamps (idempotent).

    Args:
        stock_id: Foreign key to stocks table
        timestamp: Bar timestamp (e.g., '2025-10-15 09:35:00')
        open_price: Opening price
        high: High price
        low: Low price
        close: Closing price
        volume: Trading volume

    Returns:
        snapshot_id (primary key)
    """
    with get_cursor() as cur:
        cur.execute("""
            INSERT INTO price_snapshots (stock_id, timestamp, open, high, low, close, volume)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (stock_id, timestamp) DO UPDATE
            SET open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume
            RETURNING snapshot_id
        """, (stock_id, timestamp, open_price, high, low, close, volume))

        result = cur.fetchone()
        return result['snapshot_id']


def bulk_insert_price_snapshots(snapshots: List[Dict]) -> int:
    """
    Bulk insert price snapshots for efficiency.

    Args:
        snapshots: List of dictionaries with keys:
            - stock_id
            - timestamp
            - open, high, low, close
            - volume

    Returns:
        Number of rows inserted
    """
    if not snapshots:
        return 0

    with get_cursor() as cur:
        values = [
            (s['stock_id'], s['timestamp'], s['open'], s['high'], s['low'], s['close'], s['volume'])
            for s in snapshots
        ]

        execute_values(
            cur,
            """
            INSERT INTO price_snapshots (stock_id, timestamp, open, high, low, close, volume)
            VALUES %s
            ON CONFLICT (stock_id, timestamp) DO NOTHING
            """,
            values
        )

        return cur.rowcount


def get_recent_prices(stock_id: int, limit: int = 100) -> List[Dict]:
    """
    Get recent price data for a stock (for calculating indicators).

    Args:
        stock_id: Stock identifier
        limit: Number of most recent bars to return

    Returns:
        List of price dictionaries (newest first)
    """
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT timestamp, open, high, low, close, volume
            FROM price_snapshots
            WHERE stock_id = %s
            ORDER BY timestamp DESC
            LIMIT %s
        """, (stock_id, limit))

        return cur.fetchall()


# ============================================================================
# TECHNICAL INDICATORS OPERATIONS
# ============================================================================

def upsert_technical_indicator(
    stock_id: int,
    timestamp: datetime,
    indicator_name: str,
    value: float
) -> int:
    """
    Insert or update technical indicator value.

    Args:
        stock_id: Stock identifier
        timestamp: Indicator timestamp
        indicator_name: 'RSI', 'SMA_50', 'EMA_20', 'VWAP', etc.
        value: Indicator value

    Returns:
        indicator_id (primary key)
    """
    with get_cursor() as cur:
        cur.execute("""
            INSERT INTO technical_indicators (stock_id, timestamp, indicator_name, value)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (stock_id, timestamp, indicator_name) DO UPDATE
            SET value = EXCLUDED.value
            RETURNING indicator_id
        """, (stock_id, timestamp, indicator_name, value))

        result = cur.fetchone()
        return result['indicator_id']


def get_latest_indicators(stock_id: int) -> Dict[str, float]:
    """
    Get latest technical indicator values for a stock.

    Returns:
        Dictionary: {'RSI': 28.5, 'SMA_50': 177.85, 'VWAP': 178.12, ...}
    """
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT DISTINCT ON (indicator_name)
                indicator_name,
                value
            FROM technical_indicators
            WHERE stock_id = %s
            ORDER BY indicator_name, timestamp DESC
        """, (stock_id,))

        rows = cur.fetchall()
        return {row['indicator_name']: row['value'] for row in rows}


# ============================================================================
# PAPER TRADING OPERATIONS
# ============================================================================

def insert_paper_trade(
    stock_id: int,
    action: str,  # 'BUY' or 'SELL'
    quantity: int,
    price: float,
    strategy: str = 'RL_AGENT',
    reasoning: Optional[str] = None,
    executed_at: Optional[datetime] = None
) -> Dict:
    """
    Insert a paper trade (mock trade for validation).

    For BUY: Inserts with status='OPEN'
    For SELL: Matches against open BUY lots (FIFO), calculates P&L, marks both as 'CLOSED'

    Balance is automatically calculated from all trades via the paper_bankroll view.
    No manual balance updates needed.

    Args:
        stock_id: Stock identifier
        action: 'BUY' or 'SELL'
        quantity: Number of shares
        price: Execution price
        strategy: Trading strategy name ('RL_AGENT', 'BASELINE', etc.)
        reasoning: AI decision explanation

    Returns:
        Dictionary with:
        - trade_id: Primary key of inserted trade
        - realized_pnl: Profit/loss from closing positions (0 for BUY, calculated for SELL)
        - closed_trades: List of trade_ids that were closed (empty for BUY)
    """
    from datetime import datetime

    executed_at = executed_at or datetime.now()

    with get_cursor() as cur:
        if action == 'BUY':
            # BUY: Insert with status='OPEN'
            cur.execute("""
                INSERT INTO paper_trades (
                    stock_id, action, quantity, price, strategy, reasoning,
                    status, executed_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, 'OPEN', %s)
                RETURNING trade_id
            """, (stock_id, action, quantity, price, strategy, reasoning, executed_at))

            result = cur.fetchone()
            return {
                'trade_id': result['trade_id'],
                'realized_pnl': 0.0,
                'closed_trades': []
            }

        elif action == 'SELL':
            # SELL: Match against open BUY lots (FIFO)
            remaining_qty = quantity
            realized_pnl = 0.0
            closed_trade_ids = []

            # Get open BUY positions (FIFO order)
            cur.execute("""
                SELECT trade_id, quantity, price
                FROM paper_trades
                WHERE stock_id = %s AND action = 'BUY' AND status = 'OPEN'
                ORDER BY executed_at ASC
            """, (stock_id,))

            open_buys = cur.fetchall()

            # Validate sufficient open quantity before proceeding
            total_open_qty = sum(buy['quantity'] for buy in open_buys)
            if quantity > total_open_qty:
                raise ValueError(
                    f"Cannot SELL {quantity} shares: only {total_open_qty} shares open. "
                    f"Attempted short selling prevented."
                )

            for buy in open_buys:
                if remaining_qty <= 0:
                    break

                buy_qty = buy['quantity']
                buy_price = float(buy['price'])  # Convert Decimal to float
                qty_to_close = min(remaining_qty, buy_qty)

                # Calculate P&L for this lot
                pnl = (price - buy_price) * qty_to_close
                realized_pnl += pnl

                if qty_to_close == buy_qty:
                    # Fully close this BUY lot
                    cur.execute("""
                        UPDATE paper_trades
                        SET status = 'CLOSED',
                            exit_price = %s,
                            exit_time = %s
                        WHERE trade_id = %s
                    """, (price, executed_at, buy['trade_id']))
                else:
                    # Partial close: reduce remaining quantity, keep position open
                    cur.execute("""
                        UPDATE paper_trades
                        SET quantity = quantity - %s
                        WHERE trade_id = %s
                    """, (qty_to_close, buy['trade_id']))

                closed_trade_ids.append(buy['trade_id'])
                remaining_qty -= qty_to_close

            # Insert the SELL trade with status='CLOSED' (P&L stored ONLY here)
            cur.execute("""
                INSERT INTO paper_trades (
                    stock_id, action, quantity, price, strategy, reasoning,
                    status, exit_price, exit_time, profit_loss, executed_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, 'CLOSED', %s, %s, %s, %s)
                RETURNING trade_id
            """, (stock_id, action, quantity, price, strategy, reasoning, price, executed_at, realized_pnl, executed_at))

            result = cur.fetchone()
            return {
                'trade_id': result['trade_id'],
                'realized_pnl': realized_pnl,
                'closed_trades': closed_trade_ids
            }


def get_active_positions() -> List[Dict]:
    """
    Get all open positions (bought but not yet sold).

    Returns:
        List of dictionaries:
        [
            {
                'stock_id': 1,
                'symbol': 'AAPL',
                'quantity': 10,
                'avg_entry_price': 178.32,
                'current_price': 179.50,
                'unrealized_pnl': 11.80
            },
            ...
        ]
    """
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT
                pt.stock_id,
                s.symbol,
                SUM(CASE WHEN pt.action = 'BUY' THEN pt.quantity ELSE -pt.quantity END) as quantity,
                AVG(CASE WHEN pt.action = 'BUY' THEN pt.price END) as avg_entry_price
            FROM paper_trades pt
            JOIN stocks s ON pt.stock_id = s.stock_id
            WHERE pt.status = 'OPEN'
            GROUP BY pt.stock_id, s.symbol
            HAVING SUM(CASE WHEN pt.action = 'BUY' THEN pt.quantity ELSE -pt.quantity END) > 0
        """)

        return cur.fetchall()


def close_position(stock_id: int, exit_price: float, exit_time: datetime = None) -> float:
    """
    Close all open BUY positions for end-of-day settlement.

    Only closes BUY trades (SELL trades are already closed via insert_paper_trade).
    Calculates and returns total realized P&L.

    Args:
        stock_id: Stock identifier
        exit_price: Selling price (market close)
        exit_time: Exit timestamp (defaults to now)

    Returns:
        Total realized P&L from closed positions
    """
    if exit_time is None:
        exit_time = datetime.now()

    # Determine total open quantity before attempting to close
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT COALESCE(SUM(quantity), 0) AS total_qty
            FROM paper_trades
            WHERE stock_id = %s AND action = 'BUY' AND status = 'OPEN'
        """, (stock_id,))
        row = cur.fetchone()
        total_qty = row['total_qty'] if row else 0

    if not total_qty or total_qty <= 0:
        return 0.0

    # Use insert_paper_trade to perform a synthetic SELL that closes the position
    trade_result = insert_paper_trade(
        stock_id=stock_id,
        action='SELL',
        quantity=total_qty,
        price=exit_price,
        strategy='EOD_SETTLEMENT',
        reasoning='Auto-close position at market settlement',
        executed_at=exit_time
    )

    return float(trade_result['realized_pnl'])


def get_paper_bankroll() -> Dict:
    """
    Get current paper trading bankroll stats.

    Returns:
        Dictionary:
        {
            'balance': 10500.50,
            'total_trades': 47,
            'win_rate': 0.54,
            'total_pnl': 500.50,
            'roi': 0.05
        }
    """
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT
                balance,
                total_trades,
                winning_trades,
                total_pnl,
                roi
            FROM paper_bankroll
            ORDER BY updated_at DESC
            LIMIT 1
        """)

        result = cur.fetchone()
        if not result:
            # Return default starting bankroll
            return {
                'balance': 10000.0,
                'total_trades': 0,
                'win_rate': 0.0,
                'total_pnl': 0.0,
                'roi': 0.0
            }

        return {
            'balance': float(result['balance']),
            'total_trades': result['total_trades'],
            'win_rate': float(result['winning_trades']) / max(result['total_trades'], 1),
            'total_pnl': float(result['total_pnl']),
            'roi': float(result['roi'])
        }


# NOTE: update_paper_bankroll() and adjust_paper_bankroll_balance() removed
# Balance is now calculated dynamically from paper_trades via the paper_bankroll view
# No manual updates needed - single source of truth architecture


# ============================================================================
# RL MODEL OPERATIONS
# ============================================================================

def save_q_table(stock_id: int, agent_data: Dict):
    """
    Save Q-Learning agent state to database (for persistence).

    Args:
        stock_id: Stock identifier
        agent_data: Full agent state from QLearningAgent.save() method
                   (includes q_table, hyperparameters, stats)
    """
    import json

    # Extract Q-table and hyperparameters from agent data
    q_table_data = agent_data.get('q_table', {})

    # Calculate avg_reward for dashboard display
    total_episodes = agent_data.get('total_episodes', 0)
    total_rewards = agent_data.get('total_rewards', 0.0)
    avg_reward = total_rewards / max(total_episodes, 1)

    hyperparameters = {
        'learning_rate': agent_data.get('learning_rate', 0.1),
        'discount_factor': agent_data.get('discount_factor', 0.95),
        'exploration_rate': agent_data.get('exploration_rate', 1.0),
        'total_episodes': total_episodes,
        'total_rewards': total_rewards,
        'avg_reward': round(avg_reward, 4)  # Add avg_reward for dashboard
    }

    with get_cursor() as cur:
        cur.execute("""
            INSERT INTO rl_model_states (stock_id, model_type, q_table, hyperparameters, updated_at)
            VALUES (%s, 'Q_LEARNING', %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (stock_id, model_type) DO UPDATE
            SET q_table = EXCLUDED.q_table,
                hyperparameters = EXCLUDED.hyperparameters,
                updated_at = CURRENT_TIMESTAMP
        """, (stock_id, json.dumps(q_table_data), json.dumps(hyperparameters)))


def load_q_table(stock_id: int) -> Optional[Dict]:
    """
    Load Q-Learning agent state from database.

    Returns:
        Full agent state dictionary (ready for QLearningAgent.load()) or None if not found
    """
    import json

    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT q_table, hyperparameters
            FROM rl_model_states
            WHERE stock_id = %s AND model_type = 'Q_LEARNING'
            ORDER BY updated_at DESC
            LIMIT 1
        """, (stock_id,))

        result = cur.fetchone()
        if not result:
            return None

        # Reconstruct full agent state from database fields
        q_table_raw = json.loads(result['q_table']) if isinstance(result['q_table'], str) else result['q_table']

        # Check if q_table contains the old format (full agent state) or new format (just the table)
        if isinstance(q_table_raw, dict) and 'q_table' in q_table_raw:
            # Old format: full agent state was stored in q_table column
            # Just return it as-is
            return q_table_raw

        # New format: q_table and hyperparameters stored separately
        q_table_data = q_table_raw

        # Handle hyperparameters (may be NULL in old records)
        hyperparams_raw = result['hyperparameters']
        if hyperparams_raw is None:
            hyperparams = {}
        elif isinstance(hyperparams_raw, str):
            hyperparams = json.loads(hyperparams_raw)
        else:
            hyperparams = hyperparams_raw

        return {
            'q_table': q_table_data,
            'learning_rate': hyperparams.get('learning_rate', 0.1),
            'discount_factor': hyperparams.get('discount_factor', 0.95),
            'exploration_rate': hyperparams.get('exploration_rate', 1.0),
            'total_episodes': hyperparams.get('total_episodes', 0),
            'total_rewards': hyperparams.get('total_rewards', 0.0)
        }


# ============================================================================
# AI DECISION LOGGING OPERATIONS
# ============================================================================

def _convert_decimals(obj):
    """
    Recursively convert Decimal objects to float for JSON serialization.
    """
    from decimal import Decimal

    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: _convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_decimals(item) for item in obj]
    else:
        return obj

def insert_decision_log(
    stock_id: int,
    state: Dict,
    action: str,
    was_executed: bool,
    was_random: bool,
    reasoning: str,
    q_values: Optional[Dict] = None
) -> int:
    """
    Insert AI trading decision into log (for full transparency).

    Logs ALL decisions: BUY, SELL, HOLD (executed or not).

    Args:
        stock_id: Stock identifier
        state: Trading state as dictionary
        action: 'BUY', 'SELL', or 'HOLD'
        was_executed: True if trade was actually executed
        was_random: True if action was random (exploration)
        reasoning: Decision explanation
        q_values: Q-values for all actions (optional)

    Returns:
        decision_id (primary key)
    """
    import json

    # Convert any Decimal objects to float for JSON serialization
    state = _convert_decimals(state)
    q_values = _convert_decimals(q_values) if q_values else None

    with get_cursor() as cur:
        cur.execute("""
            INSERT INTO trade_decisions_log (
                stock_id, state, action, was_executed, was_random, reasoning, q_values, timestamp
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            RETURNING decision_id
        """, (
            stock_id,
            json.dumps(state),
            action,
            was_executed,
            was_random,
            reasoning,
            json.dumps(q_values) if q_values else None
        ))

        result = cur.fetchone()
        return result['decision_id']


def get_recent_decisions(stock_id: Optional[int] = None, limit: int = 50) -> List[Dict]:
    """
    Get recent AI trading decisions.

    Args:
        stock_id: Filter by stock (None = all stocks)
        limit: Number of decisions to return

    Returns:
        List of decision dictionaries
    """
    with get_cursor(commit=False) as cur:
        if stock_id:
            cur.execute("""
                SELECT
                    tdl.decision_id,
                    s.symbol,
                    tdl.timestamp,
                    tdl.state,
                    tdl.action,
                    tdl.was_executed,
                    tdl.was_random,
                    tdl.reasoning,
                    tdl.q_values
                FROM trade_decisions_log tdl
                JOIN stocks s ON s.stock_id = tdl.stock_id
                WHERE tdl.stock_id = %s
                ORDER BY tdl.timestamp DESC
                LIMIT %s
            """, (stock_id, limit))
        else:
            cur.execute("""
                SELECT
                    tdl.decision_id,
                    s.symbol,
                    tdl.timestamp,
                    tdl.state,
                    tdl.action,
                    tdl.was_executed,
                    tdl.was_random,
                    tdl.reasoning,
                    tdl.q_values
                FROM trade_decisions_log tdl
                JOIN stocks s ON s.stock_id = tdl.stock_id
                ORDER BY tdl.timestamp DESC
                LIMIT %s
            """, (limit,))

        return cur.fetchall()


# Example usage
if __name__ == '__main__':
    """
    Test database operations.

    Run: python -m packages.shared.shared.db
    """
    # Test connection
    print("Testing database connection...")
    conn = get_db_connection()
    print("✓ Connected to database")
    conn.close()

    # Test upsert_stock
    print("\nTesting upsert_stock...")
    stock_id = upsert_stock('AAPL', 'Apple Inc.', 'NASDAQ', 'Technology')
    print(f"✓ Upserted AAPL with stock_id: {stock_id}")

    # Test get_paper_bankroll
    print("\nTesting get_paper_bankroll...")
    bankroll = get_paper_bankroll()
    print(f"✓ Current bankroll: ${bankroll['balance']:.2f} (ROI: {bankroll['roi']:.2%})")
