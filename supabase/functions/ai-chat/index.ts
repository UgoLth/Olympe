// supabase/functions/ai-chat/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function normalizeStr(s: string) {
  return (s || "").toLowerCase().trim();
}

// Détecte “variation / perf / hausse / baisse / semaine / 7 jours…”
function looksLikePerfQuestion(q: string) {
  const s = normalizeStr(q);
  return (
    /(variation|perf|performance|rendement|hausse|baisse|taux)/.test(s) &&
    /(semaine|7\s*jours|7j|hebdo)/.test(s)
  );
}

// Détecte demande “définition”
function looksLikeDefinitionQuestion(q: string) {
  const s = normalizeStr(q);
  return /(définition|def|c['’]est quoi|ça veut dire|signifie)/.test(s);
}

// Essaie d’extraire un “terme” après “définition de …”
function extractDefinitionTerm(q: string) {
  const s = q.trim();
  const m = s.match(/(?:définition\s+de|definition\s+de|c['’]est quoi|ça veut dire)\s*:?(.+)$/i);
  return (m?.[1] || s).trim();
}

// petit helper pour % arrondi
function roundPct(x: number, decimals = 2) {
  const f = Math.pow(10, decimals);
  return Math.round(x * f) / f;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const body = await req.json().catch(() => ({}));
    const question = (body?.question || "").toString().trim();
    const context = body?.context || {};

    if (!question) return jsonResponse({ text: "Question non disponible." }, 200);

    // Supabase admin client (bypass RLS côté Edge)
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return jsonResponse({ error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant." }, 500);
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) PERF / VARIATION HEBDO (calcul DB)
    if (looksLikePerfQuestion(question)) {
      // 🔎 Trouver l’instrument visé
      // Priorité: instrument_id envoyé par le front (id direct)
      let instrumentId = context?.instrument_id || null;

      // Sinon: on tente un match texte dans instruments
      if (!instrumentId) {
        const q = normalizeStr(question);
        // On prend quelques mots utiles (tu peux améliorer)
        // Ici on recherche large sur name/ticker/isin
        const { data: inst, error: instErr } = await supabase
          .from("instruments")
          .select("id, name, ticker, isin")
          .or(`name.ilike.%${q}%,ticker.ilike.%${q}%,isin.ilike.%${q}%`)
          .limit(1);

        if (instErr) console.error(instErr);
        instrumentId = inst?.[0]?.id || null;
      }

      if (!instrumentId) {
        return jsonResponse({
          text:
            "Je ne retrouve pas l’actif exact. Pour répondre, j’ai besoin du nom/ticker/ISIN précis (ou que tu cliques sur l’actif dans l’app).",
        });
      }

      // 📈 Récupérer le dernier prix
      const { data: lastRows, error: lastErr } = await supabase
        .from("asset_prices")
        .select("price, fetched_at")
        .eq("instrument_id", instrumentId)
        .order("fetched_at", { ascending: false })
        .limit(1);

      if (lastErr) throw lastErr;
      const last = lastRows?.[0];
      if (!last?.price) {
        return jsonResponse({ text: "Prix actuel non disponible pour cet actif." });
      }

      // 📆 Prix “7 jours avant” (le plus proche après now-7j)
      const now = new Date(last.fetched_at || new Date().toISOString());
      const from = new Date(now);
      from.setDate(from.getDate() - 7);

      const { data: oldRows, error: oldErr } = await supabase
        .from("asset_prices")
        .select("price, fetched_at")
        .eq("instrument_id", instrumentId)
        .gte("fetched_at", from.toISOString())
        .order("fetched_at", { ascending: true })
        .limit(1);

      if (oldErr) throw oldErr;
      const old = oldRows?.[0];

      if (!old?.price) {
        return jsonResponse({
          text:
            "Je n’ai pas assez d’historique sur les 7 derniers jours pour calculer la variation (prix de référence non disponible).",
        });
      }

      const pNow = Number(last.price);
      const pOld = Number(old.price);
      if (!pNow || !pOld || pOld <= 0) {
        return jsonResponse({ text: "Impossible de calculer la variation (prix invalides)." });
      }

      const pct = roundPct(((pNow - pOld) / pOld) * 100, 2);

      return jsonResponse({
        text: `Sur les 7 derniers jours, la variation est d’environ ${pct > 0 ? "+" : ""}${pct} % (calculée à partir des prix enregistrés dans l’app).`,
        meta: {
          instrument_id: instrumentId,
          price_now: pNow,
          price_ref_7d: pOld,
          fetched_at_now: last.fetched_at,
          fetched_at_ref: old.fetched_at,
        },
      });
    }

    // 2) DEFINITIONS (glossaire)
    if (looksLikeDefinitionQuestion(question)) {
      const term = extractDefinitionTerm(question);

      const { data: rows, error } = await supabase
        .from("glossary_terms")
        .select("term, definition, category, tags")
        .ilike("term", term) // match exact-ish (sinon tu peux faire un ilike %term%)
        .limit(1);

      if (error) console.error(error);

      const row = rows?.[0];
      if (row?.definition) {
        return jsonResponse({
          text: `**${row.term}** — ${row.definition}${row.category ? `\n\nCatégorie: ${row.category}` : ""}`,
        });
      }

      return jsonResponse({
        text:
          "Je n’ai pas trouvé ce terme dans le glossaire. Si tu veux, donne-moi le terme exact (ou je peux te proposer une définition générale).",
      });
    }

    // 3) FALLBACK Mistral (explications générales)
    const apiKey = Deno.env.get("MISTRAL_API_KEY");
    if (!apiKey) {
      return jsonResponse({ text: "MISTRAL_API_KEY manquante, je ne peux pas répondre pour le moment." }, 500);
    }

    const prompt = `
Tu es l'assistant IA de l'application OLYMPE. Tu es pédagogique, neutre, et tu ne donnes aucun conseil d'achat/vente.

RÈGLES:
- Pas de recommandation d’achat/vente.
- Pas de “tu devrais”.
- Si la question demande une valeur chiffrée qui dépend des prix et qu’elle n’est pas fournie, tu dis “non disponible” et tu expliques ce qu’il manque.

Question utilisateur:
${question}

Contexte (si utile):
${JSON.stringify(context).slice(0, 20000)}
`;

    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: "Assistant pédagogique. Réponses neutres. Aucun conseil financier." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 280,
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "Mistral error");
      return jsonResponse({ error: "Erreur appel Mistral", details: errText }, 500);
    }

    const data = await r.json().catch(() => ({}));
    const text: string = data?.choices?.[0]?.message?.content ?? "Réponse non disponible.";
    return jsonResponse({ text });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
