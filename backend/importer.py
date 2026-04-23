"""Import de transactions depuis un export CSV de courtier."""

import re
import pandas as pd
from io import StringIO

from .db import add_transaction, get_transactions
from .collectors import verify_ticker

REQUIRED_COLS = {"Date", "Ticker", "Type", "Quantity", "Price per share"}
MAX_FILE_BYTES = 5 * 1024 * 1024  # 5 MB

# Noms connus pour les codes broker non-standard (Trading 212, etc.)
KNOWN_NAMES: dict[str, str] = {
    "XAMZ": "Amundi MSCI Amazon & Big Tech ETF",
    "10AP": "Amundi S&P 500 UCITS ETF (Acc)",
    "6AQQ": "Amundi MSCI World UCITS ETF",
    "L0CK": "iShares Digital Security & Tech ETF",
    "EXSA": "iShares STOXX Europe 600 UCITS ETF",
}

# Ticker broker → ticker Yahoo Finance pour la résolution du cours
BROKER_TO_YF: dict[str, str] = {
    "10AP": "10AP.L",
    "6AQQ": "6AQQ.L",
    "XAMZ": "XAMZ.L",
    "L0CK": "L0CK.L",
    "EXSA": "EXSA.DE",
}

_TICKER_RE = re.compile(r"^[A-Z0-9.\-]{1,20}$")


def _validate_ticker(ticker: str) -> bool:
    return bool(_TICKER_RE.match(ticker))


def _parse_price(raw: str) -> tuple[float, str]:
    """Parse "EUR 616.10" ou "USD 188.60" → (616.10, "EUR")."""
    parts = str(raw).strip().split()
    if len(parts) == 2 and parts[0].isalpha() and len(parts[0]) == 3:
        return float(parts[1].replace(",", ".")), parts[0].upper()
    return float(str(raw).replace(",", ".")), "EUR"


def _resolve_name(ticker: str) -> str:
    if ticker in KNOWN_NAMES:
        return KNOWN_NAMES[ticker]
    candidates = [ticker] + [ticker + s for s in (".L", ".PA", ".DE", ".AS", ".SW")]
    for sym in candidates:
        try:
            info = verify_ticker(sym)
            if info:
                return info["name"]
        except Exception:
            continue
    return f"Import – {ticker}"


def import_csv(file_content: str | bytes) -> tuple[int, int, list[str]]:
    """
    Parse et importe les achats depuis un CSV de courtier.
    Retourne (importés, ignorés, erreurs).
    """
    # Security: size check
    raw = file_content if isinstance(file_content, bytes) else file_content.encode()
    if len(raw) > MAX_FILE_BYTES:
        return 0, 0, ["Fichier trop volumineux (max 5 MB)."]

    content_str = raw.decode("utf-8", errors="replace")

    try:
        df = pd.read_csv(StringIO(content_str))
    except Exception as e:
        return 0, 0, [f"Impossible de lire le CSV : {e}"]

    missing = REQUIRED_COLS - set(df.columns)
    if missing:
        return 0, 0, [f"Colonnes manquantes : {missing}"]

    buy_df = df[df["Type"].str.contains("BUY", case=False, na=False)].copy()

    existing = get_transactions()
    seen = {(t["ticker"], t["tx_date"], round(t["quantity"], 8)) for t in existing}

    imported = skipped = 0
    errors: list[str] = []

    for _, row in buy_df.iterrows():
        raw_ticker = str(row.get("Ticker", "")).strip().upper()
        if not raw_ticker or raw_ticker == "NAN":
            skipped += 1
            continue

        # Security: validate ticker format
        if not _validate_ticker(raw_ticker):
            errors.append(f"Ticker invalide ignoré : {raw_ticker!r}")
            skipped += 1
            continue

        try:
            tx_date = str(row["Date"])[:10]
            quantity = float(row["Quantity"])
            if quantity <= 0:
                skipped += 1
                continue

            price, currency = _parse_price(row["Price per share"])
            if price <= 0:
                skipped += 1
                continue

            key = (raw_ticker, tx_date, round(quantity, 8))
            if key in seen:
                skipped += 1
                continue

            name = _resolve_name(raw_ticker)
            add_transaction(raw_ticker, name, tx_date, quantity, price, 0.0, currency)
            seen.add(key)
            imported += 1

        except Exception as e:
            errors.append(f"{raw_ticker} ({str(row.get('Date', ''))[:10]}) : {e}")

    return imported, skipped, errors
