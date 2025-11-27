import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---- Prix Finnhub ----
async function fetchFinnhubPrice(symbol: string): Promise<number | null> {
  if (!FINNHUB_API_KEY) {
    console.warn("FINNHUB_API_KEY manquante, on saute Finnhub");
    return null;
  }

  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
      symbol
    )}&token=${FINNHUB_API_KEY}`;

    console.log("Finnhub: appel pour", symbol, url);
    const res = await fetch(url);

    if (!res.ok) {
      console.error("Finnhub status", res.status, "pour", symbol);
      return null;
    }

    const quote = await res.json();
    console.log("Finnhub quote pour", symbol, "=", quote);

    const c = Number(quote.c);
    return c > 0 && !Number.isNaN(c) ? c : null;
  } catch (e) {
    console.error("Finnhub error", symbol, e);
    return null;
  }
}

// ---- Fallback EODHD (Edge Function eodhd-price) ----
async function fetchEodhdPrice(symbol: string): Promise<number | null> {
  try {
    const url = `${SUPABASE_URL}/functions/v1/eodhd-price`;
    console.log("EODHD: appel pour", symbol, "->", url);

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });

    const text = await resp.text();
    console.log("EODHD: brut", resp.status, text);

    if (!resp.ok) {
      return null;
    }

    const data = JSON.parse(text);
    if (!data || data.price == null) return null;

    const num =
      typeof data.price === "number"
        ? data.price
        : parseFloat(String(data.price).replace(",", "."));

    return !Number.isNaN(num) && num > 0 ? num : null;
  } catch (err) {
    console.error("EODHD error", symbol, err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    // 1) Récupérer les instruments détenus (quantity > 0)
    const { data, error } = await supabase
      .from("holdings")
      .select(
        `
        instrument_id,
        instrument:instruments!holdings_instrument_id_fkey (
          symbol
        )
      `
      )
      .gt("quantity", 0);

    if (error) {
      console.error("Supabase holdings error:", error);
      throw error;
    }

    console.log("Holdings bruts =", data);

    if (!data || data.length === 0) {
      console.log("Aucun holding > 0, rien à mettre à jour.");
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2) Dédup instruments
    const map = new Map<string, string>(); // instrument_id -> symbol
    for (const row of data as any[]) {
      const instrumentId = row.instrument_id as string | null;
      const symbol = row.instrument?.symbol as string | null;
      console.log("Row holdings ->", row, "instrumentId=", instrumentId, "symbol=", symbol);
      if (instrumentId && symbol) {
        map.set(instrumentId, symbol);
      }
    }

    console.log("Instruments à mettre à jour (map.size) =", map.size);

    let updated = 0;

    // 3) Pour chaque instrument, récupérer un prix & insérer dans asset_prices
    for (const [instrumentId, symbol] of map.entries()) {
      console.log("=== Traitement instrument ===", instrumentId, symbol);

      let price = await fetchFinnhubPrice(symbol);
      console.log("Prix Finnhub pour", symbol, "=", price);

      if (!price) {
        const eodPrice = await fetchEodhdPrice(symbol);
        console.log("Prix EODHD pour", symbol, "=", eodPrice);
        price = eodPrice;
      }

      if (!price) {
        console.warn("Impossible de récupérer un prix pour", symbol);
        continue;
      }

      console.log("Prix final retenu pour", symbol, "=", price);

      const { error: insertError } = await supabase.from("asset_prices").insert({
        instrument_id: instrumentId,
        price,
        currency: "EUR", // adapte si besoin
        source: "finnhub_eod",
        fetched_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error("Erreur insert asset_prices", instrumentId, insertError);
        continue;
      }

      updated++;
    }

    console.log("Nombre d'instruments mis à jour =", updated);

    return new Response(JSON.stringify({ updated }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("refresh-prices error (global catch):", err);
    return new Response(
      JSON.stringify({ error: "refresh-prices failed" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
