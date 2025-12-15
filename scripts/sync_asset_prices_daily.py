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

LOOKBACK_YEARS = 2

PAGE_SIZE = 1000
UPSERT_BATCH = 500


def to_paris_day(ts: str) -> dt.date:
    utc_dt = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    paris_dt = utc_dt.astimezone(TZ_PARIS)
    return paris_dt.date()


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def main():
    print("📥 Build asset_prices_daily depuis asset_prices (dernier prix/jour, récent)")

    now_utc = dt.datetime.now(dt.timezone.utc)
    start_utc = now_utc - dt.timedelta(days=365 * LOOKBACK_YEARS + 10)
    start_iso = start_utc.isoformat()

    print(f"🕒 Fenêtre: depuis {start_iso} (UTC) ~ {LOOKBACK_YEARS} an(s)")

    seen = set()  # (instrument_id, day)
    batch_payload = []
    total_rows = 0
    total_daily_points = 0

    # Pagination keyset: on récupère les pages avant le dernier fetched_at lu
    cursor_fetched_at = None

    now_str = dt.datetime.utcnow().isoformat()

    while True:
        q = (
            supabase.table("asset_prices")
            .select("instrument_id, price, fetched_at")  # si tu as "id", ajoute-le ici
            .gte("fetched_at", start_iso)
            .order("fetched_at", desc=True)
            .limit(PAGE_SIZE)
        )

        # Keyset pagination (au lieu d'OFFSET)
        if cursor_fetched_at is not None:
            q = q.lt("fetched_at", cursor_fetched_at)

        resp = q.execute()
        rows = resp.data or []
        if not rows:
            break

        total_rows += len(rows)

        # curseur = fetched_at du dernier élément de la page (le plus ancien de la page)
        cursor_fetched_at = rows[-1].get("fetched_at")

        for r in rows:
            instrument_id = r.get("instrument_id")
            price = r.get("price")
            fetched_at = r.get("fetched_at")

            if not instrument_id or price is None or not fetched_at:
                continue

            try:
                day = to_paris_day(fetched_at)
            except Exception:
                continue

            key = (instrument_id, day)

            # comme on lit en DESC, le 1er vu par (instrument, day) = dernier prix du jour
            if key in seen:
                continue

            seen.add(key)
            total_daily_points += 1

            batch_payload.append(
                {
                    "instrument_id": instrument_id,
                    "day": day.isoformat(),
                    "price": float(price),
                    "source": "asset_prices",
                    "updated_at": now_str,
                }
            )

            # flush batch
            if len(batch_payload) >= UPSERT_BATCH:
                supabase.table("asset_prices_daily").upsert(
                    batch_payload,
                    on_conflict="instrument_id,day"
                ).execute()
                batch_payload.clear()

        print(
            f"… page ok | rows lus={total_rows} | daily points={total_daily_points} | curseur={cursor_fetched_at}"
        )

    # flush final
    if batch_payload:
        supabase.table("asset_prices_daily").upsert(
            batch_payload,
            on_conflict="instrument_id,day"
        ).execute()

    if total_daily_points == 0:
        print("⚠️ Aucun prix récent trouvé dans asset_prices.")
        return

    print(f"✅ asset_prices_daily mise à jour. points={total_daily_points}")

    # Optionnel : purge des jours hors fenêtre (pour garder une table propre)
    cutoff_day = (now_utc.astimezone(TZ_PARIS).date() - dt.timedelta(days=365 * LOOKBACK_YEARS + 10)).isoformat()
    print(f"🧹 Purge optionnelle des days < {cutoff_day}")
    supabase.table("asset_prices_daily").delete().lt("day", cutoff_day).execute()

    print("✅ Purge terminée (si autorisée par RLS/policies).")


if __name__ == "__main__":
    main()
