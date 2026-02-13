// supabase/functions/get-price/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ✅ CORS (obligatoire pour appels depuis le front)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY") || "";
const EODHD_API_KEY = Deno.env.get("EODHD_API_KEY") || "";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function tryFinnhub(symbol: string): Promise<number | null> {
  if (!FINNHUB_API_KEY) return null;
  // Finnhub quote: https://finnhub.io/docs/api/quote
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
    symbol
  )}&token=${FINNHUB_API_KEY}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const price = Number(j?.c); // current price
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function tryEodhd(symbol: string): Promise<number | null> {
  if (!EODHD_API_KEY) return null;
  // EODHD real-time quote (ex: ESE.PA)
  const url = `https://eodhd.com/api/real-time/${encodeURIComponent(
    symbol
  )}?api_token=${EODHD_API_KEY}&fmt=json`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = await r.json();
  const price = Number(j?.close ?? j?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function tryYahoo(symbol: string): Promise<number | null> {
  // Yahoo unofficial quote endpoint
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    symbol
  )}`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0", // évite certains blocages
      Accept: "application/json",
    },
  });
  if (!r.ok) return null;
  const j = await r.json();
  const price = Number(j?.quoteResponse?.result?.[0]?.regularMarketPrice);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function todayKeyUTC() {
  // YYYY-MM-DD
  return new Date().toISOString().slice(0, 10);
}

serve(async (req) => {
  try {
    // ✅ Répond au preflight CORS
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") return json({ error: "Use POST" }, 405);

    const { instrument_id, symbol } = await req.json().catch(() => ({}));

    if (!instrument_id || !symbol) {
      return json({ error: "Missing instrument_id or symbol" }, 400);
    }

    // 1) Finnhub
    let price = await tryFinnhub(symbol);
    let source = price ? "finnhub" : "";

    // 2) EODHD
    if (!price) {
      price = await tryEodhd(symbol);
      source = price ? "eodhd" : "";
    }

    // 3) Yahoo
    if (!price) {
      price = await tryYahoo(symbol);
      source = price ? "yahoo" : "";
    }

    if (!price) {
      return json({ error: "Unable to fetch price from any source" }, 502);
    }

    // ✅ Enregistrer dans asset_prices (comme tes scripts)
    const { error: ins1 } = await sb.from("asset_prices").insert({
      instrument_id,
      price,
      source,
      fetched_at: new Date().toISOString(),
    });

    if (ins1) {
      console.error("asset_prices insert error:", ins1);
      // on continue quand même pour daily si tu veux, mais tu peux aussi return 500
    }

    // ✅ Daily upsert (si tu utilises asset_prices_daily)
    const { error: ins2 } = await sb.from("asset_prices_daily").upsert(
      {
        instrument_id,
        day: todayKeyUTC(),
        price,
        source,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "instrument_id,day" }
    );

    if (ins2) {
      console.error("asset_prices_daily upsert error:", ins2);
      // idem: on ne bloque pas la réponse prix, mais à toi de voir
    }

    return json({ instrument_id, symbol, price, source });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
