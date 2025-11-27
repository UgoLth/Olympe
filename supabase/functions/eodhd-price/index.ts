// supabase/functions/eodhd-price/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Normalise un symbole reçu côté client (souvent au format Yahoo / Finnhub)
 * vers un suffixe compris par EODHD.
 *
 * Exemple :
 *  - EUNL.DE  -> EUNL.XETRA
 *  - VUSA.L   -> VUSA.LSE
 *  - IWDA.AS  -> IWDA.AS (inchangé, déjà bon)
 */
function normalizeSymbol(symbol: string): string {
  if (!symbol || !symbol.includes(".")) return symbol;

  const [base, market] = symbol.split(".");
  const m = market.toUpperCase();

  const mapping: Record<string, string> = {
    PA: "PA",      // Paris (Euronext Paris)
    AS: "AS",      // Amsterdam (Euronext Amsterdam)
    BR: "BR",      // Bruxelles
    DE: "XETRA",   // Allemagne XETRA
    F: "FRA",      // Francfort
    L: "LSE",      // Londres
    MI: "MI",      // Milan
    SW: "SW",      // Suisse
    IR: "ISE",     // Irlande (à adapter si besoin)
  };

  const mapped = mapping[m];
  if (!mapped) {
    // Suffixe inconnu -> on renvoie tel quel
    console.log("normalizeSymbol: suffixe non géré, on garde le symbole brut :", symbol);
    return symbol;
  }

  const normalized = `${base}.${mapped}`;
  console.log(`normalizeSymbol: ${symbol} -> ${normalized}`);
  return normalized;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const symbol = body?.symbol as string | undefined;

    if (!symbol) {
      console.log("eodhd-price: symbol manquant dans le body", body);
      return new Response(
        JSON.stringify({ price: null, error: "Missing 'symbol' in body" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const API_KEY = Deno.env.get("EODHD_API_KEY");
    if (!API_KEY) {
      console.error("eodhd-price: EODHD_API_KEY non défini dans les secrets");
      return new Response(
        JSON.stringify({
          price: null,
          error: "EODHD_API_KEY not set in Supabase secrets",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // 🔁 Normalisation du symbole avant l'appel
    const normalizedSymbol = normalizeSymbol(symbol);

    const url = `https://eodhd.com/api/real-time/${encodeURIComponent(
      normalizedSymbol
    )}?api_token=${API_KEY}&fmt=json`;

    console.log("eodhd-price: appel EODHD", url);

    const resp = await fetch(url);
    const text = await resp.text();
    console.log("eodhd-price: réponse brute", resp.status, text);

    if (!resp.ok) {
      return new Response(
        JSON.stringify({
          price: null,
          error: `Upstream EODHD error ${resp.status}`,
          raw: text,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const json = JSON.parse(text);

    const rawPrice =
      json.close ??
      json.c ??
      json.last ??
      json.last_close ??
      json.previousClose ??
      json.price ??
      null;

    return new Response(
      JSON.stringify({ price: rawPrice, raw: json }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (e) {
    console.error("eodhd-price: exception", e);
    return new Response(
      JSON.stringify({ price: null, error: String(e) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  }
});
