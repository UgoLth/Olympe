import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY"
)!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---- Récup prix Finnhub ----
async function fetchFinnhubPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
        symbol
      )}&token=${FINNHUB_API_KEY}`
    );
    if (!res.ok) {
      console.error("Finnhub status", res.status);
      return null;
    }
    const quote = await res.json();
    const c = Number(quote.c);
    return c > 0 && !Number.isNaN(c) ? c : null;
  } catch (e) {
    console.error("Finnhub error", symbol, e);
    return null;
  }
}

// ---- Fallback EODHD (ta autre Edge Function) ----
async function fetchEodhdPrice(symbol: string): Promise<number | null> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/eodhd-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    if (!resp.ok) {
      console.error("EODHD status", resp.status);
      return null;
    }

    const data = await resp.json().catch(() => null);
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
    // 1) Récupérer les instruments qui ont au moins un holding > 0
    const { data, error } = await supabase
      .from("holdings")
      // ⚠️ on précise la relation à utiliser : holdings_instrument_id_fkey
      .select(
        "instrument_id, instruments!holdings_instrument_id_fkey(symbol)"
      )
      .gt("quantity", 0);

    if (error) {
      console.error("Supabase holdings error:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.log("Aucun holding > 0, rien à mettre à jour.");
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2) Dédupliquer par instrument_id
    const map = new Map<string, string>(); // instrument_id -> symbol
    for (const row of data as any[]) {
      const instrumentId = row.instrument_id;
      const symbol = row.instruments?.symbol;
      if (instrumentId && symbol) {
        map.set(instrumentId, symbol);
      }
    }

    console.log("Instruments à mettre à jour :", map.size);

    let updated = 0;

    // 3) Pour chaque instrument, récupérer un prix & insérer dans asset_prices
    for (const [instrumentId, symbol] of map.entries()) {
      let price = await fetchFinnhubPrice(symbol);
      if (!price) {
        price = await fetchEodhdPrice(symbol);
      }
      if (!price) {
        console.warn("Impossible de récupérer un prix pour", symbol);
        continue;
      }

      const { error: insertError } = await supabase
        .from("asset_prices")
        .insert({
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
