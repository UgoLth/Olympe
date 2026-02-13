import os
import sys
import math
import datetime as dt
from typing import Optional, Dict, Any

import yfinance as yf
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise SystemExit("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def now_iso() -> str:
    return dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc).isoformat()


def today_key_utc() -> str:
    return dt.datetime.utcnow().date().isoformat()


def to_float(v) -> Optional[float]:
    try:
        if v is None:
            return None
        n = float(v)
        if not math.isfinite(n) or n <= 0:
            return None
        return n
    except Exception:
        return None


def yfinance_last_price(symbol: str) -> Optional[float]:
    """
    Récupère un prix 'dernier' via yfinance (plusieurs méthodes fallback)
    """
    t = yf.Ticker(symbol)

    # 1) fast_info
    try:
        fi = getattr(t, "fast_info", None) or {}
        for key in ["last_price", "regular_market_price", "previous_close"]:
            p = to_float(fi.get(key))
            if p:
                return p
    except Exception:
        pass

    # 2) info
    try:
        info = t.info or {}
        for key in ["regularMarketPrice", "currentPrice", "previousClose"]:
            p = to_float(info.get(key))
            if p:
                return p
    except Exception:
        pass

    # 3) history
    try:
        hist = t.history(period="5d", interval="1d")
        if hist is not None and not hist.empty:
            p = to_float(hist["Close"].iloc[-1])
            if p:
                return p
    except Exception:
        pass

    return None


def get_instrument_by_symbol(symbol: str) -> Optional[Dict[str, Any]]:
    res = sb.table("instruments").select("id,symbol,name").eq("symbol", symbol).limit(1).execute()
    rows = res.data or []
    return rows[0] if rows else None


def insert_asset_price(instrument_id: str, price: float, currency: str = "EUR", source: str = "yfinance"):
    sb.table("asset_prices").insert({
        "instrument_id": instrument_id,
        "price": price,
        "currency": currency,
        "source": source,
        "fetched_at": now_iso(),
    }).execute()


def upsert_asset_price_daily(instrument_id: str, price: float, currency: str = "EUR", source: str = "yfinance"):
    # nécessite un unique index (instrument_id, day) pour être clean
    sb.table("asset_prices_daily").upsert({
        "instrument_id": instrument_id,
        "day": today_key_utc(),
        "price": price,
        "currency": currency,
        "source": source,
        "fetched_at": now_iso(),
    }, on_conflict="instrument_id,day").execute()


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python yf_get_price_and_store.py <TICKER>  (ex: ESE.PA)")

    symbol = sys.argv[1].strip()
    if not symbol:
        raise SystemExit("❌ Empty symbol")

    price = yfinance_last_price(symbol)
    if not price:
        print("❌ No price found")
        sys.exit(2)

    inst = get_instrument_by_symbol(symbol)
    if not inst:
        print(f"⚠️ Instrument not found in DB for symbol={symbol}. Price={price}")
        # on peut juste afficher le prix sans stocker
        print(price)
        return

    instrument_id = inst["id"]

    # write to DB
    insert_asset_price(instrument_id, price, currency="EUR", source="yfinance")
    try:
        upsert_asset_price_daily(instrument_id, price, currency="EUR", source="yfinance")
    except Exception as e:
        # si pas de unique index, ça peut échouer -> pas bloquant
        print(f"⚠️ daily upsert failed (ok if no unique index): {e}")

    print(price)


if __name__ == "__main__":
    main()
