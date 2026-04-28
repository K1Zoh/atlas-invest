import time
import requests
import pandas as pd

_COINGECKO_BASE = "https://api.coingecko.com/api/v3"
_TIMEOUT = 15

# Symbole standard → CoinGecko ID
# Source : https://www.coingecko.com (top 300 + tokens populaires)
_SYMBOL_TO_ID: dict[str, str] = {
    # ── Réserve de valeur / PoW ───────────────────────────────────────────────
    "BTC":    "bitcoin",
    "ETH":    "ethereum",
    "LTC":    "litecoin",
    "BCH":    "bitcoin-cash",
    "BSV":    "bitcoin-sv",
    "ZEC":    "zcash",
    "XMR":    "monero",
    "DASH":   "dash",
    "ETC":    "ethereum-classic",
    "KAS":    "kaspa",
    "ALPH":   "alephium",
    "RVN":    "ravencoin",
    "FLUX":   "zelcash",
    "ERGO":   "ergo",
    "BTG":    "bitcoin-gold",
    # ── Paiement / Réseau ────────────────────────────────────────────────────
    "XRP":    "ripple",
    "XLM":    "stellar",
    "XDC":    "xdce-crowd-sale",
    "NANO":   "nano",
    "BCN":    "bytecoin",
    # ── Layer 1 ──────────────────────────────────────────────────────────────
    "SOL":    "solana",
    "ADA":    "cardano",
    "AVAX":   "avalanche-2",
    "TRX":    "tron",
    "DOT":    "polkadot",
    "MATIC":  "matic-network",
    "POL":    "matic-network",
    "NEAR":   "near",
    "APT":    "aptos",
    "SUI":    "sui",
    "INJ":    "injective-protocol",
    "FTM":    "fantom",
    "ALGO":   "algorand",
    "VET":    "vechain",
    "TON":    "the-open-network",
    "SEI":    "sei-network",
    "ICP":    "internet-computer",
    "HBAR":   "hedera-hashgraph",
    "EGLD":   "elrond-erd-2",
    "ONE":    "harmony",
    "KLAY":   "klay-token",
    "CELO":   "celo",
    "FLOW":   "flow",
    "MINA":   "mina-protocol",
    "EOS":    "eos",
    "XTZ":    "tezos",
    "NEO":    "neo",
    "WAVES":  "waves",
    "ZIL":    "zilliqa",
    "QTUM":   "qtum",
    "IOTA":   "iota",
    "MIOTA":  "iota",
    "ICX":    "icon",
    "ONT":    "ontology",
    "KDA":    "kadena",
    "ROSE":   "oasis-network",
    "SCRT":   "secret",
    "KAVA":   "kava",
    "TFUEL":  "theta-fuel",
    "THETA":  "theta-token",
    "FTT":    "ftx-token",
    "CRO":    "crypto-com-chain",
    "OKB":    "okb",
    "HT":     "huobi-token",
    "KCS":    "kucoin-shares",
    "LUNC":   "terra-luna",
    "LUNA":   "terra-luna-2",
    "UST":    "terrausd",
    "ATOM":   "cosmos",
    "OSMO":   "osmosis",
    "AKT":    "akash-network",
    "JUNO":   "juno-network",
    "EVMOS":  "evmos",
    "INJ":    "injective-protocol",
    "TIA":    "celestia",
    "DYM":    "dymension",
    "PYTH":   "pyth-network",
    "JTO":    "jito-governance-token",
    "W":      "wormhole",
    "TNSR":   "tensor",
    "BOME":   "book-of-meme",
    "MEW":    "cat-in-a-dogs-world",
    "POPCAT": "popcat",
    "MOG":    "mog-coin",
    # ── Layer 0 / Interopérabilité ────────────────────────────────────────────
    "ATOM":   "cosmos",
    "DOT":    "polkadot",
    "AVAX":   "avalanche-2",
    "QNT":    "quant-network",
    "BAND":   "band-protocol",
    # ── Layer 2 / Scaling ─────────────────────────────────────────────────────
    "ARB":    "arbitrum",
    "OP":     "optimism",
    "IMX":    "immutable-x",
    "STX":    "blockstack",
    "ZK":     "zksync",
    "STRK":   "starknet",
    "MANTA":  "manta-network",
    "METIS":  "metis-token",
    "BOBA":   "boba-network",
    "CANTO":  "canto",
    "SCROLL": "scroll",
    "LINEA":  "linea",
    # ── DeFi ─────────────────────────────────────────────────────────────────
    "UNI":    "uniswap",
    "AAVE":   "aave",
    "MKR":    "maker",
    "CRV":    "curve-dao-token",
    "SNX":    "synthetix-network-token",
    "COMP":   "compound-governance-token",
    "RUNE":   "thorchain",
    "SUSHI":  "sushi",
    "1INCH":  "1inch",
    "BAL":    "balancer",
    "YFI":    "yearn-finance",
    "CVX":    "convex-finance",
    "DYDX":   "dydx",
    "GMX":    "gmx",
    "PENDLE": "pendle",
    "JUP":    "jupiter-exchange-solana",
    "ENA":    "ethena",
    "ETHFI":  "ether-fi",
    "EIGEN":  "eigenlayer",
    "RAY":    "raydium",
    "ORCA":   "orca",
    "DRIFT":  "drift-protocol",
    "JUPITER":"jupiter-exchange-solana",
    "HFT":    "hashflow",
    "PERP":   "perpetual-protocol",
    "VELO":   "velodrome-finance",
    "AERO":   "aerodrome-finance",
    "CAKE":   "pancakeswap-token",
    "BANANA": "apeswap-finance",
    # ── DeFi / Staking ───────────────────────────────────────────────────────
    "LDO":    "lido-dao",
    "RPL":    "rocket-pool",
    "FXS":    "frax-share",
    "FRAX":   "frax",
    "SFRXETH":"staked-frax-ether",
    "CBETH":  "coinbase-wrapped-staked-eth",
    "RETH":   "rocket-pool-eth",
    "STETH":  "staked-ether",
    "WSTETH": "wrapped-steth",
    "ANKR":   "ankr",
    "SSV":    "ssv-network",
    "OETH":   "origin-ether",
    # ── Oracles / Infrastructure ─────────────────────────────────────────────
    "LINK":   "chainlink",
    "GRT":    "the-graph",
    "PYTH":   "pyth-network",
    "EIGEN":  "eigenlayer",
    "API3":   "api3",
    "TRB":    "tellor",
    "UMA":    "uma",
    # ── Infra décentralisée / IA ─────────────────────────────────────────────
    "FIL":    "filecoin",
    "RENDER": "render-token",
    "RNDR":   "render-token",
    "TAO":    "bittensor",
    "WLD":    "worldcoin-wld",
    "IO":     "io-net",
    "AIOZ":   "aioz-network",
    "AKT":    "akash-network",
    "OCEAN":  "ocean-protocol",
    "FET":    "fetch-ai",
    "AGIX":   "singularitynet",
    "OLAS":   "autonolas",
    "NMR":    "numeraire",
    "GLM":    "golem",
    "AR":     "arweave",
    "STORJ":  "storj",
    "HNT":    "helium",
    "MOBILE": "helium-mobile",
    "IOT":    "helium-iot",
    "DIMO":   "dimo",
    # ── Exchange Tokens ───────────────────────────────────────────────────────
    "BNB":    "binancecoin",
    "OKB":    "okb",
    "CRO":    "crypto-com-chain",
    "KCS":    "kucoin-shares",
    "HT":     "huobi-token",
    "FTT":    "ftx-token",
    "GT":     "gatechain-token",
    "MX":     "mx-token",
    "BGB":    "bitget-token",
    # ── Stablecoins ───────────────────────────────────────────────────────────
    "USDT":   "tether",
    "USDC":   "usd-coin",
    "DAI":    "dai",
    "BUSD":   "binance-usd",
    "TUSD":   "true-usd",
    "FRAX":   "frax",
    "LUSD":   "liquity-usd",
    "USDD":   "usdd",
    "GUSD":   "gemini-dollar",
    "USDP":   "paxos-standard",
    "PYUSD":  "paypal-usd",
    # ── Métavers / Gaming ─────────────────────────────────────────────────────
    "MANA":   "decentraland",
    "SAND":   "the-sandbox",
    "AXS":    "axie-infinity",
    "ENJ":    "enjincoin",
    "GALA":   "gala",
    "GODS":   "gods-unchained",
    "ILV":    "illuvium",
    "MAGIC":  "magic",
    "PRIME":  "echelon-prime",
    "RON":    "ronin",
    # ── NFT / Marché ──────────────────────────────────────────────────────────
    "BLUR":   "blur",
    "X2Y2":   "x2y2",
    "LOOKS":  "looksrare",
    "APE":    "apecoin",
    "BAYC":   "bored-ape-yacht-club",  # fractionné
    # ── Meme / Spéculatif ─────────────────────────────────────────────────────
    "DOGE":   "dogecoin",
    "SHIB":   "shiba-inu",
    "PEPE":   "pepe",
    "WIF":    "dogwifcoin",
    "BONK":   "bonk",
    "FLOKI":  "floki",
    "TURBO":  "turbo",
    "ELON":   "dogelon-mars",
    "BABYDOGE":"baby-doge-coin",
    "SAMO":   "samoyedcoin",
    "COPE":   "cope",
    "SLERF":  "slerf",
    "MYRO":   "myro",
    "NEIRO":  "neiro-on-eth",
    "GOAT":   "goat",
    "PNUT":   "peanut-the-squirrel",
    # ── Divers ────────────────────────────────────────────────────────────────
    "XDC":    "xdce-crowd-sale",
    "ENS":    "ethereum-name-service",
    "BLUR":   "blur",
    "DESO":   "bitclout",
    "RPL":    "rocket-pool",
    "ETHW":   "ethereum-pow-iou",
    "CHZ":    "chiliz",
    "BAT":    "basic-attention-token",
    "ZRX":    "0x",
    "LRC":    "loopring",
    "CVC":    "civic",
    "NKN":    "nkn",
    "POLS":   "polkastarter",
    "ALPHA":  "alpha-finance",
    "BADGER": "badger-dao",
    "TRIBE":  "tribe-2",
    "RLC":    "iexec-rlc",
    "KNC":    "kyber-network-crystal",
    "BAND":   "band-protocol",
    "REQ":    "request-network",
    "KEEP":   "keep-network",
    "NU":     "nucypher",
    "BTRST":  "braintrust",
    "CLV":    "clover-finance",
    "FARM":   "harvest-finance",
    "BOND":   "barnbridge",
    "GTC":    "gitcoin",
    "RAD":    "radicle",
    "MPL":    "maple",
    "CFG":    "centrifuge",
    "TRAC":   "origintrail",
    "ROSE":   "oasis-network",
    "OGN":    "origin-protocol",
    "JASMY":  "jasmycoin",
    "ACH":    "alchemy-pay",
    "HIGH":   "highstreet",
    "CELR":   "celer-network",
    "SKL":    "skale",
    "CTSI":   "cartesi",
    "COTI":   "coti",
    "DUSK":   "dusk-network",
    "SYS":    "syscoin",
    "TWT":    "trust-wallet-token",
    "PHA":    "phala-network",
    "MLN":    "melon",
    "NMR":    "numeraire",
    "POND":   "marlin",
    "DATA":   "streamr",
    "IDEX":   "idex",
    "MDT":    "measurable-data-token",
    "BEAM":   "beam-2",
    "IMX":    "immutable-x",
    "METIS":  "metis-token",
    "OP":     "optimism",
    "LYRA":   "lyra-finance",
    "KWENTA": "kwenta",
    "SNX":    "synthetix-network-token",
    "SPELL":  "spell-token",
    "TIME":   "wonderland",
    "OHM":    "olympus",
    "KLIMA":  "klima-dao",
    "BTRFLY": "redacted",
    "VSTA":   "vesta-finance",
    "UMAMI":  "umami-finance",
    "RDNT":   "radiant-capital",
    "JONES":  "jones-dao",
    "DOPEX":  "dopex",
    "PLS":    "pulsechain",
    "HEX":    "hex",
    "XEN":    "xen-crypto",
    "BITCOIN":"bitcoin",
    # ── RWA / Institutional ──────────────────────────────────────────────────
    "ONDO":   "ondo-finance",
    "POLYX":  "polymesh-network",
    "CFG":    "centrifuge",
    "MPL":    "maple",
    "CRED":   "verify",
    "GFI":    "goldfinch",
    "TRU":    "truefi",
}

