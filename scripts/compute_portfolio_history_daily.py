import os
from datetime import datetime
from zoneinfo import ZoneInfo

from supabase import create_client, Client


PARIS = ZoneInfo("Europe/Paris")


def to_float(v):
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except Exception:
        return 0.0


def paris_day_today() -> str:
    
    return datetime.now(PARIS).date().isoformat()


def latest_price_for_day(rows, target_day: str) -> dict:
    """
    rows: liste d'enregistrements asset_prices (instrument_id, price, fetched_at)
    -> retourne un dict instrument_id -> prix "dernier de la journée target_day (Paris)"
    Si plusieurs quotes le même jour => on garde la plus récente (en Paris).
    """
    last = {}
    for r in rows:
        inst = r["instrument_id"]
        price = to_float(r["price"])
        fetched_at = r["fetched_at"]
        if not fetched_at or not inst:
            continue

        
        dt = datetime.fromisoformat(fetched_at.replace("Z", "+00:00")).astimezone(PARIS)
        d = dt.date().isoformat()

        if d != target_day:
            continue

        prev = last.get(inst)
        if prev is None or dt > prev["dt"]:
            last[inst] = {"dt": dt, "price": price}

    return {k: v["price"] for k, v in last.items()}


def main():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase: Client = create_client(url, key)

    day = paris_day_today()

    
    
    acc_rows = supabase.table("accounts").select("user_id").execute().data or []
    user_ids = sorted({r["user_id"] for r in acc_rows if r.get("user_id")})

    if not user_ids:
        print("No users found (no accounts).")
        return

    
    for uid in user_ids:
        
        accounts = (
            supabase.table("accounts")
            .select("id,user_id,current_amount")
            .eq("user_id", uid)
            .execute()
            .data
            or []
        )

        
        holdings = (
            supabase.table("holdings")
            .select("id,user_id,account_id,instrument_id,quantity,current_price,current_value")
            .eq("user_id", uid)
            .execute()
            .data
            or []
        )

        
        instrument_ids = sorted({h["instrument_id"] for h in holdings if h.get("instrument_id")})
        prices_map = {}

        if instrument_ids:
            
            
            
            
            now_utc = datetime.utcnow()
            
            from_iso = (now_utc.replace(microsecond=0)).isoformat() + "Z"

            price_rows = (
                supabase.table("asset_prices")
                .select("instrument_id,price,fetched_at")
                .in_("instrument_id", instrument_ids)
                .order("fetched_at", desc=True)
                .limit(5000)  
                .execute()
                .data
                or []
            )

            prices_map = latest_price_for_day(price_rows, day)

        
        total_holdings_value = 0.0
        accounts_with_holdings = set()

        for h in holdings:
            accounts_with_holdings.add(h.get("account_id"))
            qty = to_float(h.get("quantity"))
            if qty <= 0 or not h.get("instrument_id"):
                continue

            inst = h["instrument_id"]

            
            daily_price = prices_map.get(inst)

            
            if daily_price is None:
                cv = h.get("current_value")
                if cv is not None:
                    total_holdings_value += to_float(cv)
                else:
                    total_holdings_value += qty * to_float(h.get("current_price"))
            else:
                total_holdings_value += qty * to_float(daily_price)

        
        total_standalone = 0.0
        for a in accounts:
            aid = a.get("id")
            if aid and aid not in accounts_with_holdings:
                total_standalone += to_float(a.get("current_amount"))

        total_value = total_holdings_value + total_standalone

        
        payload = {
            "user_id": uid,
            "day": day,
            "total_value": total_value,
            "computed_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        }

        supabase.table("portfolio_history_daily").upsert(
            payload,
            on_conflict="user_id,day"
        ).execute()

        print(f"[OK] {uid} day={day} total_value={total_value}")

    print("Done.")


if __name__ == "__main__":
    main()
