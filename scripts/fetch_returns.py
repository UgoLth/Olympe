import os
import datetime as dt

import yfinance as yf
from supabase import create_client


# ------------------------
# Config Supabase
# ------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans les variables d'environnement")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Nombre d'années pour le calcul du rendement annualisé
YEARS = 5


# ------------------------
# Helpers
# ------------------------
def calculate_cagr(price_start: float, price_end: float, years: int):
    """
    CAGR = (price_end / price_start) ** (1/years) - 1
    Retourne None si price_start <= 0.
    """
    if price_start <= 0:
        return None
    return (price_end / price_start) ** (1 / years) - 1


def get_instruments():
    """
    Récupère la liste des instruments depuis la table `instruments`
    en ne gardant que id + symbol (pour yfinance).
    """
    resp = supabase.table("instruments").select("id, symbol").execute()
    instruments = []

    for row in resp.data or []:
        symbol = row.get("symbol")
        if symbol:
            instruments.append(
                {
                    "id": row["id"],
                    "symbol": symbol,
                }
            )

    return instruments


def fetch_and_store_return(inst):
    """
    Télécharge les prix avec yfinance, calcule le CAGR,
    et l'upsert dans `instrument_returns`.
    """
    symbol = inst["symbol"]
    iid = inst["id"]

    print(f"📈 Fetching prices for {symbol} ...")

    end = dt.datetime.now()
    start = end - dt.timedelta(days=365 * YEARS)

    # yfinance télécharge les prix journaliers
    data = yf.download(symbol, start=start, end=end, progress=False)

    if data is None or data.empty:
        print(f"⚠ Aucun historique disponible pour {symbol}")
        return

    price_start = float(data["Close"].iloc[0])
    price_end = float(data["Close"].iloc[-1])

    cagr = calculate_cagr(price_start, price_end, YEARS)

    # On stocke dans une table `instrument_returns`
    supabase.table("instrument_returns").upsert(
        {
            "instrument_id": iid,
            "cagr": cagr,
            "period_years": YEARS,
            "source": "yfinance",
            "last_updated_at": dt.datetime.utcnow().isoformat(),
        }
    ).execute()

    if cagr is not None:
        print(f"✔ {symbol} CAGR = {cagr * 100:.2f} %")
    else:
        print(f"⚠ CAGR non calculable pour {symbol} (price_start <= 0)")


def main():
    instruments = get_instruments()

    if not instruments:
        print("Aucun instrument trouvé dans la table `instruments`.")
        return

    print(f"🔎 {len(instruments)} instruments trouvés, démarrage de la mise à jour...\n")

    for inst in instruments:
        fetch_and_store_return(inst)

    print("\n🎉 Mise à jour des rendements terminée !")


if __name__ == "__main__":
    main()
