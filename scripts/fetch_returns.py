import yfinance as yf
import datetime as dt
from supabase import create_client
import os

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

YEARS = 5


def calculate_cagr(price_start, price_end, years):
    if price_start <= 0:
        return None
    return (price_end / price_start) ** (1 / years) - 1


def get_instruments():
    resp = supabase.table("instruments").select("id, symbol").execute()
    instruments = []

    for row in resp.data:
        symbol = row.get("symbol")
        if symbol:
            instruments.append({
                "id": row["id"],
                "symbol": symbol
            })

    return instruments


def fetch_and_store_return(inst):
    symbol = inst["symbol"]
    iid = inst["id"]

    print(f"Fetching prices for {symbol} ...")

    end = dt.datetime.now()
    start = end - dt.timedelta(days=365 * YEARS)

    data = yf.download(symbol, start=start, end=end)

    if data.empty:
        print(f"⚠ Aucun historique disponible pour {symbol}")
        return

    price_start = data["Close"].iloc[0]
    price_end   = data["Close"].iloc[-1]

    cagr = calculate_cagr(price_start, price_end, YEARS)

    supabase.table("instrument_returns").upsert({
        "instrument_id": iid,
        "cagr": cagr,
        "period_years": YEARS,
        "source": "yfinance",
        "last_updated_at": dt.datetime.utcnow().isoformat(),
    }).execute()

    print(f"✔ {symbol} CAGR = {cagr*100:.2f} %")


def main():
    instruments = get_instruments()

    if not instruments:
        print("Aucun instrument trouvé.")
        return

    for inst in instruments:
        fetch_and_store_return(inst)

    print("\n🎉 Mise à jour terminée !")


if __name__ == "__main__":
    main()
