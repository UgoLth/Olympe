// supabase/functions/backfill-yahoo-history/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "SUPABASE_SERVICE_ROLE_KEY"
)!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ----------- PARSING BODY MANUEL & ROBUSTE ----------- //
    const rawBody = await req.text();
    console.log("backfill-yahoo-history RAW BODY =", rawBody);

    let symbol: string | null = null;
    let instrumentId: string | null = null;

    // 1) Essai JSON classique : {"symbol":"ESE.PA"}
    try {
      if (rawBody) {
        const parsed = JSON.parse(rawBody) as {
          symbol?: string;
          instrumentId?: string;
        };

        if (parsed.symbol) symbol = parsed.symbol.trim();
        if (parsed.instrumentId) instrumentId = parsed.instrumentId.trim();
      }
    } catch (e) {
      console.error(
        "JSON.parse a échoué, on tente un fallback regex. Erreur:",
        e
      );
    }

    // 2) Fallback : format non JSON du style {symbol:ESE.PA}
    if (!symbol && rawBody) {
      const matchSymbol = rawBody.match(/symbol\s*:\s*"?([^"}\s]+)"?/);
      if (matchSymbol) {
        symbol = matchSymbol[1].trim();
      }

      const matchInstrument = rawBody.match(
        /instrumentId\s*:\s*"?([^"}\s]+)"?/
      );
      if (matchInstrument) {
        instrumentId = matchInstrument[1].trim();
      }
    }

    if (!symbol) {
      console.error(
        "Missing 'symbol' après parsing. rawBody =",
        rawBody
      );
      return new Response(
        JSON.stringify({
          error: "Missing 'symbol' in body",
          rawBody,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      "backfill-yahoo-history: start for symbol =",
      symbol,
      "instrumentId =",
      instrumentId
    );

    // ---------- 1) Récupérer / créer instrument ---------- //
    if (!instrumentId) {
      const { data: existing, error: instError } = await supabase
        .from("instruments")
        .select("id")
        .eq("symbol", symbol)
        .limit(1);

      if (instError) {
        console.error("Erreur lecture instruments:", instError);
        throw instError;
      }

      if (existing && existing.length > 0) {
        instrumentId = existing[0].id as string;
      } else {
        const { data: inserted, error: insertInstError } = await supabase
          .from("instruments")
          .insert({
            symbol,
            name: symbol,
            asset_class: null,
            currency: null,
            exchange: null,
          })
          .select("id")
          .single();

        if (insertInstError) {
          console.error("Erreur création instrument:", insertInstError);
          throw insertInstError;
        }

        instrumentId = inserted.id as string;
      }
    }

    if (!instrumentId) {
      return new Response(
        JSON.stringify({
          error: "Unable to resolve or create instrument for symbol",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      "backfill-yahoo-history: instrument_id résolu =",
      instrumentId
    );

    // ---------- 2) Dates déjà présentes pour éviter les doublons ---------- //
    const { data: existingPrices, error: existingPriceError } = await supabase
      .from("asset_prices")
      .select("fetched_at")
      .eq("instrument_id", instrumentId);

    if (existingPriceError) {
      console.error(
        "Erreur lecture asset_prices existants:",
        existingPriceError
      );
      throw existingPriceError;
    }

    const existingDates = new Set<string>();
    if (existingPrices) {
      for (const row of existingPrices as { fetched_at: string }[]) {
        const d = row.fetched_at?.slice(0, 10);
        if (d) existingDates.add(d);
      }
    }

    console.log(
      "backfill-yahoo-history: dates déjà présentes pour instrument =",
      existingDates.size
    );

    // ---------- 3) Appel Yahoo Finance (CSV historique daily) ---------- //
    const nowSec = Math.floor(Date.now() / 1000);
    const yahooUrl =
      "https://query1.finance.yahoo.com/v7/finance/download/" +
      encodeURIComponent(symbol) +
      `?period1=0&period2=${nowSec}&interval=1d&events=history&includeAdjustedClose=true`;

    console.log("Appel Yahoo CSV:", yahooUrl);

    const resp = await fetch(yahooUrl);
    const csvText = await resp.text();

    console.log("Yahoo status =", resp.status);

    if (!resp.ok) {
      console.error("Yahoo error body:", csvText);
      return new Response(
        JSON.stringify({
          error: "Yahoo Finance error",
          status: resp.status,
          body: csvText,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const lines = csvText.split("\n").map((l) => l.trim());
    if (lines.length <= 1) {
      return new Response(
        JSON.stringify({
          error: "No data in Yahoo CSV",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const header = lines[0];
    console.log("CSV header:", header);

    const rows = lines.slice(1).filter((l) => l.length > 0);

    type PriceRow = {
      instrument_id: string;
      price: number;
      currency: string | null;
      source: string;
      fetched_at: string;
    };

    const toInsert: PriceRow[] = [];

    for (const line of rows) {
      const cols = line.split(",");

      const dateStr = cols[0]; // YYYY-MM-DD
      const adjCloseStr = cols[5] ?? cols[4];

      if (!dateStr || !adjCloseStr || adjCloseStr === "null") continue;
      if (existingDates.has(dateStr)) continue;

      const price = Number(adjCloseStr);
      if (!price || Number.isNaN(price) || price <= 0) continue;

      const fetchedAt = new Date(dateStr + "T00:00:00.000Z").toISOString();

      toInsert.push({
        instrument_id: instrumentId,
        price,
        currency: null,
        source: "yahoo_backfill",
        fetched_at: fetchedAt,
      });
    }

    console.log(
      "Nombre de lignes historisées à insérer pour",
      symbol,
      "=",
      toInsert.length
    );

    if (toInsert.length === 0) {
      return new Response(
        JSON.stringify({
          inserted: 0,
          instrument_id: instrumentId,
          symbol,
          message: "No new dates to insert (already in DB or no data)",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const batchSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < toInsert.length; i += batchSize) {
      const chunk = toInsert.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from("asset_prices")
        .insert(chunk);

      if (insertError) {
        console.error("Erreur insert chunk asset_prices:", insertError);
        throw insertError;
      }

      insertedCount += chunk.length;
    }

    console.log(
      "backfill-yahoo-history: insertion terminée. insertedCount =",
      insertedCount
    );

    return new Response(
      JSON.stringify({
        inserted: insertedCount,
        instrument_id: instrumentId,
        symbol,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("backfill-yahoo-history: exception globale", err);
    return new Response(
      JSON.stringify({
        error: "backfill-yahoo-history failed",
        details: String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
