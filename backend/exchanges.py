"""
Registre centralisé des exchanges et brokers.
URL templates : {t} = ticker uppercase, {tl} = ticker lowercase.
"""

_CRYPTO_EXCHANGES: list[dict] = [
    {
        "name":         "Binance",
        "url_template": "https://www.binance.com/en/trade/{t}_USDT",
        "color":        "#f0b90b",
        "desc":         "Leader mondial · spot & dérivés",
    },
    {
        "name":         "Coinbase",
        "url_template": "https://www.coinbase.com/advanced-trade/spot/{t}-EUR",
        "color":        "#0052ff",
        "desc":         "Achats en euros · réglementé EU",
    },
    {
        "name":         "Kraken",
        "url_template": "https://pro.kraken.com/app/trade/{tl}-eur",
        "color":        "#5741d9",
        "desc":         "Sécurisé · paires EUR",
    },
    {
        "name":         "Bybit",
        "url_template": "https://www.bybit.com/en/trade/spot/{t}/USDT",
        "color":        "#f7a600",
        "desc":         "Spot & futures · copy trading",
    },
    {
        "name":         "KuCoin",
        "url_template": "https://www.kucoin.com/trade/{t}-USDT",
        "color":        "#23af91",
        "desc":         "Large sélection d'altcoins",
    },
    {
        "name":         "Bitget",
        "url_template": "https://www.bitget.com/spot/{t}USDT",
        "color":        "#00cdd9",
        "desc":         "Copy trading · futures",
    },
    {
        "name":         "Gate.io",
        "url_template": "https://www.gate.io/trade/{t}_USDT",
        "color":        "#2354e6",
        "desc":         "Plus de 1 400 cryptos listées",
    },
]

_STOCK_PLATFORMS: list[dict] = [
    {
        "name":         "eToro",
        "url_template": "https://www.etoro.com/markets/{t}",
        "color":        "#6ebe44",
        "desc":         "Social trading · 0% commission",
    },
    {
        "name":         "Trading 212",
        "url_template": "https://app.trading212.com/",
        "color":        "#05c3de",
        "desc":         "0 commission · fractionnaire",
    },
    {
        "name":         "DEGIRO",
        "url_template": "https://trader.degiro.com/",
        "color":        "#ff6600",
        "desc":         "Frais réduits · bourse EU",
    },
    {
        "name":         "Interactive Brokers",
        "url_template": "https://www.interactivebrokers.com/",
        "color":        "#e8a020",
        "desc":         "Professionnel · marchés mondiaux",
    },
    {
        "name":         "Saxo",
        "url_template": "https://www.home.saxo/",
        "color":        "#cc0000",
        "desc":         "Banque · large gamme",
    },
    {
        "name":         "Boursorama",
        "url_template": "https://www.boursorama.com/cours/",
        "color":        "#003d82",
        "desc":         "Banque française · Bourse",
    },
    {
        "name":         "Yahoo Finance",
        "url_template": "https://finance.yahoo.com/quote/{t}",
        "color":        "#720e9e",
        "desc":         "Cotation temps réel · référence",
    },
    {
        "name":         "Investing.com",
        "url_template": "https://www.investing.com/search/?q={t}",
        "color":        "#e64c2d",
        "desc":         "Analyse & actualités",
    },
]

CRYPTO_PLATFORM_NAMES: list[str] = [e["name"] for e in _CRYPTO_EXCHANGES]
STOCK_PLATFORM_NAMES:  list[str] = [e["name"] for e in _STOCK_PLATFORMS]


def get_exchanges_for_asset(asset_class: str) -> list[dict]:
    return _CRYPTO_EXCHANGES if asset_class == "crypto" else _STOCK_PLATFORMS


def get_exchange_info(platform_name: str) -> dict | None:
    for ex in _CRYPTO_EXCHANGES + _STOCK_PLATFORMS:
        if ex["name"] == platform_name:
            return ex
    return None


def build_exchange_url(platform_name: str, ticker: str) -> str:
    info = get_exchange_info(platform_name)
    if not info:
        return ""
    t  = ticker.upper()
    tl = ticker.lower()
    return info["url_template"].format(t=t, tl=tl)
