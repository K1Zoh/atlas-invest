import sqlite3
import json
from pathlib import Path
from datetime import date as _date

DB_PATH = Path(__file__).parent.parent / "data" / "portfolio.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker        TEXT    NOT NULL,
                name          TEXT    NOT NULL,
                tx_date       TEXT    NOT NULL,
                quantity      REAL    NOT NULL,
                price         REAL    NOT NULL,
                fees          REAL    NOT NULL DEFAULT 0.0,
                currency      TEXT    NOT NULL DEFAULT 'EUR',
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Migration : ajoute currency si la table existait sans elle
        try:
            conn.execute("ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR'")
            conn.commit()
        except Exception:
            pass
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ai_suggestions (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                model_name       TEXT NOT NULL,
                created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                prompt           TEXT NOT NULL,
                response_text    TEXT NOT NULL,
                portfolio_snapshot TEXT NOT NULL,
                virtual_portfolio  TEXT,
                conviction_level   TEXT,
                analysis_score     REAL DEFAULT NULL,
                discipline_score   REAL DEFAULT NULL,
                notes              TEXT DEFAULT NULL
            )
        """)
        conn.commit()
        _migrate_old_positions(conn)


def _migrate_old_positions(conn):
    """Migre l'ancienne table positions vers transactions si elle existe."""
    try:
        rows = conn.execute(
            "SELECT ticker, name, quantity, avg_buy_price FROM positions"
        ).fetchall()
        if not rows:
            return
        tx_count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        if tx_count > 0:
            return
        today = _date.today().isoformat()
        for r in rows:
            conn.execute(
                "INSERT INTO transactions (ticker, name, tx_date, quantity, price, fees) VALUES (?, ?, ?, ?, ?, 0)",
                (r["ticker"], r["name"], today, r["quantity"], r["avg_buy_price"]),
            )
        conn.commit()
    except Exception:
        pass


# ── Transactions ───────────────────────────────────────────────────────────────

def add_transaction(
    ticker: str,
    name: str,
    tx_date: str,
    quantity: float,
    price: float,
    fees: float = 0.0,
    currency: str = "EUR",
):
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO transactions (ticker, name, tx_date, quantity, price, fees, currency) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (ticker.upper(), name, tx_date, quantity, price, fees, currency.upper()),
        )
        conn.commit()


def delete_transaction(tx_id: int):
    with get_connection() as conn:
        conn.execute("DELETE FROM transactions WHERE id=?", (tx_id,))
        conn.commit()


def get_transactions(ticker: str | None = None) -> list[dict]:
    with get_connection() as conn:
        if ticker:
            rows = conn.execute(
                "SELECT * FROM transactions WHERE ticker=? ORDER BY tx_date",
                (ticker.upper(),),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM transactions ORDER BY ticker, tx_date"
            ).fetchall()
        return [dict(r) for r in rows]


# ── Positions (calculées depuis les transactions) ──────────────────────────────

def get_positions() -> list[dict]:
    """Agrège les transactions par ticker et calcule le PRU moyen pondéré."""
    txs = get_transactions()
    agg: dict[str, dict] = {}
    for t in txs:
        tk = t["ticker"]
        if tk not in agg:
            agg[tk] = {"ticker": tk, "name": t["name"], "quantity": 0.0, "total_cost": 0.0}
        agg[tk]["quantity"] += t["quantity"]
        agg[tk]["total_cost"] += t["quantity"] * t["price"] + t["fees"]

    result = []
    for tk in sorted(agg):
        d = agg[tk]
        qty = d["quantity"]
        result.append({
            "ticker": tk,
            "name": d["name"],
            "quantity": qty,
            "avg_buy_price": d["total_cost"] / qty if qty > 0 else 0.0,
            "currency": "EUR",
        })
    return result


def delete_position(ticker: str):
    """Supprime toutes les transactions d'un ticker (= supprime la position)."""
    with get_connection() as conn:
        conn.execute("DELETE FROM transactions WHERE ticker=?", (ticker.upper(),))
        conn.commit()


# ── AI Suggestions ─────────────────────────────────────────────────────────────

def save_suggestion(
    model_name: str,
    prompt: str,
    response_text: str,
    portfolio_snapshot: dict,
    virtual_portfolio: dict | None,
    conviction_level: str | None,
) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            """INSERT INTO ai_suggestions
               (model_name, prompt, response_text, portfolio_snapshot, virtual_portfolio, conviction_level)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                model_name,
                prompt,
                response_text,
                json.dumps(portfolio_snapshot, ensure_ascii=False),
                json.dumps(virtual_portfolio, ensure_ascii=False) if virtual_portfolio else None,
                conviction_level,
            ),
        )
        conn.commit()
        return cur.lastrowid


def get_suggestions(limit: int = 30) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM ai_suggestions ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def update_suggestion_scores(
    id: int, analysis_score: float, discipline_score: float, notes: str = ""
) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE ai_suggestions SET analysis_score=?, discipline_score=?, notes=? WHERE id=?",
            (analysis_score, discipline_score, notes, id),
        )
        conn.commit()
