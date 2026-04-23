import requests
import yfinance as yf
import pandas as pd

_SEARCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}

# Broker-specific codes (Trading 212 etc.) → Yahoo Finance symbols
_BROKER_TO_YF: dict[str, str] = {
    "10AP":     "10AP.L",
    "6AQQ":     "6AQQ.L",
    "XAMZ":     "XAMZ.L",
    "L0CK":     "L0CK.L",
    "EXSA":     "EXSA.DE",
    "500USD.SW": "P500.PA",   # remplacé par équivalent liquide PA
}


def _yf_symbol(ticker: str) -> str:
    return _BROKER_TO_YF.get(ticker.upper(), ticker)


def search_tickers(query: str, max_results: int = 8) -> list[dict]:
    """Recherche par nom ou ticker approximatif. Retourne [{symbol, name, exchange, type}]."""
    try:
        r = requests.get(
            "https://query1.finance.yahoo.com/v1/finance/search",
            params={"q": query, "quotesCount": max_results, "newsCount": 0, "listsCount": 0},
            headers=_SEARCH_HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        quotes = r.json().get("quotes", [])
        results = []
        for q in quotes:
            symbol = q.get("symbol", "")
            name = q.get("longname") or q.get("shortname", "")
            if symbol and name:
                results.append({
                    "symbol": symbol,
                    "name": name,
                    "exchange": q.get("exchange", ""),
                    "type": q.get("quoteType", ""),
                })
        return results
    except Exception:
        return []


def verify_ticker(ticker: str) -> dict | None:
    """Retourne nom, prix actuel et devise pour un symbole connu, ou None."""
    try:
        info = yf.Ticker(_yf_symbol(ticker)).info
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        name = info.get("longName") or info.get("shortName")
        currency = info.get("currency", "USD")
        if not price or not name:
            return None
        return {"name": name, "price": price, "currency": currency}
    except Exception:
        return None


def get_current_prices(tickers: list[str]) -> dict[str, float]:
    """Retourne {ticker_original: prix_actuel}. Mappe les codes broker vers YF."""
    if not tickers:
        return {}
    # Build mapping original → yf symbol (deduplicated)
    orig_to_yf = {t: _yf_symbol(t) for t in tickers}
    yf_symbols = list(dict.fromkeys(orig_to_yf.values()))  # unique, preserve order

    data = yf.download(yf_symbols, period="1d", auto_adjust=True, progress=False)
    prices: dict[str, float] = {}

    if len(yf_symbols) == 1:
        close = data["Close"]
        if not close.empty:
            yf_sym = yf_symbols[0].upper()
            val = float(close.iloc[-1])
            # map back to all originals that pointed to this yf symbol
            for orig, yf_s in orig_to_yf.items():
                if yf_s.upper() == yf_sym:
                    prices[orig.upper()] = val
    else:
        close = data["Close"]
        for orig, yf_s in orig_to_yf.items():
            col = yf_s.upper()
            if col in close.columns and not close[col].dropna().empty:
                prices[orig.upper()] = float(close[col].dropna().iloc[-1])

    return prices


def get_normalized_history(tickers: list[str], period: str = "6mo") -> pd.DataFrame:
    """Prix normalisés à 100 à la date de départ. Utilise les symboles YF réels."""
    if not tickers:
        return pd.DataFrame()
    dfs = []
    for t in tickers:
        yf_sym = _yf_symbol(t)
        try:
            df = yf.download(yf_sym, period=period, auto_adjust=True, progress=False, threads=False)
            if df.empty:
                continue
            close = df["Close"].squeeze()
            first_valid = close.first_valid_index()
            if first_valid is None:
                continue
            norm = close / close[first_valid] * 100
            norm.name = t  # garde le nom original pour l'affichage
            dfs.append(norm)
        except Exception:
            continue
    if not dfs:
        return pd.DataFrame()
    return pd.concat(dfs, axis=1)
