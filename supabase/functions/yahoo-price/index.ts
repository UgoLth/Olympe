import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req: Request) => {
  try {
    const body = await req.json().catch(() => null) as { symbol?: string } | null;
    const symbol = body?.symbol?.trim();

    if (!symbol) {
      return new Response(JSON.stringify({ error: "Missing symbol" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url =
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
        symbol,
      )}`;

    // Appel Yahoo avec un User-Agent "navigateur"
    const yahooRes = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OlympeBot/1.0; +https://olympe.local)",
        "Accept": "application/json, text/plain, */*",
      },
    });

    const text = await yahooRes.text();
    let yahooJson: any = null;

    try {
      yahooJson = JSON.parse(text);
    } catch (_err) {
      console.error("Yahoo JSON parse error, raw text:", text);
    }

    if (!yahooRes.ok) {
      console.error("Yahoo HTTP error:", yahooRes.status, text);
      // On NE renvoie PAS 502 ici, juste un objet avec error et price null
      return new Response(
        JSON.stringify({
          symbol,
          price: null,
          currency: null,
          error: "YAHOO_HTTP_ERROR",
          status: yahooRes.status,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const quote = yahooJson?.quoteResponse?.result?.[0];

    const price =
      typeof quote?.regularMarketPrice === "number"
        ? quote.regularMarketPrice
        : null;
    const currency = quote?.currency ?? null;

    return new Response(
      JSON.stringify({
        symbol,
        price,
        currency,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Edge yahoo-price error:", err);
    return new Response(
      JSON.stringify({
        error: "Internal error",
        price: null,
        currency: null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
