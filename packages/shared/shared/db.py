"""
Database operations module.

All writes go through here. Uses ON CONFLICT everywhere so scripts are safe to re-run.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from contextlib import contextmanager


def get_db_connection():
    """Get PostgreSQL connection from DATABASE_URL env var."""
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
    """Context manager for DB cursor. Auto-commits on success, rollback on error."""
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


# --- STOCK OPERATIONS ---

def upsert_stock(symbol: str, name: str, exchange: str = 'NASDAQ', sector: str = None) -> int:
    """Insert or update stock. Returns stock_id."""
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
    """Get stock_id for symbol, or None if not found."""
    with get_cursor(commit=False) as cur:
        cur.execute("SELECT stock_id FROM stocks WHERE symbol = %s", (symbol,))
        result = cur.fetchone()
        return result['stock_id'] if result else None


# --- PRICE DATA OPERATIONS ---

def upsert_price_snapshot(
    stock_id: int,
    timestamp: datetime,
    open_price: float,
    high: float,
    low: float,
    close: float,
    volume: int
) -> int:
    """Insert OHLCV bar. Returns snapshot_id."""
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
    """Batch insert OHLCV bars. Returns row count."""
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
    """Get most recent price bars (newest first)."""
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT timestamp, open, high, low, close, volume
            FROM price_snapshots
            WHERE stock_id = %s
            ORDER BY timestamp DESC
            LIMIT %s
        """, (stock_id, limit))

        return cur.fetchall()


# --- TECHNICAL INDICATORS OPERATIONS ---

def upsert_technical_indicator(
    stock_id: int,
    timestamp: datetime,
    indicator_name: str,
    value: float
) -> int:
    """Insert indicator value (RSI, SMA_50, VWAP, etc). Returns indicator_id."""
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
    """Get latest indicator values as dict: {'RSI': 28.5, 'SMA_50': 177.85, ...}"""
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


# --- PAPER TRADING OPERATIONS ---

def insert_paper_trade(
    stock_id: int,
    action: str,
    quantity: int,
    price: float,
    strategy: str = 'RL_AGENT',
    reasoning: Optional[str] = None,
    executed_at: Optional[datetime] = None
) -> Dict:
    """
    Insert paper trade. BUY opens position, SELL closes via FIFO matching.
    Returns {trade_id, realized_pnl, closed_trades}.
    """
    from datetime import datetime
    executed_at = executed_at or datetime.now()

    with get_cursor() as cur:
        if action == 'BUY':
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
            # Match against open BUY lots (FIFO)
            remaining_qty = quantity
            realized_pnl = 0.0
            closed_trade_ids = []

            cur.execute("""
                SELECT trade_id, quantity, price
                FROM paper_trades
                WHERE stock_id = %s AND action = 'BUY' AND status = 'OPEN'
                ORDER BY executed_at ASC
            """, (stock_id,))

            open_buys = cur.fetchall()

            # Prevent short selling
            total_open_qty = sum(buy['quantity'] for buy in open_buys)
            if quantity > total_open_qty:
                raise ValueError(f"Cannot SELL {quantity}: only {total_open_qty} open")

            for buy in open_buys:
                if remaining_qty <= 0:
                    break

                buy_qty = int(buy['quantity'])
                buy_price = float(buy['price'])
                qty_to_close = min(remaining_qty, buy_qty)
                pnl = (float(price) - buy_price) * qty_to_close
                realized_pnl += pnl

                fully_closed = qty_to_close == buy_qty
                if fully_closed:
                    cur.execute("""
                        UPDATE paper_trades
                        SET status = 'CLOSED',
                            exit_price = %s,
                            exit_time = %s
                        WHERE trade_id = %s
                    """, (price, executed_at, buy['trade_id']))
                else:
                    cur.execute("""
                        UPDATE paper_trades
                        SET quantity = quantity - %s
                        WHERE trade_id = %s
                    """, (qty_to_close, buy['trade_id']))

                if fully_closed:
                    closed_trade_ids.append(buy['trade_id'])
                remaining_qty -= qty_to_close

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
    """Get all open positions from active_positions view."""
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT
                stock_id,
                symbol,
                quantity,
                avg_entry_price,
                last_trade_time
            FROM active_positions
        """)

        return cur.fetchall()


def close_position(stock_id: int, exit_price: float, exit_time: datetime = None) -> float:
    """Close all open positions for end-of-day settlement. Returns total P&L."""
    if exit_time is None:
        exit_time = datetime.now()

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
    """Get bankroll stats: balance, total_trades, win_rate, total_pnl, roi."""
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT
                balance,
                total_trades,
                total_pnl,
                roi,
                win_rate
            FROM paper_bankroll
            ORDER BY updated_at DESC
            LIMIT 1
        """)

        result = cur.fetchone()
        if not result:
            return {
                'balance': 100000.0,
                'total_trades': 0,
                'win_rate': 0.0,
                'total_pnl': 0.0,
                'roi': 0.0
            }

        return {
            'balance': float(result['balance']),
            'total_trades': result['total_trades'],
            'total_pnl': float(result['total_pnl']),
            'roi': float(result['roi']),
            'win_rate': float(result['win_rate'])
        }


