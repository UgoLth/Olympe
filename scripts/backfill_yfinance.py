import os
from typing import List, Set
from datetime import datetime

import yfinance as yf
from supabase import create_client, Client




SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquants dans les variables d'environnement."
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)



MANUAL_SYMBOLS: List[str] = [
    
    
]




def fetch_symbols_from_instruments() -> List[str]:
    """
    Récupère TOUS les symboles présents dans la table instruments.
    (on dédoublonne au cas où, puis on trie)
    """
    print("→ Récupération des symboles depuis instruments…")

    resp = supabase.table("instruments").select("symbol").execute()

    if getattr(resp, "error", None):
        print("  Erreur Supabase:", resp.error)
        raise RuntimeError(resp.error)

    symbols_set: Set[str] = set()

    for row in resp.data or []:
        symbol = row.get("symbol")
        if symbol:
            symbols_set.add(symbol)

    symbols = sorted(symbols_set)
    print(f"  {len(symbols)} symboles trouvés dans instruments :", symbols)
    return symbols


def get_or_create_instrument(symbol: str) -> str:
    """
    Récupère l'id d'un instrument existant pour ce symbol,
    ou le crée si besoin.
    """
    print(f"→ get_or_create_instrument pour {symbol}")
    res = (
        supabase.table("instruments")
        .select("id")
        .eq("symbol", symbol)
        .limit(1)
        .execute()
    )

    if res.data and len(res.data) > 0:
        instrument_id = res.data[0]["id"]
        print(f"  Instrument existant trouvé: {instrument_id}")
        return instrument_id

    print(f"  Aucun instrument trouvé pour {symbol}, création...")
    insert_res = (
        supabase.table("instruments")
        .insert(
            {
                "symbol": symbol,
                "name": symbol,
                "asset_class": None,
                "currency": None,
                "exchange": None,
            }
        )
        .select("id")
        .execute()
    )

    if not insert_res.data or len(insert_res.data) == 0:
        raise RuntimeError(f"Impossible de créer l'instrument pour {symbol}")

    instrument_id = insert_res.data[0]["id"]
    print(f"  Instrument créé: {instrument_id}")
    return instrument_id




def backfill_symbol(symbol: str):
    """
    Backfill complet d'un symbole :
    - récupère / crée instrument
    - télécharge l'historique yfinance
    - UPSERT dans asset_prices (doublons gérés par la DB via UNIQUE)
    """
    print(f"\n========== BACKFILL {symbol} ==========")

    instrument_id = get_or_create_instrument(symbol)

    print(f"→ Téléchargement historique yfinance pour {symbol}...")
    df = yf.download(symbol, period="max", interval="1d", auto_adjust=False)

    if df.empty:
        print(f"  Aucune donnée retournée par yfinance pour {symbol}")
        return

    
    
    if hasattr(df.columns, "nlevels") and df.columns.nlevels > 1:
        df.columns = [" ".join([str(x) for x in col if x]).strip() for col in df.columns.values]

    print(f"  {len(df)} lignes reçues depuis yfinance.")

    rows_to_upsert = []

    for index, row in df.iterrows():
        if isinstance(index, datetime):
            date_str = index.strftime("%Y-%m-%d")
        else:
            date_str = str(index)[:10]

        
        price = None
        try:
            if "Adj Close" in df.columns:
                value = row["Adj Close"]
            elif "Close" in df.columns:
                value = row["Close"]
            else:
                
                continue

            
            if hasattr(value, "iloc"):
                value = value.iloc[0]

            if value is not None:
                price = float(value)
        except Exception:
            continue

        if price is None or price <= 0:
            continue
        

        
        fetched_at = datetime.strptime(date_str, "%Y-%m-%d").isoformat() + "Z"

        rows_to_upsert.append(
            {
                "instrument_id": instrument_id,
                "price": price,
                "currency": None,
                "source": "yahoo_yfinance",
                "fetched_at": fetched_at,
            }
        )

    print(f"  {len(rows_to_upsert)} lignes (tentatives) à upsert dans asset_prices.")

    if not rows_to_upsert:
        print("  Rien à insérer.")
        return

    batch_size = 500
    processed_total = 0

    for i in range(0, len(rows_to_upsert), batch_size):
        chunk = rows_to_upsert[i: i + batch_size]
        print(f"  → Upsert chunk {i} - {i + len(chunk)}...")

        res = (
            supabase.table("asset_prices")
            .upsert(chunk, on_conflict="instrument_id,fetched_at")
            .execute()
        )

        if getattr(res, "error", None):
            print("    Erreur Supabase:", res.error)
            raise RuntimeError(res.error)

        processed_total += len(chunk)

    print(
        f"✅ Backfill terminé pour {symbol} : {processed_total} lignes traitées (doublons ignorés)."
    )




def main():
    print("=== Backfill YFinance vers Supabase ===")
    print(f"SUPABASE_URL = {SUPABASE_URL}")

    if MANUAL_SYMBOLS:
        symbols = MANUAL_SYMBOLS
        print("Utilisation de la liste MANUAL_SYMBOLS :", symbols)
    else:
        symbols = fetch_symbols_from_instruments()

    if not symbols:
        print("Aucun symbole à traiter, fin.")
        return

    print(f"Symboles à traiter : {symbols}")

    for symbol in symbols:
        backfill_symbol(symbol)

    print("\nTous les symboles ont été traités.")


if __name__ == "__main__":
    main()
