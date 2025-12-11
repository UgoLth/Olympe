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

# --- PÉRIODE DE CALCUL --- 
# On passe maintenant sur un rendement sur 1 an
YEARS = 1


# --- Helpers -----------------------------------------------------------------
def calculate_cagr(price_start: float, price_end: float, years: int) -> float | None:
    """
    Calcule un rendement annuel composé (CAGR).
    Pour years = 1 : return = price_end / price_start - 1
    """
    if price_start <= 0 or years <= 0:
        return None
    return (price_end / price_start) ** (1 / years) - 1


def get_instruments():
    """
    Récupère les instruments depuis Supabase (id + symbol).
    """
    resp = supabase.table("instruments").select("id, symbol").execute()
    instruments: list[dict] = []

    for row in resp.data or []:
        symbol = row.get("symbol")
        if not symbol:
            continue
        instruments.append({"id": row["id"], "symbol": symbol})

    return instruments


def fetch_and_store_return(inst: dict):
    """
    - Récupère les prix ajustés sur 1 an (Adj Close = dividendes inclus)
    - Calcule le rendement annuel
    - Enregistre dans instrument_returns
    """
    symbol = inst["symbol"]
    iid = inst["id"]

    print(f"📈 Fetching 1-year adjusted return for {symbol} ...")

    end = dt.datetime.utcnow()
    start = end - dt.timedelta(days=365 * YEARS)

    # Télécharge **Adj Close** pour avoir le rendement total return
    data = yf.download(symbol, start=start, end=end, progress=False)

    if data.empty:
        print(f"⚠ Aucun historique disponible pour {symbol} sur {YEARS} an.")
        return

    # Utilisation du prix ajusté (Adj Close)
    price_start = float(data["Adj Close"].iloc[0])
    price_end = float(data["Adj Close"].iloc[-1])

    cagr = calculate_cagr(price_start, price_end, YEARS)
    if cagr is None:
        print(f"⚠ Impossible de calculer le rendement pour {symbol}")
        return

    supabase.table("instrument_returns").upsert(
        {
            "instrument_id": iid,
            "cagr": cagr,                 # rendement annualisé
            "period_years": YEARS,        # toujours = 1
            "source": "yfinance_adjclose",
            "last_updated_at": dt.datetime.utcnow().isoformat(),
        }
    ).execute()

    print(f"✔ {symbol} 1-year total return = {cagr * 100:.2f} %")


# --- Entrée principale -------------------------------------------------------
def main():
    instruments = get_instruments()

    if not instruments:
        print("Aucun instrument trouvé dans Supabase.")
        return

    for inst in instruments:
        fetch_and_store_return(inst)

    print("\n🎉 Mise à jour des rendements terminée avec succès !")


if __name__ == "__main__":
    main()
