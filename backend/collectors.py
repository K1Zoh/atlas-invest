import requests
import yfinance as yf
import pandas as pd

_SEARCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}


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
        info = yf.Ticker(ticker).info
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        name = info.get("longName") or info.get("shortName")
        currency = info.get("currency", "USD")
        if not price or not name:
            return None
        return {"name": name, "price": price, "currency": currency}
    except Exception:
        return None


def get_current_prices(tickers: list[str]) -> dict[str, float]:
    """Retourne {ticker: prix_actuel} pour une liste de tickers."""
    if not tickers:
        return {}
    data = yf.download(tickers, period="1d", auto_adjust=True, progress=False)
    prices = {}
    if len(tickers) == 1:
        close = data["Close"]
        if not close.empty:
            prices[tickers[0].upper()] = float(close.iloc[-1])
    else:
        close = data["Close"]
        for t in tickers:
            col = t.upper()
            if col in close.columns and not close[col].dropna().empty:
                prices[col] = float(close[col].dropna().iloc[-1])
    return prices


def get_normalized_history(tickers: list[str], period: str = "6mo") -> pd.DataFrame:
    """Retourne les prix de clôture normalisés à 100 à la date de départ, multi-tickers."""
    if not tickers:
        return pd.DataFrame()
    dfs = []
    for t in tickers:
        try:
            df = yf.download(t, period=period, auto_adjust=True, progress=False, threads=False)
            if df.empty:
                continue
            close = df["Close"].squeeze()
            first_valid = close.first_valid_index()
            if first_valid is None:
                continue
            norm = close / close[first_valid] * 100
            norm.name = t
            dfs.append(norm)
        except Exception:
            continue
    if not dfs:
        return pd.DataFrame()
    return pd.concat(dfs, axis=1)
