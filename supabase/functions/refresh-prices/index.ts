import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------- HELPERS PRIX ---------- //

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

    if (!resp.ok) return null;

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

// ---------- EDGE FUNCTION ---------- //

console.log("refresh-prices: VERSION_LIVE_1");

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    // 1) Récupérer les holdings (>0) avec instrument_id + symbol
    const { data: holdings, error: holdError } = await supabase
      .from("holdings")
      .select(
        `
        id,
        quantity,
        instrument_id,
        instrument:instruments!holdings_instrument_id_fkey (
          symbol
        )
      `
      )
      .gt("quantity", 0);

    if (holdError) {
      console.error("Supabase holdings error:", holdError);
      throw holdError;
    }

    console.log("Holdings bruts =", holdings);

    if (!holdings || holdings.length === 0) {
      console.log("Aucun holding > 0, rien à mettre à jour.");
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    type HoldingRow = {
      id: string;
      quantity: number;
      instrument_id: string;
      instrument?: { symbol?: string | null } | null;
    };

    // 2) Regrouper par instrument_id pour ne faire qu'un appel API par symbole
    const instrumentsMap = new Map<
      string,
      { symbol: string; holdings: HoldingRow[] }
    >();

    for (const row of holdings as HoldingRow[]) {
      const instrumentId = row.instrument_id;
      const symbol = row.instrument?.symbol ?? null;

      console.log(
        "Row holding ->",
        row.id,
        "instrumentId=",
        instrumentId,
        "symbol=",
        symbol
      );

      if (!instrumentId || !symbol) continue;

      const existing = instrumentsMap.get(instrumentId) ?? {
        symbol,
        holdings: [],
      };
      existing.holdings.push(row);
      instrumentsMap.set(instrumentId, existing);
    }

    console.log(
      "Instruments à mettre à jour (map.size) =",
      instrumentsMap.size
    );

    let updated = 0;

    // 3) Pour chaque instrument : récupérer le prix, historiser, mettre à jour holdings
    for (const [instrumentId, info] of instrumentsMap.entries()) {
      const { symbol, holdings } = info;

      console.log("=== Traitement instrument ===", instrumentId, "symbol=", symbol);

      let price: number | null = null;
      let source = "";

      // Essai Finnhub
      const finnhubPrice = await fetchFinnhubPrice(symbol);
      if (finnhubPrice) {
        price = finnhubPrice;
        source = "finnhub";
      }

      // Fallback EODHD si Finnhub n'a rien
      if (!price) {
        const eodPrice = await fetchEodhdPrice(symbol);
        if (eodPrice) {
          price = eodPrice;
          source = "eodhd";
        }
      }

      if (!price) {
        console.warn("Impossible de récupérer un prix pour", symbol);
        continue;
      }

      console.log("Prix final retenu pour", symbol, "=", price, "source=", source);

      // 3a) Historique dans asset_prices (on n'écrase rien, on ajoute une ligne)
      const { error: insertError } = await supabase
        .from("asset_prices")
        .insert({
          instrument_id: instrumentId,
          price,
          currency: "EUR", // adapte si besoin
          source: source || "refresh-prices",
          fetched_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error(
          "Erreur insert asset_prices",
          instrumentId,
          insertError
        );
        // on ne bloque pas les holdings, on continue
        continue;
      }

      // 3b) Mise à jour des holdings (current_price + current_value)
      for (const h of holdings) {
        const qty = Number(h.quantity ?? 0);
        const currentValue = qty * price;

        const { error: updError } = await supabase
          .from("holdings")
          .update({
            current_price: price,
            current_value: currentValue,
          })
          .eq("id", h.id);

        if (updError) {
          console.error(
            "Erreur update holding",
            h.id,
            "instrument",
            instrumentId,
            updError
          );
          continue;
        }

        updated++;
      }
    }

    console.log("Nombre de holdings mis à jour =", updated);

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
