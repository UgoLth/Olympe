import os
import datetime as dt

import yfinance as yf
from supabase import create_client

# --- Config Supabase depuis les variables d'environnement GitHub Actions ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY n'est pas défini dans les variables d'environnement."
    )

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Période sur laquelle on calcule le rendement (en années)
YEARS = 1


# --- Helpers -----------------------------------------------------------------
def calculate_cagr(price_start: float, price_end: float, years: int) -> float | None:
    """
    Calcule un rendement annuel composé (CAGR) à partir d'un prix de départ
    et d'un prix final. Retourne None si les données sont invalides.
    Pour years = 1, cela revient à (price_end / price_start - 1).
    """
    if price_start <= 0 or years <= 0:
        return None
    return (price_end / price_start) ** (1 / years) - 1


def get_instruments():
    """
    Récupère les instruments depuis la table `instruments`
    (on suppose que tu as au moins les colonnes `id` et `symbol`).
    """
    resp = supabase.table("instruments").select("id, symbol").execute()
    instruments: list[dict] = []

    for row in resp.data or []:
        symbol = row.get("symbol")
        if not symbol:
            continue
        instruments.append(
            {
                "id": row["id"],
                "symbol": symbol,
            }
        )

    return instruments


def fetch_and_store_return(inst: dict):
    """
    Pour un instrument donné (id + symbol) :
    - récupère les prix sur 1 an via yfinance
    - calcule le rendement annuel (CAGR sur 1 an)
    - stocke le résultat dans `instrument_returns`
    """
    symbol = inst["symbol"]
    iid = inst["id"]

    print(f"📈 Fetching 1-year adjusted return for {symbol} ...")

    end = dt.datetime.utcnow()
    start = end - dt.timedelta(days=365 * YEARS)

    # progress=False pour éviter la barre de progression dans les logs GitHub Actions
    data = yf.download(symbol, start=start, end=end, progress=False)

    if data.empty:
        print(f"⚠ Aucun historique disponible pour {symbol} sur {YEARS} an(s).")
        return

    # On essaie d'abord 'Adj Close', puis on se replie sur 'Close'
    if "Adj Close" in data.columns:
        prices = data["Adj Close"]
    elif "Close" in data.columns:
        prices = data["Close"]
    else:
        print(f"⚠ Ni 'Adj Close' ni 'Close' trouvés pour {symbol}")
        return

    if prices.empty:
        print(f"⚠ Pas de données de clôture utilisables pour {symbol}")
        return

    price_start = float(prices.iloc[0])
    price_end = float(prices.iloc[-1])

    cagr = calculate_cagr(price_start, price_end, YEARS)
    if cagr is None:
        print(f"⚠ Impossible de calculer le rendement pour {symbol}")
        return

    supabase.table("instrument_returns").upsert(
        {
            "instrument_id": iid,
            "cagr": cagr,          # rendement annuel (sur 1 an ici)
            "period_years": YEARS, # = 1
            "source": "yfinance",
            "last_updated_at": dt.datetime.utcnow().isoformat(),
        }
    ).execute()

    print(f"✔ {symbol} return ({YEARS} an) = {cagr * 100:.2f} %")


# --- Entrée principale -------------------------------------------------------
def main():
    instruments = get_instruments()

    if not instruments:
        print("Aucun instrument trouvé dans la table 'instruments'.")
        return

    for inst in instruments:
        fetch_and_store_return(inst)

    print("\n🎉 Mise à jour des rendements terminée !")


if __name__ == "__main__":
    main()
