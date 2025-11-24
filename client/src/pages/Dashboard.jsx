import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  PieChart,
  Wallet,
  GraduationCap,
  Settings,
  LogOut,
  Home,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function Dashboard() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");

  // ✅ Vérifie qu'il y a bien un utilisateur connecté
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate("/");
      } else {
        setUserEmail(data.user.email);
      }
    };
    checkUser();
  }, [navigate]);

  // ✅ Gestion du "Se souvenir de moi"
  useEffect(() => {
    const handleBeforeUnload = async () => {
      const remember = localStorage.getItem("olympe_remember_me");
      if (!remember) {
        // l'utilisateur n'a PAS coché "Se souvenir de moi" → on détruit la session
        await supabase.auth.signOut();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("olympe_remember_me");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0F1013] text-white flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-white/5">
          <div className="w-10 h-10 rounded-full border border-[#D4AF37] flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-[#D4AF37]/70" />
          </div>
          <div>
            <p className="text-sm tracking-[0.25em] text-[#D4AF37] uppercase">
              OLYMPE
            </p>
            <p className="text-xs text-white/50 -mt-1">
              {userEmail || "Finance dashboard"}
            </p>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          <SidebarItem icon={Home} label="Tableau de bord" active />
          <SidebarItem icon={Wallet} label="Comptes & placements" />
          <SidebarItem icon={BarChart3} label="Performances" />
          <SidebarItem icon={PieChart} label="Répartition" />
          <SidebarItem icon={GraduationCap} label="Glossaire" />
        </nav>

        {/* Bottom */}
        <div className="mt-auto px-4 pb-4 space-y-2">
          <button className="w-full flex items-center gap-2 text-sm text-white/70 hover:text-white transition">
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

      {/* MAIN */}
      <main className="flex-1 flex flex-col">
        {/* TOPBAR */}
        <header className="h-16 bg-white flex items-center justify-between px-6 border-b border-gray-200">
          <div>
            <p className="text-sm text-gray-500">Dimanche 2 novembre 2025</p>
            <h1 className="text-xl font-semibold text-gray-900">
              Bonjour {userEmail ? userEmail.split("@")[0] : "Ugo"} 👋
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 rounded-lg border border-[#D4AF37]/40 text-[#D4AF37] text-sm hover:bg-[#D4AF37]/10 transition">
              Ajouter un compte
            </button>
            <img
              src="https://ui-avatars.com/api/?name=U+L&background=0F1013&color=fff"
              alt="Avatar utilisateur"
              className="w-9 h-9 rounded-full"
            />
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KpiCard
              title="Patrimoine total"
              value="32 540 €"
              badge="+3,2% cette semaine"
            />
            <KpiCard
              title="Performance mensuelle"
              value="+4,5 %"
              subtitle="par rapport à octobre"
            />
            <KpiCard
              title="Comptes renseignés"
              value="7"
              subtitle="PEA, Livret, Crypto..."
            />
          </div>

          {/* MAIN GRIDS */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Courbe d'évolution */}
            <div className="xl:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">
                  Évolution du portefeuille
                </h2>
                <div className="flex gap-2">
                  {["7j", "1m", "3m", "1an"].map((label) => (
                    <button
                      key={label}
                      className={`px-3 py-1 rounded-full text-xs ${
                        label === "1m"
                          ? "bg-[#D4AF37] text-white"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-56 rounded-xl bg-gradient-to-br from-[#F9F5EB] via-white to-white border border-dashed border-[#D4AF37]/30 flex items-center justify-center text-sm text-gray-400">
                Graphique (Chart.js) ici
              </div>
            </div>

            {/* Répartition */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-900 mb-4">
                Répartition des actifs
              </h2>
              <div className="flex gap-4 items-center">
                <div className="w-28 h-28 rounded-full bg-[conic-gradient(#D4AF37_0deg,#D4AF37_120deg,#F5F5F5_120deg,#F5F5F5_210deg,#1E1E1E_210deg,#1E1E1E_360deg)]" />
                <div className="space-y-2 text-sm">
                  <Legend color="#D4AF37" label="Épargne" value="38%" />
                  <Legend color="#1E1E1E" label="Investissements" value="27%" />
                  <Legend color="#F5F5F5" label="Liquidités" value="35%" />
                </div>
              </div>
            </div>
          </div>

          {/* BAS : tableau + pédagogie */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Tableau comptes */}
            <div className="xl:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Vos comptes</h2>
                <button className="text-xs text-[#D4AF37]">Tout voir →</button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs border-b">
                    <th className="py-2">Nom</th>
                    <th className="py-2">Type</th>
                    <th className="py-2">Solde</th>
                    <th className="py-2">Variation</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      name: "PEA Boursorama",
                      type: "Investissement",
                      solde: "12 430 €",
                      var: "+2,1%",
                    },
                    {
                      name: "Livret Jeune",
                      type: "Épargne",
                      solde: "2 100 €",
                      var: "+0,2%",
                    },
                    {
                      name: "Compte-titres",
                      type: "Investissement",
                      solde: "8 900 €",
                      var: "-0,4%",
                    },
                    {
                      name: "Crypto (Binance)",
                      type: "Crypto",
                      solde: "1 900 €",
                      var: "+6,8%",
                    },
                  ].map((cpt) => (
                    <tr key={cpt.name} className="border-b last:border-none">
                      <td className="py-2">{cpt.name}</td>
                      <td className="py-2 text-gray-500">{cpt.type}</td>
                      <td className="py-2 font-medium">{cpt.solde}</td>
                      <td
                        className={`py-2 ${
                          cpt.var.startsWith("-")
                            ? "text-red-500"
                            : "text-emerald-500"
                        }`}
                      >
                        {cpt.var}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bloc pédagogique */}
            <div className="bg-gradient-to-b from-[#0F1013] to-black rounded-2xl p-5 text-white shadow-sm">
              <h2 className="font-semibold mb-2 flex items-center gap-2">
                <GraduationCap size={18} className="text-[#D4AF37]" />
                Comprendre vos indicateurs
              </h2>
              <p className="text-sm text-white/70 mb-4">
                Olympe vous explique chaque notion financière de manière simple.
              </p>
              <div className="space-y-3">
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-white/50">Rendement</p>
                  <p className="text-sm">
                    C’est le pourcentage de gain ou perte sur une période.
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <p className="text-xs text-white/50">Diversification</p>
                  <p className="text-sm">
                    Plus vos comptes sont variés, moins vous prenez de risque.
                  </p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 border border-[#D4AF37]/40">
                  <p className="text-xs text-white/50">Astuce</p>
                  <p className="text-sm">
                    Ajoutez vos comptes manuellement pour un suivi complet.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// Composants internes
function SidebarItem({ icon: Icon, label, active }) {
  return (
    <button
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
        active
          ? "bg-white/5 text-white"
          : "text-white/60 hover:bg-white/5 hover:text-white"
      } transition`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function KpiCard({ title, value, subtitle, badge }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <p className="text-xs uppercase tracking-wide text-gray-400">{title}</p>
      <div className="flex items-end justify-between mt-3">
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
        {badge && (
          <span className="text-[10px] bg-[#F7EFE0] text-[#AD8B2F] px-3 py-1 rounded-full">
            {badge}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Legend({ color, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-full" style={{ background: color }} />
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm ml-auto font-medium text-gray-900">
        {value}
      </span>
    </div>
  );
}
