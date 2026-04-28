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


def get_raw_history(ticker: str, period: str = "1y") -> pd.Series:
    """Raw closing prices for a single ticker. Returns pd.Series indexed by date."""
    yf_sym = _yf_symbol(ticker)
    try:
        df = yf.download(yf_sym, period=period, auto_adjust=True, progress=False, threads=False)
        if df.empty:
            return pd.Series(dtype=float)
        close = df["Close"].squeeze().dropna()
        close.name = ticker
        return close
    except Exception:
        return pd.Series(dtype=float)


def get_ticker_info(ticker: str) -> dict:
    """Sector, industry, country, brief description from yfinance."""
    try:
        info = yf.Ticker(_yf_symbol(ticker)).info
        summary = info.get("longBusinessSummary", "")
        if summary and len(summary) > 400:
            summary = summary[:400].rsplit(" ", 1)[0] + "…"
        return {
            "sector":   info.get("sector", ""),
            "industry": info.get("industry", ""),
            "country":  info.get("country", ""),
            "summary":  summary,
            "currency": info.get("currency", ""),
            "market_cap": info.get("marketCap"),
        }
    except Exception:
        return {}


def get_multi_raw_history_df(tickers: list[str], period: str = "2y") -> pd.DataFrame:
    """Raw closing prices for multiple tickers, forward-filled. Not normalized."""
    if not tickers:
        return pd.DataFrame()
    dfs = []
    for t in tickers:
        yf_sym = _yf_symbol(t)
        try:
            df = yf.download(yf_sym, period=period, auto_adjust=True, progress=False, threads=False)
            if df.empty:
                continue
            close = df["Close"].squeeze().dropna()
            close.name = t
            dfs.append(close)
        except Exception:
            continue
    if not dfs:
        return pd.DataFrame()
    result = pd.concat(dfs, axis=1)
    result = result[~result.index.duplicated(keep="last")]
    return result.ffill()


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


def get_dividend_info(ticker: str) -> dict:
    """Fetch dividend metadata for a stock ticker via yfinance.

    Returns a dict with:
        dividend_rate       – annual dividend per share (currency of the stock)
        dividend_yield_pct  – annualised yield as a %
        ex_dividend_date    – next ex-dividend date as ISO string, or None
        last_dividend_value – most recent dividend paid per share
        last_dividend_date  – date of last dividend as ISO string, or None
        payout_ratio        – payout ratio as % (or None)
        five_year_avg_yield – 5-year average dividend yield %
    All numeric fields are None when unavailable.
    """
    try:
        info = yf.Ticker(_yf_symbol(ticker)).info

        def _ts_to_iso(ts) -> str | None:
            if not ts:
                return None
            try:
                return pd.Timestamp(ts, unit="s").date().isoformat()
            except Exception:
                return None

        rate  = info.get("dividendRate")
        yield_dec = info.get("dividendYield")
        return {
            "dividend_rate":       float(rate)            if rate       else None,
            "dividend_yield_pct":  float(yield_dec) * 100 if yield_dec  else None,
            "ex_dividend_date":    _ts_to_iso(info.get("exDividendDate")),
            "last_dividend_value": info.get("lastDividendValue"),
            "last_dividend_date":  _ts_to_iso(info.get("lastDividendDate")),
            "payout_ratio":        float(info["payoutRatio"]) * 100 if info.get("payoutRatio") else None,
            "five_year_avg_yield": float(info["fiveYearAvgDividendYield"]) if info.get("fiveYearAvgDividendYield") else None,
        }
    except Exception:
        return {k: None for k in (
            "dividend_rate", "dividend_yield_pct", "ex_dividend_date",
            "last_dividend_value", "last_dividend_date", "payout_ratio", "five_year_avg_yield",
        )}
