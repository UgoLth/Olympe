import os
import datetime as dt
from supabase import create_client
import pytz

# ----------------- Config -----------------
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

TZ_PARIS = pytz.timezone("Europe/Paris")

# combien d'années "récentes" on veut garder dans le daily
LOOKBACK_YEARS = 2

# pagination / batch
PAGE_SIZE = 1000
UPSERT_BATCH = 500


def to_paris_day(ts: str) -> dt.date:
    """
    Convertit un timestamp (ISO) en date Europe/Paris.
    fetched_at peut arriver avec Z ou +00:00.
    """
    # Exemple: "2025-12-13T14:08:26.178524+00:00" ou "....Z"
    utc_dt = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    paris_dt = utc_dt.astimezone(TZ_PARIS)
    return paris_dt.date()


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def main():
    print("📥 Build asset_prices_daily depuis asset_prices (dernier prix/jour, récent)")

    now_utc = dt.datetime.now(dt.timezone.utc)
    start_utc = now_utc - dt.timedelta(days=365 * LOOKBACK_YEARS + 10)  # marge
    start_iso = start_utc.isoformat()

    print(f"🕒 Fenêtre: depuis {start_iso} (UTC) ~ {LOOKBACK_YEARS} an(s)")

    # Map: (instrument_id, day) -> price
    # On parcourt en DESC, donc la 1ère valeur vue = dernier prix de la journée.
    daily_map = {}

    offset = 0
    total_rows = 0

    while True:
        q = (
            supabase.table("asset_prices")
            .select("instrument_id, price, fetched_at")
            .gte("fetched_at", start_iso)
            .order("fetched_at", desc=True)
            .range(offset, offset + PAGE_SIZE - 1)
        )

        resp = q.execute()
        rows = resp.data or []
        if not rows:
            break

        total_rows += len(rows)

        for r in rows:
            instrument_id = r.get("instrument_id")
            price = r.get("price")
            fetched_at = r.get("fetched_at")

            if not instrument_id or price is None or not fetched_at:
                continue

            try:
                day = to_paris_day(fetched_at)
                key = (instrument_id, day)

                # IMPORTANT: comme on est en DESC, le 1er rencontré = dernier prix du jour
                if key not in daily_map:
                    daily_map[key] = float(price)
            except Exception:
                continue

        offset += PAGE_SIZE
        print(f"… page ok (offset={offset}) | rows lus={total_rows} | jours uniques={len(daily_map)}")

    if not daily_map:
        print("⚠️ Aucun prix récent trouvé dans asset_prices.")
        return

    print(f"📊 {len(daily_map)} points journaliers (instrument_id + day) calculés.")

    # Upsert payload
    now_str = dt.datetime.utcnow().isoformat()

    payload = []
    for (instrument_id, day), price in daily_map.items():
        payload.append(
            {
                "instrument_id": instrument_id,
                "day": day.isoformat(),   # DATE "YYYY-MM-DD"
                "price": price,
                "source": "asset_prices",
                "updated_at": now_str,
            }
        )

    # Upsert en batch
    print("🚀 Upsert dans asset_prices_daily…")
    for batch in chunks(payload, UPSERT_BATCH):
        supabase.table("asset_prices_daily").upsert(
            batch,
            on_conflict="instrument_id,day"
        ).execute()

    print("✅ asset_prices_daily mise à jour (dernier prix par jour, récent).")


if __name__ == "__main__":
    main()
