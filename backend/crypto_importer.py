"""
Importeur CSV pour transactions crypto.

Formats supportés (auto-détectés) :
  - Binance  : colonnes "Date(UTC)", "Pair", "Side", "Price", "Executed", "Fee"
  - Coinbase : colonnes "Timestamp", "Transaction Type", "Asset",
               "Quantity Transacted", "Spot Price at Transaction"
  - Générique: colonnes Date, Ticker (ou Symbol), Quantity (ou Qty),
               Price (ou Price/Unit), Fees (optionnel)
"""

import io
import re
import pandas as pd

from backend.db import add_transaction, get_transactions
from backend.crypto_collectors import verify_crypto, _symbol_to_id


def _already_exists(ticker: str, tx_date: str, quantity: float, price: float) -> bool:
    """Return True if an identical transaction (same ticker/date/qty/price) is already in the DB."""
    existing = get_transactions(ticker, asset_class="crypto")
    for t in existing:
        if (
            t["tx_date"] == tx_date
            and abs(t["quantity"] - quantity) < 1e-8
            and abs(t["price"] - price) < 1e-10
        ):
            return True
    return False


_BINANCE_MARKERS  = {"pair", "side", "executed"}
_COINBASE_MARKERS = {"transaction type", "asset", "quantity transacted"}


def _detect_format(columns: list[str]) -> str:
    lower = {c.lower().strip() for c in columns}
    if _BINANCE_MARKERS <= lower:
        return "binance"
    if _COINBASE_MARKERS <= lower:
        return "coinbase"
    return "generic"


def _parse_date(val) -> str | None:
    try:
        return pd.to_datetime(str(val)).strftime("%Y-%m-%d")
    except Exception:
        return None


def _strip_quote(pair: str) -> str | None:
    """BTCEUR → BTC, ETHUSDT → ETH, SOLUSDC → SOL."""
    pair = pair.upper().strip()
    for q in ["USDT", "USDC", "BUSD", "EUR", "USD", "BTC", "ETH", "BNB"]:
        if pair.endswith(q) and len(pair) > len(q):
            return pair[: -len(q)]
    return None


# ── Binance ────────────────────────────────────────────────────────────────────

def _import_binance(df: pd.DataFrame) -> tuple[int, int, list[str]]:
    df.columns = [c.strip().lower() for c in df.columns]
    n_ok = n_skip = 0
    errors: list[str] = []

    for _, row in df.iterrows():
        side = str(row.get("side", "")).strip().upper()
        if side != "BUY":
            n_skip += 1
            continue

        pair = str(row.get("pair", "")).strip()
        ticker = _strip_quote(pair)
        if not ticker:
            errors.append(f"Paire non reconnue : {pair!r}")
            n_skip += 1
            continue

        # Only import EUR-denominated rows to avoid USD/USDT price confusion
        if not pair.endswith("EUR"):
            errors.append(
                f"Ignoré {pair} — seules les paires EUR sont importées automatiquement."
            )
            n_skip += 1
            continue

        date_str = _parse_date(row.get("date(utc)") or row.get("date") or "")
        if not date_str:
            n_skip += 1
            continue

        try:
            price = float(str(row.get("price", 0)).replace(",", ""))
            qty   = float(str(row.get("executed", 0)).replace(",", ""))
            fee   = float(str(row.get("fee", 0) or 0).replace(",", ""))
        except ValueError:
            n_skip += 1
            continue

        if qty <= 0 or price <= 0:
            n_skip += 1
            continue

        if _already_exists(ticker, date_str, qty, price):
            n_skip += 1
            continue

        cg_id = _symbol_to_id(ticker)
        try:
            add_transaction(
                ticker=ticker,
                name=ticker,
                tx_date=date_str,
                quantity=qty,
                price=price,
                fees=fee,
                currency="EUR",
                asset_class="crypto",
                coingecko_id=cg_id if cg_id != ticker.lower() else None,
            )
            n_ok += 1
        except Exception as e:
            errors.append(f"{ticker} : {e}")
            n_skip += 1

    return n_ok, n_skip, errors


# ── Coinbase ───────────────────────────────────────────────────────────────────

