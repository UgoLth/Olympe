import os
import math
import datetime as dt
from typing import Optional, List, Dict, Any

import yfinance as yf
from supabase import create_client

# --- Config Supabase ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY n'est pas défini dans les variables d'environnement."
    )

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Rendement sur 1 an
YEARS = 1

# Historique daily à stocker (si tu veux “tout”, mets 20 ou "max" via yfinance)
HISTORY_YEARS = 10  # ex: 10 ans d'historique daily

# Batch pour upsert (évite les payloads trop gros)
UPSERT_BATCH = 500


# ---------------------------------------------------------------------------

def calculate_cagr(price_start: float, price_end: float, years: int) -> Optional[float]:
    if years <= 0 or price_start <= 0 or price_end <= 0:
        return None
    return (price_end / price_start) ** (1 / years) - 1


def chunked(lst: List[Any], n: int) -> List[List[Any]]:
    return [lst[i:i + n] for i in range(0, len(lst), n)]


def get_instruments(page_size: int = 1000) -> List[Dict[str, Any]]:
    """
    Récupère tous les instruments (pagination).
    """
    instruments: List[Dict[str, Any]] = []
    start = 0

    while True:
        end = start + page_size - 1
        resp = supabase.table("instruments").select("id, symbol").range(start, end).execute()

        rows = resp.data or []
        if not rows:
            break

        for row in rows:
            symbol = row.get("symbol")
            iid = row.get("id")
            if not symbol or not iid:
                continue
            instruments.append({"id": iid, "symbol": symbol})

        if len(rows) < page_size:
            break
        start += page_size

    return instruments


def fetch_daily_history(symbol: str, years: int) -> Optional[Any]:
    """
    Télécharge un historique daily via yfinance et renvoie un DataFrame.
    """
    end = dt.datetime.utcnow()
    start = end - dt.timedelta(days=365 * years)

    # interval="1d" obligatoire pour être cohérent avec asset_prices_daily
    df = yf.download(
        symbol,
        start=start,
        end=end,
        interval="1d",
        auto_adjust=False,
        progress=False,
        threads=False,
    )

    if df is None or df.empty:
        return None
    return df


def pick_close_series(df) -> Optional[Any]:
    """
    Choisit 'Adj Close' si dispo, sinon 'Close'.
    """
    cols = list(df.columns)
    if "Adj Close" in cols:
        s = df["Adj Close"]
    elif "Close" in cols:
        s = df["Close"]
    else:
        return None

    if s is None or s.empty:
        return None
    return s


def upsert_asset_prices_daily(instrument_id: str, close_series, source: str = "yfinance") -> int:
    """
    Upsert dans asset_prices_daily : (instrument_id, day, price, source)
    day = date (YYYY-MM-DD)
    """
    rows: List[Dict[str, Any]] = []

    # close_series index = DatetimeIndex (timezone-naive en général)
    for ts, price in close_series.items():
        if price is None or (isinstance(price, float) and (math.isnan(price) or math.isinf(price))):
            continue

        day = ts.date().isoformat()  # "YYYY-MM-DD"
        rows.append({
            "instrument_id": instrument_id,
            "day": day,
            "price": float(price),
            "source": source,
            # pas besoin de created_at/updated_at si gérés par la DB
        })

    if not rows:
        return 0

    total_upserted = 0
    for batch in chunked(rows, UPSERT_BATCH):
        # ⚠️ nécessite UNIQUE(instrument_id, day) pour que upsert cible bien la bonne ligne
        supabase.table("asset_prices_daily").upsert(batch).execute()
        total_upserted += len(batch)

    return total_upserted


def upsert_instrument_return(instrument_id: str, close_series, years: int, source: str = "yfinance") -> Optional[float]:
    """
    Calcule le CAGR sur YEARS en utilisant les daily close du dernier YEAR.
    """
    if close_series is None or close_series.empty:
        return None

    # On prend la fenêtre des 365*years derniers jours (en daily, yfinance peut manquer les week-ends)
    end_price = float(close_series.iloc[-1])

    # on remonte ~ years en arrière (approximatif en jours ouvrés)
    # si tu veux plus strict : trouver la première date >= (today - 365*years)
    start_index = max(0, len(close_series) - (252 * years))  # ~252 jours de bourse/an
    start_price = float(close_series.iloc[start_index])

    cagr = calculate_cagr(start_price, end_price, years)
    if cagr is None:
        return None

    supabase.table("instrument_returns").upsert(
        {
            "instrument_id": instrument_id,
            "cagr": cagr,
            "period_years": years,
            "source": source,
            "last_updated_at": dt.datetime.utcnow().isoformat(),
        }
    ).execute()

    return cagr


def fetch_and_store(inst: Dict[str, Any]) -> None:
    symbol = inst["symbol"]
    iid = inst["id"]

    print(f"\n📥 {symbol} -> download daily history ({HISTORY_YEARS}y)")

    df = fetch_daily_history(symbol, HISTORY_YEARS)
    if df is None:
        print(f"⚠ Aucun historique daily pour {symbol}")
        return

    closes = pick_close_series(df)
    if closes is None:
        print(f"⚠ Ni 'Adj Close' ni 'Close' pour {symbol}")
        return

    # 1) Remplir asset_prices_daily
    upserted = upsert_asset_prices_daily(iid, closes, source="yfinance")
    print(f"✅ asset_prices_daily upserted rows: {upserted}")

    # 2) Mettre à jour instrument_returns (CAGR 1 an)
    cagr = upsert_instrument_return(iid, closes, YEARS, source="yfinance")
    if cagr is None:
        print(f"⚠ Impossible de calculer le rendement 1 an pour {symbol}")
    else:
        print(f"✔ {symbol} return ({YEARS} an) = {cagr * 100:.2f} %")


def main():
    instruments = get_instruments()

    if not instruments:
        print("Aucun instrument trouvé dans la table 'instruments'.")
        return

    print(f"🔎 Instruments trouvés: {len(instruments)}")

    for inst in instruments:
        try:
            fetch_and_store(inst)
        except Exception as e:
            print(f"❌ Erreur sur {inst.get('symbol')} : {e}")

    print("\n🎉 Mise à jour des prix daily + rendements terminée !")


if __name__ == "__main__":
    main()
