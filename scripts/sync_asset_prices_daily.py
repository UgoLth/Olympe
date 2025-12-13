import os
import datetime as dt
from collections import defaultdict
from supabase import create_client
import pytz

# --- Supabase ---
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Timezone cible ---
TZ_PARIS = pytz.timezone("Europe/Paris")

def to_paris_day(ts: str) -> dt.date:
    """
    Convertit un timestamp UTC en DATE Europe/Paris
    """
    utc_dt = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    paris_dt = utc_dt.astimezone(TZ_PARIS)
    return paris_dt.date()

def main():
    print("📥 Fetch asset_prices...")

    resp = supabase.table("asset_prices") \
        .select("instrument_id, price, fetched_at") \
        .order("fetched_at", desc=False) \
        .execute()

    rows = resp.data or []
    if not rows:
        print("⚠️ Aucun prix trouvé")
        return

    # instrument_id + day => last price of the day
    daily_map = {}

    for r in rows:
        instrument_id = r["instrument_id"]
        price = float(r["price"])
        day = to_paris_day(r["fetched_at"])

        key = (instrument_id, day)
        # comme on parcourt en ordre chronologique,
        # la dernière écriture = dernier prix du jour
        daily_map[key] = price

    print(f"📊 {len(daily_map)} prix journaliers calculés")

    # Upsert
    payload = []
    now = dt.datetime.utcnow().isoformat()

    for (instrument_id, day), price in daily_map.items():
        payload.append({
            "instrument_id": instrument_id,
            "day": day.isoformat(),
            "price": price,
            "updated_at": now
        })

    if payload:
        supabase.table("asset_prices_daily") \
            .upsert(payload, on_conflict="instrument_id,day") \
            .execute()

    print("✅ asset_prices_daily mise à jour")

if __name__ == "__main__":
    main()
