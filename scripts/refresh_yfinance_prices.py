# scripts/refresh_yfinance_prices.py

import os
from datetime import datetime, timezone

from supabase import create_client, Client
import yfinance as yf

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def log(*args):
    print("[refresh_yfinance]", *args, flush=True)


def fetch_yf_price(symbol: str) -> float | None:
    """
    Récupère le dernier prix de marché via yfinance.
    On prend la dernière clôture (ou le dernier "Close" intraday si dispo).
    """
    try:
        ticker = yf.Ticker(symbol)
        # Dernières données sur 1 jour, pas besoin de plus
        hist = ticker.history(period="1d", interval="1m")

        if hist is None or hist.empty:
            log("Pas de data yfinance pour", symbol)
            return None

        # On prend la dernière ligne non NaN
        last_valid = hist["Close"].dropna()
        if last_valid.empty:
            log("Pas de Close valide pour", symbol)
            return None

        price = float(last_valid.iloc[-1])
        if price <= 0:
            return None

        return price
    except Exception as e:
        log("Erreur yfinance pour", symbol, ":", e)
        return None


def get_last_recorded_price(instrument_id: str) -> float | None:
    """
    Récupère le dernier prix enregistré dans asset_prices pour un instrument.
    Retourne None s'il n'y a encore aucun enregistrement.
    """
    try:
        res = (
            supabase.table("asset_prices")
            .select("price")
            .eq("instrument_id", instrument_id)
            .order("fetched_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return None
        return float(rows[0]["price"])
    except Exception as e:
        log("Erreur lors de la récupération du dernier prix pour", instrument_id, ":", e)
        return None


def main():
    log("=== Début refresh via yfinance ===")

    # 1) Récupérer les holdings > 0 avec instrument_id + symbol
    res = (
        supabase.table("holdings")
        .select(
            """
            id,
            quantity,
            instrument_id,
            instrument:instruments!holdings_instrument_id_fkey (
                symbol
            )
        """
        )
        .gt("quantity", 0)
        .execute()
    )

    holdings = res.data or []
    log("Holdings bruts:", len(holdings))

    if not holdings:
        log("Aucun holding > 0, fin.")
        return

    # 2) Regrouper par instrument_id pour éviter les doublons
    instruments_map: dict[str, dict] = {}  # instrument_id -> { symbol, holdings: [] }

    for row in holdings:
        instrument_id = row.get("instrument_id")
        instrument = row.get("instrument") or {}
        symbol = instrument.get("symbol")

        log(
            "holding row ->",
            row.get("id"),
            "instrument:",
            instrument_id,
            "symbol:",
            symbol,
        )

        if not instrument_id or not symbol:
            continue

        if instrument_id not in instruments_map:
            instruments_map[instrument_id] = {"symbol": symbol, "holdings": []}

        instruments_map[instrument_id]["holdings"].append(row)

    log("Instruments distincts à mettre à jour:", len(instruments_map))

    updated = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    # 3) Pour chaque instrument, on récupère le prix + mise à jour
    for instrument_id, info in instruments_map.items():
        symbol = info["symbol"]
        symbol_str = str(symbol)

        log("=== Instrument", instrument_id, "symbol =", symbol_str, "===")

        price = fetch_yf_price(symbol_str)
        if price is None:
            log("Impossible de récupérer un prix pour", symbol_str)
            continue

        log("Prix yfinance retenu pour", symbol_str, "=", price)

        # 3a) Vérifier le dernier prix enregistré pour éviter les doublons
        last_price = get_last_recorded_price(instrument_id)
        is_duplicate = False
        if last_price is not None:
            # on met un petit epsilon pour éviter les soucis de flottants
            if abs(last_price - price) < 1e-6:
                is_duplicate = True

        if is_duplicate:
            log(
                "Prix identique au dernier enregistré pour",
                instrument_id,
                "(asset_prices non mis à jour).",
            )
        else:
            # Insert historique dans asset_prices uniquement si le prix change
            insert_res = (
                supabase.table("asset_prices")
                .insert(
                    {
                        "instrument_id": instrument_id,
                        "price": price,
                        "currency": "EUR",  # adapte si besoin
                        "source": "yfinance",
                        "fetched_at": now_iso,
                    }
                )
                .execute()
            )

            if insert_res.data is None:
                log("Erreur insert asset_prices pour", instrument_id, ":", insert_res)
                # on continue mais on le signale
            else:
                log("Insertion asset_prices OK pour", instrument_id)

        # 3b) Mise à jour des holdings liés (toujours, même si prix identique)
        for h in info["holdings"]:
            holding_id = h["id"]
            qty = float(h.get("quantity") or 0)
            current_value = qty * price

            upd_res = (
                supabase.table("holdings")
                .update(
                    {
                        "current_price": price,
                        "current_value": current_value,
                    }
                )
                .eq("id", holding_id)
                .execute()
            )

            if upd_res.data is None:
                log("Erreur update holding", holding_id, ":", upd_res)
                continue

            updated += 1

    log("Nombre de holdings mis à jour =", updated)
    log("=== Fin refresh via yfinance ===")


if __name__ == "__main__":
    main()
# test commentaire
#