def get_stock_win_rate(stock_id: int) -> Optional[float]:
    """Win rate % for a stock, or None if no trades."""
    with get_cursor(commit=False) as cur:
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'CLOSED' AND profit_loss > 0) AS wins,
                COUNT(*) FILTER (WHERE status = 'CLOSED') AS total
            FROM paper_trades
            WHERE stock_id = %s
        """, (stock_id,))

        row = cur.fetchone()
        if not row or row['total'] == 0:
            return None
        return (row['wins'] / row['total']) * 100.0


# --- RL MODEL OPERATIONS ---

def save_q_table(stock_id: int, agent_data: Dict):
    """Persist Q-table and hyperparameters to database."""
    import json

    q_table_data = agent_data.get('q_table', {})
    total_episodes = agent_data.get('total_episodes', 0)
    total_rewards = agent_data.get('total_rewards', 0.0)

    hyperparameters = {
        'learning_rate': agent_data.get('learning_rate', 0.1),
        'discount_factor': agent_data.get('discount_factor', 0.95),
        'exploration_rate': agent_data.get('exploration_rate', 1.0),
        'exploration_decay': agent_data.get('exploration_decay', 0.99),
        'min_exploration': agent_data.get('min_exploration', 0.01),
        'total_episodes': total_episodes,
        'total_rewards': total_rewards,
        'avg_reward': round(total_rewards / max(total_episodes, 1), 4)
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
    """Load Q-table from database, or None if not found."""
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

        q_table_raw = json.loads(result['q_table']) if isinstance(result['q_table'], str) else result['q_table']

        # Handle legacy format where full agent state was in q_table column
        if isinstance(q_table_raw, dict) and 'q_table' in q_table_raw:
            return q_table_raw

        q_table_data = q_table_raw
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
            'exploration_decay': hyperparams.get('exploration_decay', 0.99),
            'min_exploration': hyperparams.get('min_exploration', 0.01),
            'total_episodes': hyperparams.get('total_episodes', 0),
            'total_rewards': hyperparams.get('total_rewards', 0.0)
        }


# --- AI DECISION LOGGING ---

def _convert_decimals(obj):
    """Convert Decimal to float for JSON serialization."""
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
    """Log trading decision for transparency. Returns decision_id."""
    import json
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
    """Get recent decisions. Filter by stock_id if provided."""
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


if __name__ == '__main__':
    # Quick DB test
    print("Testing database connection...")
    conn = get_db_connection()
    print("Connected")
    conn.close()

    print("\nTesting upsert_stock...")
    stock_id = upsert_stock('AAPL', 'Apple Inc.', 'NASDAQ', 'Technology')
    print(f"AAPL stock_id: {stock_id}")

    print("\nTesting get_paper_bankroll...")
    bankroll = get_paper_bankroll()
    print(f"Balance: ${bankroll['balance']:.2f}")
