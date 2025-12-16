import { supabase } from "./supabaseClient";

export async function fetchAiSummary({ kpis, holdings }) {
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-summary`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        // si l’utilisateur est connecté, on met son access_token
        Authorization: `Bearer ${
          session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY
        }`,
      },
      body: JSON.stringify({ kpis, holdings }),
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Erreur génération résumé IA");
  return json.text;
}