def _import_coinbase(df: pd.DataFrame) -> tuple[int, int, list[str]]:
    df.columns = [c.strip().lower() for c in df.columns]
    n_ok = n_skip = 0
    errors: list[str] = []

    buy_types = {"buy", "advanced trade buy", "convert", "rewards income"}

    for _, row in df.iterrows():
        tx_type = str(row.get("transaction type", "")).strip().lower()
        if tx_type not in buy_types:
            n_skip += 1
            continue

        ticker = str(row.get("asset", "")).strip().upper()
        if not ticker:
            n_skip += 1
            continue

        currency = str(row.get("spot price currency", "EUR")).strip().upper()
        if currency not in ("EUR", "USD"):
            n_skip += 1
            errors.append(f"Devise non supportée pour {ticker} : {currency}")
            continue
        if currency != "EUR":
            errors.append(
                f"Ignoré {ticker} — seules les transactions EUR sont importées automatiquement."
            )
            n_skip += 1
            continue

        date_str = _parse_date(row.get("timestamp") or row.get("date") or "")
        if not date_str:
            n_skip += 1
            continue

        try:
            price_col = "spot price at transaction"
            price = float(str(row.get(price_col, 0)).replace(",", "").replace("€", "").replace("$", ""))
            qty   = float(str(row.get("quantity transacted", 0)).replace(",", ""))
            fee_raw = row.get("fees and/or spread") or row.get("fees") or 0
            fee   = float(str(fee_raw).replace(",", "").replace("€", "").replace("$", "") or 0)
        except ValueError:
            n_skip += 1
            continue

        if qty == 0 or price <= 0:
            n_skip += 1
            continue

        if _already_exists(ticker, date_str, qty, price):
            n_skip += 1
            continue

        cg_id = _symbol_to_id(ticker)
        try:
            add_transaction(
                ticker=ticker,
                name=ticker,
                tx_date=date_str,
                quantity=qty,
                price=price,
                fees=fee,
                currency="EUR",
                asset_class="crypto",
                coingecko_id=cg_id if cg_id != ticker.lower() else None,
            )
            n_ok += 1
        except Exception as e:
            errors.append(f"{ticker} : {e}")
            n_skip += 1

    return n_ok, n_skip, errors


# ── Generic ────────────────────────────────────────────────────────────────────

_COL_ALIASES = {
    "ticker":   ["ticker", "symbol", "crypto", "coin", "actif"],
    "date":     ["date", "datetime", "date d'achat", "date achat", "timestamp"],
    "quantity": ["quantity", "qty", "quantité", "quantite", "amount", "nb"],
    "price":    ["price", "prix", "price/unit", "price per unit", "cours", "price (eur)", "prix (eur)"],
    "fees":     ["fees", "frais", "fee", "commission"],
}


def _resolve_col(df_cols: list[str], field: str) -> str | None:
    lower_map = {c.lower().strip(): c for c in df_cols}
    for alias in _COL_ALIASES.get(field, []):
        if alias in lower_map:
            return lower_map[alias]
    return None


def _import_generic(df: pd.DataFrame) -> tuple[int, int, list[str]]:
    col_ticker = _resolve_col(df.columns.tolist(), "ticker")
    col_date   = _resolve_col(df.columns.tolist(), "date")
    col_qty    = _resolve_col(df.columns.tolist(), "quantity")
    col_price  = _resolve_col(df.columns.tolist(), "price")
    col_fees   = _resolve_col(df.columns.tolist(), "fees")

    missing = [f for f, c in [("Ticker/Symbol", col_ticker), ("Date", col_date),
                               ("Quantity", col_qty), ("Price", col_price)] if c is None]
    if missing:
        return 0, len(df), [f"Colonnes manquantes : {', '.join(missing)}. "
                             f"Colonnes trouvées : {', '.join(df.columns.tolist())}"]

    n_ok = n_skip = 0
    errors: list[str] = []

    for _, row in df.iterrows():
        ticker = str(row[col_ticker]).strip().upper()
        if not ticker or ticker in ("NAN", ""):
            n_skip += 1
            continue

        date_str = _parse_date(row[col_date])
        if not date_str:
            n_skip += 1
            continue

        try:
            qty   = float(str(row[col_qty]).replace(",", ""))
            price = float(str(row[col_price]).replace(",", "").replace("€", "").replace("$", ""))
            fee   = float(str(row[col_fees]).replace(",", "").replace("€", "").replace("$", "") or 0) if col_fees else 0.0
        except ValueError:
            n_skip += 1
            continue

        if qty == 0 or price <= 0:
            n_skip += 1
            continue

        if _already_exists(ticker, date_str, qty, price):
            n_skip += 1
            continue

        cg_id = _symbol_to_id(ticker)
        try:
            add_transaction(
                ticker=ticker,
                name=ticker,
                tx_date=date_str,
                quantity=qty,
                price=price,
                fees=fee,
                currency="EUR",
                asset_class="crypto",
                coingecko_id=cg_id if cg_id != ticker.lower() else None,
            )
            n_ok += 1
        except Exception as e:
            errors.append(f"{ticker} : {e}")
            n_skip += 1

    return n_ok, n_skip, errors


# ── Public entry point ─────────────────────────────────────────────────────────

def import_crypto_csv(raw_bytes: bytes) -> tuple[int, int, list[str]]:
    """
    Importe des transactions crypto depuis un CSV brut.
    Retourne (n_ok, n_skip, errors).
    """
    try:
        try:
            df = pd.read_csv(io.BytesIO(raw_bytes), encoding="utf-8-sig")
        except Exception:
            df = pd.read_csv(io.BytesIO(raw_bytes), encoding="latin-1")
    except Exception as e:
        return 0, 0, [f"Impossible de lire le fichier CSV : {e}"]

    if df.empty:
        return 0, 0, ["Le fichier CSV est vide."]

    fmt = _detect_format(df.columns.tolist())

    if fmt == "binance":
        return _import_binance(df)
    if fmt == "coinbase":
        return _import_coinbase(df)
    return _import_generic(df)