_ID_TO_SYMBOL: dict[str, str] = {v: k for k, v in _SYMBOL_TO_ID.items()}


def _symbol_to_id(symbol: str) -> str:
    """Convertit un symbole en CoinGecko ID. Fallback : essaie symbol en minuscule."""
    upper = symbol.upper()
    return _SYMBOL_TO_ID.get(upper, upper.lower())


def _resolve_unknown_id(symbol: str) -> str | None:
    """
    Pour les coins non présents dans _SYMBOL_TO_ID, interroge l'API CoinGecko search
    pour trouver le vrai ID à partir du symbole.
    """
    try:
        r = requests.get(
            f"{_COINGECKO_BASE}/search",
            params={"query": symbol},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        coins = r.json().get("coins", [])
        upper = symbol.upper()
        for coin in coins:
            if coin.get("symbol", "").upper() == upper:
                return coin.get("id")
    except Exception:
        pass
    return None


def search_crypto(query: str, max_results: int = 10) -> list[dict]:
    """Recherche des cryptomonnaies par nom ou symbole via CoinGecko."""
    try:
        r = requests.get(
            f"{_COINGECKO_BASE}/search",
            params={"query": query},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        results = []
        for coin in data.get("coins", [])[:max_results]:
            symbol = coin.get("symbol", "").upper()
            coingecko_id = coin.get("id", "")
            name = coin.get("name", symbol)
            market_cap_rank = coin.get("market_cap_rank") or 9999
            results.append({
                "symbol": symbol,
                "name": name,
                "exchange": "CoinGecko",
                "type": "Crypto",
                "coingecko_id": coingecko_id,
                "market_cap_rank": market_cap_rank,
            })
        # Trier par market cap rank pour mettre les plus gros en premier
        results.sort(key=lambda x: x["market_cap_rank"])
        return results
    except Exception:
        return []


def verify_crypto(symbol: str, coingecko_id: str | None = None) -> dict | None:
    """Vérifie un symbole crypto et retourne son cours actuel en EUR."""
    cg_id = coingecko_id or _SYMBOL_TO_ID.get(symbol.upper())
    if not cg_id:
        cg_id = _resolve_unknown_id(symbol)
    if not cg_id:
        cg_id = symbol.lower()
    try:
        r = requests.get(
            f"{_COINGECKO_BASE}/simple/price",
            params={"ids": cg_id, "vs_currencies": "eur", "include_24hr_change": "true"},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        if cg_id not in data:
            return None
        price = data[cg_id].get("eur")
        if price is None:
            return None
        change_24h = data[cg_id].get("eur_24h_change")
        name = _ID_TO_SYMBOL.get(cg_id, symbol.upper())
        return {
            "name": name,
            "price": float(price),
            "currency": "EUR",
            "change_24h": float(change_24h) if change_24h is not None else None,
            "coingecko_id": cg_id,
        }
    except Exception:
        return None


def get_crypto_prices(
    symbols: list[str],
    id_overrides: dict[str, str] | None = None,
) -> dict[str, float]:
    """
    Retourne les cours EUR actuels pour une liste de symboles crypto.
    id_overrides: {SYMBOL: coingecko_id} — utilisé pour les coins non présents
    dans _SYMBOL_TO_ID (stocké en base lors de l'ajout via la recherche).
    """
    if not symbols:
        return {}

    id_to_symbol: dict[str, str] = {}
    ids: list[str] = []
    for s in symbols:
        upper = s.upper()
        cg_id = (id_overrides or {}).get(upper) or _SYMBOL_TO_ID.get(upper)
        if not cg_id:
            # Dernier recours : cherche via l'API (1 requête supplémentaire)
            cg_id = _resolve_unknown_id(upper) or upper.lower()
        id_to_symbol[cg_id] = upper
        ids.append(cg_id)

    try:
        r = requests.get(
            f"{_COINGECKO_BASE}/simple/price",
            params={"ids": ",".join(dict.fromkeys(ids)), "vs_currencies": "eur"},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        result: dict[str, float] = {}
        for cg_id, prices in data.items():
            symbol = id_to_symbol.get(cg_id, cg_id.upper())
            price = prices.get("eur")
            if price is not None:
                result[symbol] = float(price)
        return result
    except Exception:
        return {}


def get_crypto_raw_history(
    symbol: str,
    days: int = 365,
    id_overrides: dict[str, str] | None = None,
) -> pd.Series:
    """Raw EUR prices for a single crypto. Returns pd.Series indexed by date."""
    upper = symbol.upper()
    cg_id = (id_overrides or {}).get(upper) or _SYMBOL_TO_ID.get(upper)
    if not cg_id:
        cg_id = _resolve_unknown_id(upper) or upper.lower()
    try:
        r = requests.get(
            f"{_COINGECKO_BASE}/coins/{cg_id}/market_chart",
            params={"vs_currency": "eur", "days": days, "interval": "daily"},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        prices_raw = r.json().get("prices", [])
        if prices_raw:
            dates = [pd.Timestamp(p[0], unit="ms").normalize() for p in prices_raw]
            vals  = [p[1] for p in prices_raw]
            s = pd.Series(vals, index=dates, name=upper)
            s.index.name = "Date"
            s = s.dropna()
            s = s[~s.index.duplicated(keep="last")]
            return s
    except Exception:
        pass
    return pd.Series(dtype=float)


def get_crypto_multi_raw_history_df(
    symbols: list[str],
    days: int = 730,
    id_overrides: dict[str, str] | None = None,
) -> pd.DataFrame:
    """Raw EUR prices for multiple cryptos, forward-filled. Not normalized."""
    if not symbols:
        return pd.DataFrame()
    series = {}
    for sym in symbols:
        s = get_crypto_raw_history(sym, days, id_overrides)
        if not s.empty:
            series[sym.upper()] = s
        time.sleep(0.4)
    if not series:
        return pd.DataFrame()
    df = pd.DataFrame(series)
    df = df[~df.index.duplicated(keep="last")]
    return df.ffill()


def get_crypto_normalized_history(
    symbols: list[str],
    days: int = 365,
    id_overrides: dict[str, str] | None = None,
) -> pd.DataFrame:
    """
    Télécharge l'historique de prix normalisé (base 100) pour une liste de cryptos.
    Utilise CoinGecko market_chart — une requête par crypto avec pause anti-rate-limit.
    id_overrides: {SYMBOL: coingecko_id} pour les cryptos niche.
    """
    if not symbols:
        return pd.DataFrame()

    all_series: dict[str, pd.Series] = {}
    for symbol in symbols:
        upper = symbol.upper()
        cg_id = (id_overrides or {}).get(upper) or _SYMBOL_TO_ID.get(upper)
        if not cg_id:
            cg_id = _resolve_unknown_id(upper) or upper.lower()
        try:
            r = requests.get(
                f"{_COINGECKO_BASE}/coins/{cg_id}/market_chart",
                params={"vs_currency": "eur", "days": days, "interval": "daily"},
                timeout=_TIMEOUT,
            )
            r.raise_for_status()
            data = r.json()
            prices_raw = data.get("prices", [])
            if prices_raw:
                dates = [pd.Timestamp(p[0], unit="ms").normalize() for p in prices_raw]
                vals = [p[1] for p in prices_raw]
                s = pd.Series(vals, index=dates, name=upper)
                if s.iloc[0] > 0:
                    s = s / s.iloc[0] * 100
                all_series[upper] = s
            time.sleep(0.5)
        except Exception:
            pass

    if not all_series:
        return pd.DataFrame()

    df = pd.DataFrame(all_series)
    df.index.name = "Date"
    return df.dropna(how="all")
