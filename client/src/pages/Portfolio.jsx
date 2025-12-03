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
import { motion } from "framer-motion";

// 🎨 Chart.js
import { Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function Portfolio() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");

  const [summary, setSummary] = useState({
    totalValue: 0,
    dailyChangePct: 0,
    monthlyChangePct: 0,
    nbAccounts: 0,
    nbHoldings: 0,
  });

  const [allocations, setAllocations] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);

  const toNumber = (v) =>
    v === null || v === undefined || v === "" ? 0 : Number(v);

  // Variants pour les KPI (stagger)
  const kpiVariants = {
    hidden: { opacity: 0, y: 10 },
    show: (i) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.05 * i, duration: 0.3, ease: "easeOut" },
    }),
  };

  // ---------- AUTH + INIT ----------
  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate("/");
        return;
      }
      setUserEmail(data.user.email || "");
      await loadPortfolio(data.user.id);
    };
    init();
  }, [navigate]);

  // Gestion du "Se souvenir de moi"
  useEffect(() => {
    const handleBeforeUnload = async () => {
      const remember = localStorage.getItem("olympe_remember_me");
      if (!remember) {
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

  // ---------- CATEGORISATION POUR LE CAMEMBERT ----------
  const categorizePosition = (accountType, assetClass) => {
    const norm = (s) => (s || "").toLowerCase();

    const t = norm(accountType);
    const a = norm(assetClass);

    // 1️⃣ d'abord selon le type de compte
    if (t.includes("cash") || t.includes("courant") || t.includes("current")) {
      return "Liquidités";
    }
    if (
      t.includes("epargne") ||
      t.includes("épargne") ||
      t.includes("livret") ||
      t.includes("savings")
    ) {
      return "Épargne";
    }
    if (
      t.includes("invest") ||
      t.includes("bourse") ||
      t.includes("ct") ||
      t.includes("pea") ||
      t.includes("broker")
    ) {
      return "Investissements";
    }

    // 2️⃣ fallback selon asset_class
    if (a.includes("crypto")) return "Crypto";
    if (a.includes("cash")) return "Liquidités";
    if (
      a.includes("equity") ||
      a.includes("stock") ||
      a.includes("etf") ||
      a.includes("fund")
    )
      return "Investissements";

    // 3️⃣ sinon
    return "Autres";
  };

  // ---------- LOAD PORTFOLIO ----------
  const loadPortfolio = async (userId) => {
    setLoading(true);
    try {
      // 1) comptes
      const { data: accounts, error: accError } = await supabase
        .from("accounts")
        .select("id, name, type, currency, current_amount, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (accError) throw accError;

      // 2) holdings
      const { data: holdingsData, error: holdError } = await supabase
        .from("holdings")
        .select(
          "id, account_id, instrument_id, quantity, current_price, current_value, asset_label"
        )
        .eq("user_id", userId);

      if (holdError) throw holdError;

      const accountsById = Object.fromEntries(
        (accounts || []).map((a) => [a.id, a])
      );

      // 3) instruments
      const instrumentIds = Array.from(
        new Set(
          (holdingsData || [])
            .map((h) => h.instrument_id)
            .filter((id) => !!id)
        )
      );

      let instrumentsById = {};
      if (instrumentIds.length > 0) {
        const { data: instruments, error: instError } = await supabase
          .from("instruments")
          .select("id, symbol, name, asset_class")
          .in("id", instrumentIds);

        if (instError) throw instError;

        instrumentsById = Object.fromEntries(
          (instruments || []).map((inst) => [inst.id, inst])
        );
      }

      // 4) prix historiques pour calculer les variations jour / 30 jours
      let prev1dByInstrument = {};
      let prev30dByInstrument = {};

      if (instrumentIds.length > 0) {
        const now = new Date();

        const date1d = new Date(now);
        date1d.setDate(now.getDate() - 1);
        const iso1d = date1d.toISOString();

        const date30d = new Date(now);
        date30d.setDate(now.getDate() - 30);
        const iso30d = date30d.toISOString();

        // Prix depuis D-1
        const { data: prices1d, error: p1Error } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", iso1d)
          .order("fetched_at", { ascending: true });

        if (p1Error) {
          console.error("Erreur récupération prix 1j :", p1Error);
        } else if (prices1d) {
          for (const p of prices1d) {
            const id = p.instrument_id;
            if (!prev1dByInstrument[id]) {
              prev1dByInstrument[id] = toNumber(p.price); // premier prix après D-1
            }
          }
        }

        // Prix depuis D-30
        const { data: prices30d, error: p30Error } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", iso30d)
          .order("fetched_at", { ascending: true });

        if (p30Error) {
          console.error("Erreur récupération prix 30j :", p30Error);
        } else if (prices30d) {
          for (const p of prices30d) {
            const id = p.instrument_id;
            if (!prev30dByInstrument[id]) {
              prev30dByInstrument[id] = toNumber(p.price); // premier prix après D-30
            }
          }
        }
      }

      // -------- LIGNES DE PORTEFEUILLE ----------
      let totalHoldingsValue = 0;

      const computedHoldings = (holdingsData || []).map((h) => {
        const instrument = instrumentsById[h.instrument_id] || {};
        const account = accountsById[h.account_id] || {};

        const quantity = toNumber(h.quantity);
        const currentPrice = toNumber(h.current_price);

        const value =
          h.current_value !== null && h.current_value !== undefined
            ? toNumber(h.current_value)
            : quantity * currentPrice;

        totalHoldingsValue += value;

        const prev1d = prev1dByInstrument[h.instrument_id] || 0;
        const prev30d = prev30dByInstrument[h.instrument_id] || 0;

        let dailyChangePct = 0;
        let monthlyChangePct = 0;

        if (prev1d > 0 && currentPrice > 0) {
          dailyChangePct = ((currentPrice - prev1d) / prev1d) * 100;
        }
        if (prev30d > 0 && currentPrice > 0) {
          monthlyChangePct = ((currentPrice - prev30d) / prev30d) * 100;
        }

        dailyChangePct = Number.isFinite(dailyChangePct)
          ? Math.round(dailyChangePct * 10) / 10
          : 0;

        monthlyChangePct = Number.isFinite(monthlyChangePct)
          ? Math.round(monthlyChangePct * 10) / 10
          : 0;

        return {
          id: h.id,
          name: h.asset_label || instrument.name || instrument.symbol || "—",
          ticker: instrument.symbol || "",
          account: account.name || "—",
          accountType: account.type || "",
          quantity,
          value,
          dailyChangePct,
          monthlyChangePct,
          allocationPct: 0,
          assetClass: instrument.asset_class || null,
        };
      });

      // comptes sans holdings (ex : livrets / cash)
      const accountsWithHoldings = new Set(
        (holdingsData || []).map((h) => h.account_id)
      );
      const standaloneAccounts = (accounts || []).filter(
        (a) => !accountsWithHoldings.has(a.id)
      );

      let totalStandaloneValue = 0;
      standaloneAccounts.forEach((a) => {
        totalStandaloneValue += toNumber(a.current_amount);
      });

      const totalValue = totalHoldingsValue + totalStandaloneValue;

      const holdingsWithAllocation = computedHoldings.map((h) => ({
        ...h,
        allocationPct:
          totalValue > 0 ? Math.round((h.value / totalValue) * 100) : 0,
      }));

      // -------- CAMEMBERT ----------
      const categoryTotals = {};
      const addToCategory = (label, amount) => {
        if (!categoryTotals[label]) categoryTotals[label] = 0;
        categoryTotals[label] += amount;
      };

      holdingsWithAllocation.forEach((h) => {
        const label = categorizePosition(h.accountType, h.assetClass);
        addToCategory(label, h.value);
      });

      standaloneAccounts.forEach((a) => {
        const label = categorizePosition(a.type, null);
        addToCategory(label, toNumber(a.current_amount));
      });

      // palette Olympe (or / noir / neutres)
      const palette = {
        Liquidités: "#111827", // anthracite
        Épargne: "#D4AF37", // or
        Investissements: "#1D4ED8", // bleu roi
        Crypto: "#F59E0B", // or chaud
        Autres: "#6B7280", // gris neutre
      };

      const computedAllocations = Object.entries(categoryTotals).map(
        ([label, amount]) => ({
          label,
          percent:
            totalValue > 0
              ? Math.round((Number(amount) / totalValue) * 100)
              : 0,
          color: palette[label] || "#6B7280",
        })
      );

      // -------- VARIATIONS PORTFEUILLE ----------
      let portfolioDaily = 0;
      let portfolioMonthly = 0;

      if (totalValue > 0) {
        holdingsWithAllocation.forEach((h) => {
          const weight = h.value / totalValue;
          portfolioDaily += weight * h.dailyChangePct;
          portfolioMonthly += weight * h.monthlyChangePct;
        });

        portfolioDaily = Math.round(portfolioDaily * 10) / 10;
        portfolioMonthly = Math.round(portfolioMonthly * 10) / 10;
      }

      setHoldings(holdingsWithAllocation);
      setAllocations(computedAllocations);
      setSummary({
        totalValue,
        nbAccounts: (accounts || []).length,
        nbHoldings: (holdingsData || []).length,
        dailyChangePct: portfolioDaily,
        monthlyChangePct: portfolioMonthly,
      });
    } catch (err) {
      console.error("Erreur lors du chargement du portefeuille :", err);
    } finally {
      setLoading(false);
    }
  };

  // ---------- FORMATAGE ----------
  const formatCurrency = (value) =>
    value === null || value === undefined
      ? "—"
      : Number(value).toLocaleString("fr-FR", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0,
        });

  const totalValueDisplay = formatCurrency(summary.totalValue);

  // ---------- DATA CAMEMBERT ----------
  const hasAllocations =
    allocations.length > 0 && allocations.some((a) => a.percent > 0);

  const doughnutData = {
    labels: allocations.map((a) => a.label),
    datasets: [
      {
        data: allocations.map((a) => a.percent),
        backgroundColor: allocations.map((a) => a.color),
        borderWidth: 2,
        borderColor: "#F9FAFB",
        hoverOffset: 6,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "68%",
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        padding: 8,
        backgroundColor: "#0F1013",
        titleColor: "#F9FAFB",
        bodyColor: "#E5E7EB",
        cornerRadius: 10,
        callbacks: {
          label: (ctx) => `${ctx.label} : ${ctx.parsed}%`,
        },
      },
    },
  };

  // ---------- RENDER ----------
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
          <SidebarItem
            icon={Home}
            label="Tableau de bord"
            onClick={() => navigate("/dashboard")}
          />
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
            active
            onClick={() => navigate("/portefeuille")}
          />
          <SidebarItem
            icon={GraduationCap}
            label="Glossaire"
            onClick={() => navigate("/glossaire")}
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
        <header className="h-16 bg-white flex items-center justify-between px-6 border-b border-gray-200">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gray-400">
              Portefeuille
            </p>
            <p className="text-sm text-gray-700">
              Vue globale de vos comptes & placements
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-gray-400">Valeur totale</p>
              <p className="text-sm font-semibold text-[#D4AF37]">
                {totalValueDisplay}
              </p>
            </div>
            {/* Bouton "Rafraîchir les cours" supprimé */}
          </div>
        </header>

        {/* CONTENT */}
        <motion.div
          className="flex-1 p-6 overflow-y-auto space-y-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#D4AF37] animate-spin" />
              <span>Chargement du portefeuille…</span>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  {
                    label: "Valeur totale",
                    value: totalValueDisplay,
                    subtitle: "Somme de tous vos comptes",
                  },
                  {
                    label: "Variation jour",
                    value: `${summary.dailyChangePct > 0 ? "+" : ""}${
                      summary.dailyChangePct
                    } %`,
                    subtitle: "Depuis la clôture veille",
                    positive: summary.dailyChangePct >= 0,
                  },
                  {
                    label: "Variation 30 jours",
                    value: `${
                      summary.monthlyChangePct > 0 ? "+" : ""
                    }${summary.monthlyChangePct} %`,
                    subtitle: "Sur les 30 derniers jours",
                    positive: summary.monthlyChangePct >= 0,
                  },
                  {
                    label: "Comptes & lignes",
                    value: `${summary.nbAccounts} comptes`,
                    subtitle: `${summary.nbHoldings} placements`,
                  },
                ].map((item, index) => (
                  <motion.div
                    key={item.label}
                    custom={index}
                    variants={kpiVariants}
                    initial="hidden"
                    animate="show"
                  >
                    <KpiCard
                      label={item.label}
                      value={item.value}
                      subtitle={item.subtitle}
                      positive={item.positive}
                    />
                  </motion.div>
                ))}
              </section>

              {/* Répartition + légende */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Camembert */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">
                        Répartition du patrimoine
                      </h2>
                      <p className="text-xs text-gray-500">
                        Vue d’ensemble par type d’actif
                      </p>
                    </div>
                    <span className="px-2 py-1 rounded-full bg-gray-100 text-xs text-gray-500">
                      Camembert basé sur vos allocations
                    </span>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    {hasAllocations ? (
                      <motion.div
                        className="relative h-56 w-56"
                        whileHover={{ scale: 1.03 }}
                        transition={{
                          type: "spring",
                          stiffness: 200,
                          damping: 15,
                        }}
                      >
                        {/* halo */}
                        <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle_at_30%_0,#D4AF37_0,#F9FAFB_40%,#E5E7EB_80%)] opacity-30 blur-md" />

                        {/* graphe */}
                        <div className="relative h-full w-full bg-white rounded-full">
                          <Doughnut
                            data={doughnutData}
                            options={doughnutOptions}
                          />
                        </div>

                        {/* valeur totale au centre */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-[11px] uppercase tracking-[0.16em] text-gray-400">
                            Total
                          </span>
                          <span className="text-sm font-semibold text-[#111827]">
                            {totalValueDisplay}
                          </span>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="h-40 w-40 rounded-full border-4 border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-400 text-center px-4">
                        Aucune donnée suffisante pour afficher la répartition.
                      </div>
                    )}
                  </div>
                </div>

                {/* Légende / catégories */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-800 mb-4">
                    Détail des catégories
                  </h2>
                  {allocations.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      Aucune donnée de répartition disponible.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {allocations.map((item) => (
                        <li
                          key={item.label}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-sm text-gray-700">
                              {item.label}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {item.percent} %
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
                    Cette répartition est calculée sur la valeur actuelle de vos
                    comptes et placements. Elle permet de visualiser l’équilibre
                    entre cash, épargne et investissement.
                  </p>
                </div>
              </section>

              {/* Tableau des placements */}
              <section className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">
                      Détail des placements
                    </h2>
                    <p className="text-xs text-gray-500">
                      Liste de vos lignes (actions, ETF, livrets, cryptos…)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate("/accounts")}
                      className="
                        flex items-center gap-2 px-4 py-2
                        rounded-full border border-gray-300
                        text-xs font-medium text-gray-700
                        bg-white hover:bg-[#F9F4E8]
                        hover:border-[#D4AF37] hover:text-[#D4AF37]
                        transition-all duration-300
                        shadow-sm hover:shadow-md
                      "
                    >
                      <span className="text-[#D4AF37] text-lg leading-none">
                        ＋
                      </span>
                      Ajouter un placement
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-[11px] uppercase text-gray-400">
                        <th className="text-left py-2 pr-4 font-medium">
                          Placement
                        </th>
                        <th className="text-left py-2 pr-4 font-medium">
                          Compte
                        </th>
                        <th className="text-right py-2 pr-4 font-medium">
                          Quantité
                        </th>
                        <th className="text-right py-2 pr-4 font-medium">
                          Valeur actuelle
                        </th>
                        <th className="text-right py-2 pr-4 font-medium">
                          Variation
                        </th>
                        <th className="text-right py-2 pr-0 font-medium">
                          Poids dans le port.
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-6 text-center text-xs text-gray-400"
                          >
                            Aucun placement pour le moment. Ajoutez une première
                            ligne pour voir votre portefeuille se construire.
                          </td>
                        </tr>
                      ) : (
                        holdings.map((h, index) => (
                          <motion.tr
                            key={h.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.02 * index, duration: 0.2 }}
                            className="group border-b border-gray-50 hover:bg-gray-50/60 transition"
                          >
                            <td className="py-2 pr-4">
                              <div className="flex items-stretch">
                                <div className="w-1 rounded-r-full bg-transparent group-hover:bg-[#D4AF37] transition-all" />
                                <div className="pl-2 flex flex-col">
                                  <span className="text-sm font-medium text-gray-800">
                                    {h.name}
                                  </span>
                                  <span className="text-[11px] text-gray-400">
                                    {h.ticker}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-xs text-gray-600">
                              {h.account}
                            </td>
                            <td className="py-2 pr-4 text-right text-xs text-gray-700">
                              {h.quantity ?? "—"}
                            </td>
                            <td className="py-2 pr-4 text-right text-xs text-gray-900">
                              {formatCurrency(h.value)}
                            </td>
                            <td className="py-2 pr-4 text-right text-xs">
                              <span
                                className={
                                  h.dailyChangePct > 0
                                    ? "text-emerald-600"
                                    : h.dailyChangePct < 0
                                    ? "text-red-500"
                                    : "text-gray-600"
                                }
                              >
                                {h.dailyChangePct > 0 ? "+" : ""}
                                {h.dailyChangePct} %
                              </span>
                            </td>
                            <td className="py-2 pr-0 text-right text-xs text-gray-700">
                              {h.allocationPct} %
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
                  Les pourcentages sont calculés par rapport à la valeur totale
                  de votre portefeuille. Les variations sont fournies à titre
                  pédagogique et ne constituent pas un conseil en investissement.
                </p>
              </section>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}

// 📌 Item de sidebar
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

// 📌 Petite card KPI
function KpiCard({ label, value, subtitle, positive }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex flex-col justify-between transition-transform transition-shadow duration-200 hover:shadow-[0_12px_30px_rgba(15,16,19,0.12)] hover:-translate-y-[2px]">
      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 mb-1">
        {label}
      </p>
      <p className="text-base font-semibold text-gray-900">
        <span
          className={
            positive === undefined
              ? ""
              : positive
              ? "text-emerald-600"
              : "text-red-500"
          }
        >
          {value}
        </span>
      </p>
      {subtitle && (
        <p className="mt-1 text-[11px] text-gray-400">{subtitle}</p>
      )}
    </div>
  );
}
