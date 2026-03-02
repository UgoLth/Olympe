
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  BarChart3,
  PieChart,
  Wallet,
  GraduationCap,
  Settings,
  LogOut,
  Home,
  SlidersHorizontal,
  Bot,
  Send,
  Trash2,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function AssistantIA() {
  const navigate = useNavigate();
  const location = useLocation();

  const [userEmail, setUserEmail] = useState("");

  
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState("");

  
  const [history, setHistory] = useState([]); 

  const activePath = location.pathname;

  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate("/");
        return;
      }
      setUserEmail(data.user.email || "");
    };
    init();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("olympe_remember_me");
    navigate("/");
  };

  const handleAskAi = async () => {
    try {
      const q = question.trim();
      if (!q) return;

      setLoadingAi(true);
      setAiError("");
      setAnswer("");

      const payload = {
        question: q,
        context: {
          app: { name: "Olympe", version: "0.1" },
          asOf: new Date().toISOString(),
          note: "Assistant éducatif. Aucun conseil financier.",
        },
      };

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: payload,
      });

      if (error) throw error;

      const text = data?.text || "";
      setAnswer(text);

      setHistory((prev) => [{ q, a: text, at: new Date().toISOString() }, ...prev].slice(0, 20));
    } catch (e) {
      console.error("AI chat error:", e);
      setAiError("Impossible de répondre pour le moment.");
      setAnswer("");
    } finally {
      setLoadingAi(false);
    }
  };

  const canSend = useMemo(() => !loadingAi && question.trim().length > 0, [loadingAi, question]);

  return (
    <div className="h-screen bg-[#F5F5F5] flex overflow-hidden">
      
      <aside className="w-64 bg-[#0F1013] text-white flex flex-col">
        <div className="flex items-start flex-col justify-center px-6 h-16 border-b border-white/5">
          <p className="text-sm tracking-[0.25em] text-[#D4AF37] uppercase">OLYMPE</p>
          <p className="text-xs text-white/50 -mt-1">{userEmail || "Finance dashboard"}</p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          <SidebarItem
            icon={Home}
            label="Tableau de bord"
            active={activePath === "/dashboard" || activePath === "/"}
            onClick={() => navigate("/dashboard")}
          />
          <SidebarItem
            icon={Wallet}
            label="Comptes & placements"
            active={activePath === "/accounts"}
            onClick={() => navigate("/accounts")}
          />
          <SidebarItem
            icon={BarChart3}
            label="Analyse"
            active={activePath === "/analyse"}
            onClick={() => navigate("/analyse")}
          />
          <SidebarItem
            icon={PieChart}
            label="Portefeuille"
            active={activePath === "/portefeuille"}
            onClick={() => navigate("/portefeuille")}
          />
          <SidebarItem
            icon={GraduationCap}
            label="Glossaire"
            active={activePath === "/glossaire"}
            onClick={() => navigate("/glossaire")}
          />
          <SidebarItem
            icon={SlidersHorizontal}
            label="Simulation"
            active={activePath === "/simulation"}
            onClick={() => navigate("/simulation")}
          />
          <SidebarItem
            icon={Bot}
            label="Assistant IA"
            active={activePath === "/assistant"}
            onClick={() => navigate("/assistant")}
          />
        </nav>

        <div className="mt-auto px-4 pb-4 space-y-2">
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-2 text-sm text-white/70 hover:text-white transition"
          >
            <Settings size={16} />
            Paramètres
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-sm text-white/70 hover:text-white transition"
          >
            <LogOut size={16} />
            Déconnexion
          </button>
          <p className="text-[10px] text-white/25 mt-2">v0.1 – Olympe</p>
        </div>
      </aside>

      
      <main className="flex-1 flex flex-col overflow-hidden">
        
        <header className="h-16 bg-white flex items-center justify-between px-6 border-b border-gray-200">
          <div>
            <p className="text-sm font-semibold text-gray-900">Assistant IA</p>
            <p className="text-xs text-gray-500">Définitions, explications, indicateurs — aucun conseil financier.</p>
          </div>

          <button
            onClick={() => {
              setQuestion("");
              setAnswer("");
              setAiError("");
              setHistory([]);
            }}
            className="text-xs px-3 py-2 rounded-full bg-gray-100 border border-gray-200 hover:bg-gray-200 transition inline-flex items-center gap-2"
          >
            <Trash2 size={16} />
            Réinitialiser
          </button>
        </header>

        
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-4">
            
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">Pose ta question</h2>
                  <p className="text-xs text-gray-500">
                    Exemples : “C’est quoi le drawdown ?”, “Explique la volatilité”, “À quoi sert un ETF ?”
                  </p>
                </div>

                <button
                  onClick={handleAskAi}
                  disabled={!canSend}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-[#0F1013] text-white text-xs font-semibold hover:bg-black disabled:opacity-60"
                >
                  <Send size={16} />
                  {loadingAi ? "Envoi…" : "Envoyer"}
                </button>
              </div>

              <div className="mt-3">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAskAi();
                  }}
                  placeholder='Ex: "C’est quoi le drawdown ?"'
                  className="w-full text-sm bg-white border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30"
                />
                <p className="mt-1 text-[11px] text-gray-400">Astuce : commence par “définition de …” ou “explique …”.</p>
              </div>

              {aiError && (
                <div className="mt-3 text-xs bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg">
                  {aiError}
                </div>
              )}

              
              <div className="mt-4">
                {loadingAi ? (
                  <div className="text-xs text-gray-500">
                    <div className="inline-block h-3 w-3 rounded-full border-2 border-gray-200 border-t-[#D4AF37] animate-spin mr-2" />
                    Réponse en cours…
                  </div>
                ) : answer ? (
                  <div className="text-sm whitespace-pre-wrap text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    {answer}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">Écris une question puis clique sur “Envoyer”.</p>
                )}
              </div>
            </div>

            
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800">Historique (local)</h3>
              <p className="text-xs text-gray-500 mb-3">Garde les 20 dernières réponses sur cette page.</p>

              {history.length === 0 ? (
                <p className="text-xs text-gray-400">Aucune question posée pour le moment.</p>
              ) : (
                <div className="space-y-3">
                  {history.map((h, idx) => (
                    <div key={`${h.at}-${idx}`} className="border border-gray-200 bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-500">{new Date(h.at).toLocaleString("fr-FR")}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-1">{h.q}</p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap mt-2">{h.a}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- UI Components ---------- */

function SidebarItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
        active ? "bg-white/5 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
      } transition`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
