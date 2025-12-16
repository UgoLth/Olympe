// supabase/functions/ai-summary/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * OLYMPE — AI Summary (Mistral)
 *
 * Objectif:
 * - Produire un résumé pédagogique, neutre, descriptif (sans recommandation d'achat/vente).
 * - Prendre en compte un maximum de contexte venant de tes pages:
 *   - Analyse (KPI perf + profil de risque: volatilité, max drawdown, diversification, liquidité, horizon)
 *   - Simulation (rendement moyen pondéré, objectifs global/compte/ligne)
 *   - Portfolio (totalValue, daily/monthly change, allocations, holdings + poids, etc.)
 *   - Dashboard (totalValue, daily/30j, comptes, objectifs, mouvements)
 *
 * Payload attendu (souple, non bloquant si certains champs manquent):
 * {
 *   context?: {
 *     app?: { name?: string, version?: string },
 *     asOf?: string, // date ISO
 *   },
 *   // Compat: anciens champs
 *   kpis?: any,
 *   holdings?: any[],
 *
 *   // Nouveaux champs (recommandés)
 *   analyse?: {
 *     kpis?: any,
 *     riskProfile?: {
 *       volatility?: number,
 *       maxDrawdown?: number,
 *       diversification?: { maxWeightPct?: number },
 *       liquidity?: { cashPct?: number },
 *       horizon?: { investmentPct?: number }
 *     },
 *     performance?: any,
 *   },
 *   portfolio?: {
 *     summary?: any,
 *     allocations?: any[],
 *     holdings?: any[],
 *   },
 *   dashboard?: {
 *     summary?: any,
 *     accountsPreview?: any[],
 *     goals?: any[],
 *     movements?: any[],
 *   },
 *   simulation?: {
 *     weightedReturnPct?: number,
 *     objectives?: any[],
 *   }
 * }
 */

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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Limite la taille d'un JSON stringifié pour éviter des prompts trop gros.
 * On tronque en gardant la structure "texte" (safe) si c'est énorme.
 */
function safeStringify(value: unknown, maxChars: number) {
  try {
    const s = JSON.stringify(value);
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + `…(truncated, ${s.length} chars total)`;
  } catch {
    return `"non sérialisable"`;
  }
}

/**
 * Détection simple de recommandations explicites.
 * (Filtre volontairement "soft" pour éviter trop de faux positifs)
 */
function containsForbiddenAdvice(text: string) {
  const forbidden =
    /\b(ach[eè]te|vends|je te conseille|tu devrais|je recommande|recommand(e|ation)|ordre d'achat|ordre de vente|buy|sell)\b/i;
  return forbidden.test(text);
}

/**
 * Force la sortie à 5 lignes EXACTES au format demandé.
 * Si le modèle renvoie plus/moins, on normalise.
 */
function normalizeToFiveLines(text: string) {
  const lines = (text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Si déjà au bon format (5 lignes commençant par "- Ligne X:")
  const looksOk =
    lines.length === 5 &&
    lines[0].startsWith("- Ligne 1:") &&
    lines[1].startsWith("- Ligne 2:") &&
    lines[2].startsWith("- Ligne 3:") &&
    lines[3].startsWith("- Ligne 4:") &&
    lines[4].startsWith("- Ligne 5:");

  if (looksOk) return lines.join("\n");

  // Sinon, on reconstruit "au mieux" (safe)
  const pick = (i: number, fallback: string) => {
    const line = lines[i];
    if (!line) return fallback;
    const cleaned = line.replace(/^[-•\u2022]\s*/, "");
    return fallback.replace("non disponible", cleaned || "non disponible");
  };

  const normalized = [
    pick(0, "- Ligne 1: Performance: non disponible"),
    pick(1, "- Ligne 2: Valeur totale: non disponible"),
    pick(2, "- Ligne 3: Concentration/Diversification: non disponible"),
    pick(
      3,
      "- Ligne 4: Notion 1 (volatilité ou drawdown): non disponible"
    ),
    pick(
      4,
      "- Ligne 5: Notion 2 (diversification ou rendement): non disponible"
    ),
  ];

  // Force les préfixes exacts attendus.
  const forced = [
    normalized[0].startsWith("- Ligne 1:")
      ? normalized[0]
      : "- Ligne 1: Performance: non disponible",
    normalized[1].startsWith("- Ligne 2:")
      ? normalized[1]
      : "- Ligne 2: Valeur totale: non disponible",
    normalized[2].startsWith("- Ligne 3:")
      ? normalized[2]
      : "- Ligne 3: Concentration/Diversification: non disponible",
    normalized[3].startsWith("- Ligne 4:")
      ? normalized[3]
      : "- Ligne 4: Notion 1 (volatilité ou drawdown): non disponible",
    normalized[4].startsWith("- Ligne 5:")
      ? normalized[4]
      : "- Ligne 5: Notion 2 (diversification ou rendement): non disponible",
  ];

  // Sécurise: exactement 5 lignes
  return forced.slice(0, 5).join("\n");
}

Deno.serve(async (req) => {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 🔑 Clé Mistral stockée dans Supabase secrets
    const apiKey = Deno.env.get("MISTRAL_API_KEY");
    if (!apiKey) {
      return jsonResponse(
        { error: "MISTRAL_API_KEY manquante (Supabase secrets)." },
        500
      );
    }

    // Lecture payload (souple)
    const body = await req.json().catch(() => ({}));
    const payload = isObject(body) ? body : {};

    // Compat ancienne API:
    const kpisLegacy = payload["kpis"];
    const holdingsLegacy = payload["holdings"];

    const context = (payload["context"] ?? {}) as Record<string, unknown>;
    const analyse = (payload["analyse"] ?? {}) as Record<string, unknown>;
    const portfolio = (payload["portfolio"] ?? {}) as Record<string, unknown>;
    const dashboard = (payload["dashboard"] ?? {}) as Record<string, unknown>;
    const simulation = (payload["simulation"] ?? {}) as Record<string, unknown>;

    // Super contexte (limité en taille)
    const merged = {
      context,
      // legacy
      kpis: kpisLegacy ?? null,
      holdings: Array.isArray(holdingsLegacy) ? holdingsLegacy : null,
      // pages
      analyse,
      portfolio,
      dashboard,
      simulation,
      // meta utile
      receivedAt: new Date().toISOString(),
    };

    const compactJson = safeStringify(merged, 45000);

    // 🧠 Prompt "safe" : descriptif et pédagogique, pas de recommandations
    const prompt = `
Tu es l'assistant IA de l'application OLYMPE.
Tu es un assistant pédagogique en finances personnelles.

RÈGLES STRICTES (OBLIGATOIRES) :
- Interdiction absolue de recommander d’acheter, vendre, arbitrer, ou de donner une action à faire.
- Aucun conseil financier personnalisé (même implicite).
- Tu restes factuel, neutre, descriptif et éducatif.
- Ne pas utiliser : "tu devrais", "je te conseille", "pense à", "alloue", "investis", "prends position", "short", "long".
- Ne pas inventer de chiffres. Si une info manque, écrire "non disponible".
- Si des données semblent incohérentes (ex: valeur négative), le signaler brièvement sans dramatiser.

DONNÉES (JSON compacté) :
${compactJson}

TÂCHE :
Écris un résumé en français (5 lignes EXACTES), simple et clair, basé sur ces données.

FORMAT À RESPECTER EXACTEMENT (une ligne par point) :
- Ligne 1: Performance: ...
- Ligne 2: Valeur totale: ...
- Ligne 3: Concentration/Diversification: ...
- Ligne 4: Notion 1 (volatilité ou drawdown): ...
- Ligne 5: Notion 2 (diversification ou rendement): ...

AIDE À L'INTERPRÉTATION (sans conseil) :
- Performance: peux citer une perf jour/30j/YTD si dispo, sinon "non disponible".
- Valeur totale: total portefeuille si dispo.
- Concentration/Diversification: ex: poids max d'une ligne / nb lignes / indication de concentration si dispo.
- Notion 1: expliquer volatilité OU drawdown avec la valeur si dispo.
- Notion 2: expliquer diversification OU rendement (ex: CAGR/expected_return/weightedReturnPct) si dispo.
`;

    // Appel API Mistral
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-small-latest",
        messages: [
          {
            role: "system",
            content:
              "Assistant pédagogique OLYMPE. Réponses neutres. Aucun conseil financier. Respect strict du format demandé.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 280,
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "Mistral error");
      return jsonResponse(
        {
          error: "Erreur appel Mistral",
          details: errText,
        },
        500
      );
    }

    const data = await r.json().catch(() => ({}));
    const rawText: string = data?.choices?.[0]?.message?.content ?? "";

    // Filtre anti-dérapage (conseils explicites)
    let safeText = rawText;
    if (containsForbiddenAdvice(rawText)) {
      safeText = [
        "- Ligne 1: Performance: non disponible",
        "- Ligne 2: Valeur totale: non disponible",
        "- Ligne 3: Concentration/Diversification: non disponible",
        "- Ligne 4: Notion 1 (volatilité ou drawdown): Je ne peux pas faire de recommandations d’achat/vente, uniquement expliquer les indicateurs.",
        "- Ligne 5: Notion 2 (diversification ou rendement): Je peux décrire volatilité, drawdown, diversification et rendement à partir de tes données.",
      ].join("\n");
    }

    // Normalisation stricte (5 lignes exactes)
    safeText = normalizeToFiveLines(safeText);

    return jsonResponse({ text: safeText });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
