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
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal, // 👈 ajout pour la page Simulation
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function Dashboard() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");

  // ---- FAUSSES DONNÉES POUR PRÉVISUALISATION ----
  const fakeTotalValue = 14750;
  const fakeDailyChange = +0.8;
  const fakeMonthlyChange = +3.2;

  const fakeInsights = [
    { text: "Apple Inc progresse de +2,3 % aujourd’hui", type: "good" },
    { text: "Spotify recule de –1,8 % cette semaine", type: "bad" },
    { text: "Votre exposition aux ETF est passée à 42 %", type: "neutral" },
  ];

  const fakeTasks = [
    "Compléter votre profil investisseur",
    "Ajouter une alerte sur votre ligne Apple",
    "Définir un objectif d’épargne pour 2025",
  ];

  const fakeGoals = [
    { title: "Épargne de précaution", current: 1800, target: 3000 },
    { title: "Objectif PEA 2025", current: 4500, target: 20000 },
  ];

  const fakeMovements = [
    {
      label: "Achat Tesla",
      date: "03/12",
      amount: -250,
    },
    {
      label: "Versement Livret A",
      date: "01/12",
      amount: +200,
    },
    {
      label: "Dividende Apple",
      date: "28/11",
      amount: +12,
    },
  ];

  const fakeAccounts = [
    { name: "Compte courant", value: 1250 },
    { name: "Livret A", value: 3100 },
    { name: "PEA", value: 10400 },
  ];

  // ---- AUTH ----
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("olympe_remember_me");
    navigate("/");
  };

  const formatCurrency = (n) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="h-screen bg-[#F5F5F5] flex overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0F1013] text-white flex flex-col">
        <div className="flex items-start flex-col justify-center px-6 h-16 border-b border-white/5">
          <p className="text-sm tracking-[0.25em] text-[#D4AF37] uppercase">
            OLYMPE
          </p>
          <p className="text-xs text-white/50 -mt-1">
            {userEmail || "Finance dashboard"}
          </p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          <SidebarItem icon={Home} label="Tableau de bord" active />
          <SidebarItem
            icon={Wallet}
            label="Comptes & placements"
            onClick={() => navigate("/accounts")}
          />
          <SidebarItem
            icon={BarChart3}
            label="Analyse"
            onClick={() => navigate("/analyse")}
          />
          <SidebarItem
            icon={PieChart}
            label="Portefeuille"
            onClick={() => navigate("/portefeuille")}
          />
          <SidebarItem
            icon={GraduationCap}
            label="Glossaire"
            onClick={() => navigate("/glossaire")}
          />
          {/* 👇 Nouveau menu Simulation */}
          <SidebarItem
            icon={SlidersHorizontal}
            label="Simulation"
            onClick={() => navigate("/simulation")}
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

      {/* MAIN */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER */}
        <header className="h-16 bg-white flex items-center justify-between px-6 border-b border-gray-200">
          <p className="text-sm text-gray-500">
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>

          <p className="text-sm text-gray-700">
            Valeur totale :{" "}
            <span className="font-semibold text-[#D4AF37]">
              {formatCurrency(fakeTotalValue)}
            </span>
          </p>
        </header>

        {/* CONTENT */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {/* 1️⃣ SECTION — Résumé du jour */}
          <section className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-1">
              Aujourd’hui pour vous
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Un résumé rapide de votre situation financière.
            </p>

            <div className="flex flex-wrap gap-4">
              <KpiCard
                label="Variation du jour"
                value={
                  fakeDailyChange > 0
                    ? `+${fakeDailyChange}%`
                    : `${fakeDailyChange}%`
                }
                positive={fakeDailyChange >= 0}
              />
              <KpiCard
                label="Sur 30 jours"
                value={
                  fakeMonthlyChange > 0
                    ? `+${fakeMonthlyChange}%`
                    : `${fakeMonthlyChange}%`
                }
                positive={fakeMonthlyChange >= 0}
              />
              <KpiCard
                label="Valeur totale"
                value={formatCurrency(fakeTotalValue)}
              />
            </div>
          </section>

          {/* 2️⃣ SECTION — À retenir aujourd’hui */}
          <section className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              À retenir aujourd’hui
            </h2>

            <div className="space-y-2">
              {fakeInsights.map((i, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200"
                >
                  {i.type === "good" && (
                    <ArrowUpRight className="text-emerald-600" size={16} />
                  )}
                  {i.type === "bad" && (
                    <ArrowDownRight className="text-red-500" size={16} />
                  )}
                  {i.type === "neutral" && (
                    <div className="h-2 w-2 rounded-full bg-gray-500"></div>
                  )}
                  <span>{i.text}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 3️⃣ SECTION — À faire */}
          <section className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              À faire
            </h2>

            <div className="space-y-2">
              {fakeTasks.map((t, i) => (
                <div
                  key={i}
                  className="text-sm bg-gray-50 px-3 py-2 rounded-xl border border-gray-200"
                >
                  {t}
                </div>
              ))}
            </div>
          </section>

          {/* 4️⃣ SECTION — Objectifs */}
          <section className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              Objectifs financiers
            </h2>

            <div className="space-y-4">
              {fakeGoals.map((g, i) => {
                const pct = Math.round((g.current / g.target) * 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-700">{g.title}</span>
                      <span className="text-gray-900 font-medium">
                        {pct}% ({formatCurrency(g.current)})
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#D4AF37]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 5️⃣ SECTION — Derniers mouvements */}
          <section className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              Derniers mouvements
            </h2>

            <div className="space-y-2">
              {fakeMovements.map((m, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm"
                >
                  <div>
                    <p className="text-gray-800">{m.label}</p>
                    <p className="text-[11px] text-gray-500">{m.date}</p>
                  </div>
                  <p
                    className={`font-medium ${
                      m.amount > 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {m.amount > 0 ? "+" : ""}
                    {formatCurrency(m.amount)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* 6️⃣ SECTION — Comptes */}
          <section className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">
              Aperçu des comptes
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {fakeAccounts.map((a, i) => (
                <div
                  key={i}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4"
                >
                  <p className="text-[11px] text-gray-500">{a.name}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-1">
                    {formatCurrency(a.value)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/* Components */
function SidebarItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
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

function KpiCard({ label, value, positive }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex flex-col justify-between w-40">
      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>
      <p
        className={`text-base font-semibold ${
          positive === undefined
            ? "text-gray-900"
            : positive
            ? "text-emerald-600"
            : "text-red-500"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
