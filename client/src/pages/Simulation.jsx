import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  PieChart,
  Wallet,
  GraduationCap,
  Settings,
  LogOut,
  Home,
  Sparkles,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// Chart.js
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

// --- Helpers généraux ---
const simulateScenario = ({
  initialCapital,
  monthlyContribution,
  years,
  annualReturnPct,
}) => {
  const values = [];
  let capital = Number(initialCapital) || 0;
  const monthly = Number(monthlyContribution) || 0;
  const rYear = (Number(annualReturnPct) || 0) / 100;

  values.push({ year: 0, value: capital });

  for (let i = 1; i <= years; i++) {
    capital = (capital + monthly * 12) * (1 + rYear);
    values.push({ year: i, value: capital });
  }

  return values;
};

const formatCurrency = (n) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

// --------- COMPOSANT PRINCIPAL ---------
export default function Simulation() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState(null);

  // --- Données réelles ---
  const [accounts, setAccounts] = useState([]);
  const [holdings, setHoldings] = useState([]);

  // --- Scénarios globaux ---
  const [scenarioA, setScenarioA] = useState({
    name: "Scénario A",
    initialCapital: 5000,
    monthlyContribution: 200,
    years: 10,
    annualReturnPct: 5,
  });

  const [scenarioB, setScenarioB] = useState({
    name: "Scénario B",
    initialCapital: 5000,
    monthlyContribution: 300,
    years: 10,
    annualReturnPct: 7,
  });

  const [selectedPreset, setSelectedPreset] = useState("equilibre");

  // --- Objectif enregistré (basé sur scénario A) ---
  const [goalTitle, setGoalTitle] = useState("Objectif PEA 2035");
  const [goalTarget, setGoalTarget] = useState(20000);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // --- Objectif sur une ligne (par placement) ---
  const [selectedHoldingId, setSelectedHoldingId] = useState("");
  const [lineTargetAmount, setLineTargetAmount] = useState(2000);
  const [lineYears, setLineYears] = useState(5);
  const [lineReturnPct, setLineReturnPct] = useState(5);

  // --- Objectif sur tout un compte (proportions actuelles) ---
  const [selectedAccountIdForGoal, setSelectedAccountIdForGoal] =
    useState("");
  const [accountTargetAmount, setAccountTargetAmount] = useState(20000);
  const [accountYears, setAccountYears] = useState(10);
  const [accountReturnPct, setAccountReturnPct] = useState(5);

  // --- AUTH + chargement comptes / holdings ---
  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate("/");
        return;
      }
      setUserEmail(data.user.email || "");
      setUserId(data.user.id);

      try {
        // comptes
        const { data: accountsData, error: accError } = await supabase
          .from("accounts")
          .select("id, user_id, name, type")
          .eq("user_id", data.user.id);

        if (accError) {
          console.error("Erreur chargement comptes", accError);
        } else {
          setAccounts(accountsData || []);
        }

        // holdings
        const { data: holdingsData, error: holdError } = await supabase
          .from("holdings")
          .select(
            "id, user_id, account_id, instrument_id, quantity, current_price, current_value, asset_label"
          )
          .eq("user_id", data.user.id);

        if (holdError) {
          console.error("Erreur chargement holdings", holdError);
        } else {
          setHoldings(holdingsData || []);
        }
      } catch (e) {
        console.error("Erreur init simulation", e);
      }
    };

    init();
  }, [navigate]);

  // déconnexion automatique si pas "remember me"
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

  // --- MAJ Scénarios ---
  const updateScenario = (which, field, value) => {
    const numFields = [
      "initialCapital",
      "monthlyContribution",
      "years",
      "annualReturnPct",
    ];
    const parsedValue = numFields.includes(field)
      ? Number(value) || 0
      : value;

    if (which === "A") {
      setScenarioA((prev) => ({ ...prev, [field]: parsedValue }));
    } else {
      setScenarioB((prev) => ({ ...prev, [field]: parsedValue }));
    }
  };

  // --- Presets ---
  const presets = {
    prudent: { label: "Prudent", annualReturnPct: 3, years: 8 },
    equilibre: { label: "Équilibré", annualReturnPct: 5, years: 12 },
    dynamique: { label: "Dynamique", annualReturnPct: 7, years: 15 },
  };

  const applyPresetToScenarioA = (key) => {
    const preset = presets[key];
    if (!preset) return;
    setSelectedPreset(key);
    setScenarioA((prev) => ({
      ...prev,
      annualReturnPct: preset.annualReturnPct,
      years: preset.years,
    }));
  };

  // --- Simulation des scénarios globaux ---
  const simulationA = useMemo(
    () => simulateScenario(scenarioA),
    [scenarioA]
  );
  const simulationB = useMemo(
    () => simulateScenario(scenarioB),
    [scenarioB]
  );

  const finalA =
    simulationA.length > 0
      ? simulationA[simulationA.length - 1].value
      : 0;
  const finalB =
    simulationB.length > 0
      ? simulationB[simulationB.length - 1].value
      : 0;

  const diff = finalB - finalA;

  // --- Données pour le graph global ---
  const maxYears = Math.max(
    simulationA.length > 0 ? simulationA[simulationA.length - 1].year : 0,
    simulationB.length > 0 ? simulationB[simulationB.length - 1].year : 0
  );

  const labels = [];
  const dataA = [];
  const dataB = [];

  for (let year = 0; year <= maxYears; year++) {
    labels.push(`Année ${year}`);

    const pointA = simulationA.find((p) => p.year === year);
    const pointB = simulationB.find((p) => p.year === year);

    const lastA =
      simulationA.length > 0
        ? simulationA[simulationA.length - 1].value
        : 0;
    const lastB =
      simulationB.length > 0
        ? simulationB[simulationB.length - 1].value
        : 0;

    dataA.push(pointA ? pointA.value : lastA);
    dataB.push(pointB ? pointB.value : lastB);
  }

  const chartData =
    labels.length > 1
      ? {
          labels,
          datasets: [
            {
              label: scenarioA.name || "Scénario A",
              data: dataA,
              tension: 0.35,
              fill: true,
              borderWidth: 2,
              borderColor: "#D4AF37",
              backgroundColor: "rgba(212,175,55,0.14)",
              pointRadius: 0,
            },
            {
              label: scenarioB.name || "Scénario B",
              data: dataB,
              tension: 0.35,
              fill: false,
              borderWidth: 2,
              borderColor: "#4B5563",
              pointRadius: 0,
            },
          ],
        }
      : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          boxWidth: 12,
          color: "#4B5563",
          font: { size: 11 },
        },
      },
      tooltip: {
        backgroundColor: "#0F1013",
        titleColor: "#F9FAFB",
        bodyColor: "#E5E7EB",
        padding: 10,
        cornerRadius: 12,
        callbacks: {
          label: (ctx) =>
            `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: "#9CA3AF",
          font: { size: 11 },
        },
      },
      y: {
        grid: {
          color: "rgba(209,213,219,0.5)",
          drawBorder: false,
        },
        ticks: {
          color: "#9CA3AF",
          font: { size: 11 },
          callback: (value) =>
            new Intl.NumberFormat("fr-FR", {
              style: "currency",
              currency: "EUR",
              maximumFractionDigits: 0,
            }).format(value),
        },
      },
    },
  };

  // --- Enregistrement objectif (scénario A) ---
  const handleSaveGoal = async () => {
    if (!userId) return;
    setSaving(true);
    setSaveMessage("");

    try {
      const { error } = await supabase.from("investment_goals").insert({
        user_id: userId,
        title: goalTitle || "Objectif d’investissement",
        target_amount: Number(goalTarget) || 0,
        initial_capital: scenarioA.initialCapital,
        monthly_contribution: scenarioA.monthlyContribution,
        expected_return_pct: scenarioA.annualReturnPct,
        horizon_years: scenarioA.years,
      });

      if (error) {
        console.error("Erreur enregistrement objectif", error);
        setSaveMessage("Erreur lors de l’enregistrement de l’objectif.");
      } else {
        setSaveMessage("Objectif enregistré dans votre tableau de bord ✨");
      }
    } finally {
      setSaving(false);
    }
  };

  // ==========================
  // 🎯 OBJECTIF SUR UNE LIGNE
  // ==========================
  const selectedHolding =
    holdings.find(
      (h) => String(h.id) === String(selectedHoldingId || "")
    ) || null;

  const lineObjective = useMemo(() => {
    if (!selectedHolding) return null;

    const qty = Number(selectedHolding.quantity) || 0;
    const price = Number(selectedHolding.current_price) || 0;
    const currentValue =
      selectedHolding.current_value != null
        ? Number(selectedHolding.current_value)
        : qty * price;

    const target = Number(lineTargetAmount) || 0;
    const years = Number(lineYears) || 0;
    const r = (Number(lineReturnPct) || 0) / 100;

    if (target <= 0 || years < 0 || !price) {
      return {
        currentValue,
        futureCurrent: currentValue,
        extraUnits: 0,
        extraCapitalNow: 0,
      };
    }

    // valeur future de ce que tu as déjà
    const futureCurrent = currentValue * Math.pow(1 + r, years);

    if (futureCurrent >= target) {
      return {
        currentValue,
        futureCurrent,
        extraUnits: 0,
        extraCapitalNow: 0,
      };
    }

    // capital initial total nécessaire pour atteindre target
    const requiredInitial = target / Math.pow(1 + r, years);
    const extraCapitalNow = Math.max(0, requiredInitial - currentValue);
    const extraUnits = extraCapitalNow / price;

    return {
      currentValue,
      futureCurrent,
      requiredInitial,
      extraCapitalNow,
      extraUnits,
    };
  }, [selectedHolding, lineTargetAmount, lineYears, lineReturnPct]);

  // =========================================
  // 🎯 OBJECTIF SUR UN COMPTE (PROPORTIONS)
  // =========================================
  const accountObjective = useMemo(() => {
    if (!selectedAccountIdForGoal) return null;

    const accountHoldings = holdings.filter(
      (h) => String(h.account_id) === String(selectedAccountIdForGoal)
    );
    if (!accountHoldings.length) return null;

    let totalCurrent = 0;
    const rows = [];

    accountHoldings.forEach((h) => {
      const qty = Number(h.quantity) || 0;
      const price = Number(h.current_price) || 0;
      const currentValue =
        h.current_value != null ? Number(h.current_value) : qty * price;
      totalCurrent += currentValue;
      rows.push({
        id: h.id,
        label: h.asset_label || `Ligne ${h.id}`,
        qty,
        price,
        currentValue,
      });
    });

    const target = Number(accountTargetAmount) || 0;
    const years = Number(accountYears) || 0;
    const r = (Number(accountReturnPct) || 0) / 100;

    if (target <= 0 || years < 0 || totalCurrent <= 0) {
      return { totalCurrent, rows: [], extraTotal: 0 };
    }

    const futureCurrent = totalCurrent * Math.pow(1 + r, years);

    if (futureCurrent >= target) {
      return {
        totalCurrent,
        futureCurrent,
        extraTotal: 0,
        rows: rows.map((r) => ({
          ...r,
          extraCapital: 0,
          extraUnits: 0,
        })),
      };
    }

    const requiredInitial = target / Math.pow(1 + r, years);
    const extraTotal = Math.max(0, requiredInitial - totalCurrent);

    const rowsWithExtra = rows.map((r) => {
      const weight = r.currentValue / totalCurrent;
      const extraCapital = extraTotal * weight;
      const extraUnits = r.price > 0 ? extraCapital / r.price : 0;
      return { ...r, weight, extraCapital, extraUnits };
    });

    return {
      totalCurrent,
      futureCurrent,
      requiredInitial,
      extraTotal,
      rows: rowsWithExtra,
    };
  }, [
    holdings,
    selectedAccountIdForGoal,
    accountTargetAmount,
    accountYears,
    accountReturnPct,
  ]);

  // ================= RENDER =================
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
            onClick={() => navigate("/portefeuille")}
          />
          <SidebarItem
            icon={Sparkles}
            label="Simulation"
            active
            onClick={() => navigate("/simulation")}
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
        {/* HEADER */}
        <header className="h-16 bg-white flex items-center justify-between px-6 border-b border-gray-200">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gray-400">
              Simulation
            </p>
            <p className="text-sm text-gray-700">
              Projetez vos placements dans le temps et créez des objectifs.
            </p>
          </div>

          <p className="text-xs text-gray-500">
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </header>

        {/* CONTENT */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {/* Scénarios + graph global */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Colonne scénarios */}
            <div className="xl:col-span-1 space-y-4">
              {/* Presets */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-800 mb-1">
                  Profils types
                </h2>
                <p className="text-xs text-gray-500 mb-3">
                  Appliquez un profil à votre scénario A.
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(presets).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => applyPresetToScenarioA(key)}
                      className={`px-3 py-1.5 rounded-full border text-xs transition ${
                        selectedPreset === key
                          ? "bg-[#0F1013] text-white border-[#0F1013]"
                          : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {preset.label} • {preset.annualReturnPct}%/an •{" "}
                      {preset.years} ans
                    </button>
                  ))}
                </div>
              </div>

              {/* Scénario A */}
              <ScenarioCard
                title="Scénario A"
                scenario={scenarioA}
                onChange={(field, value) => updateScenario("A", field, value)}
                accent="gold"
              />

              {/* Scénario B */}
              <ScenarioCard
                title="Scénario B"
                scenario={scenarioB}
                onChange={(field, value) => updateScenario("B", field, value)}
              />
            </div>

            {/* Graph + résumé comparatif + enregistrement objectif */}
            <div className="xl:col-span-2 space-y-4">
              {/* Graph global */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col h-[320px]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">
                      Évolution simulée dans le temps
                    </h2>
                    <p className="text-xs text-gray-500">
                      Projection annuelle de la valeur de vos placements.
                    </p>
                  </div>
                </div>

                <div className="relative flex-1">
                  <div className="absolute inset-x-6 bottom-0 h-24 bg-gradient-to-t from-[#F5E7B3] via-transparent to-transparent opacity-40 pointer-events-none" />
                  <div className="relative h-full">
                    {chartData ? (
                      <Line data={chartData} options={chartOptions} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-400 text-center px-4">
                        Remplissez au moins un scénario pour afficher la
                        simulation.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Résumé + objectif global */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Comparaison A/B */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-gray-800">
                    Résumé des scénarios
                  </h2>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">
                        Scénario A
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(finalA)}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Capital de départ :{" "}
                        {formatCurrency(scenarioA.initialCapital)}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {scenarioA.monthlyContribution} € / mois •{" "}
                        {scenarioA.annualReturnPct}%/an
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">
                        Scénario B
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(finalB)}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Capital de départ :{" "}
                        {formatCurrency(scenarioB.initialCapital)}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {scenarioB.monthlyContribution} € / mois •{" "}
                        {scenarioB.annualReturnPct}%/an
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-gray-700">
                    {finalA > 0 && finalB > 0 ? (
                      <>
                        À horizon{" "}
                        <span className="font-semibold">
                          {Math.max(scenarioA.years, scenarioB.years)} ans
                        </span>
                        , le scénario B génère{" "}
                        <span
                          className={
                            diff >= 0
                              ? "font-semibold text-emerald-600"
                              : "font-semibold text-red-500"
                          }
                        >
                          {diff >= 0 ? "+" : ""}
                          {formatCurrency(diff)}
                        </span>{" "}
                        de plus que le scénario A.
                      </>
                    ) : (
                      <span className="text-gray-400">
                        Complétez les paramètres pour comparer les scénarios.
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-gray-400 mt-2">
                    Ces simulations sont purement pédagogiques et ne
                    constituent pas une garantie de rendement.
                  </p>
                </div>

                {/* Enregistrement objectif global */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-gray-800 mb-1">
                    Enregistrer comme objectif
                  </h2>
                  <p className="text-xs text-gray-500">
                    L’objectif sera basé sur le scénario A et visible dans
                    votre tableau de bord.
                  </p>

                  <div className="space-y-2 text-xs">
                    <div className="space-y-1">
                      <label className="text-gray-600">Titre</label>
                      <input
                        type="text"
                        value={goalTitle}
                        onChange={(e) => setGoalTitle(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                        placeholder="Objectif d’investissement"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-gray-600">
                        Montant cible (en €)
                      </label>
                      <input
                        type="number"
                        value={goalTarget}
                        onChange={(e) =>
                          setGoalTarget(Number(e.target.value) || 0)
                        }
                        className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveGoal}
                    disabled={saving}
                    className="mt-3 inline-flex items-center justify-center px-3 py-2 rounded-full text-xs font-medium bg-[#0F1013] text-white hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {saving ? "Enregistrement..." : "Enregistrer cet objectif"}
                  </button>

                  {saveMessage && (
                    <p className="text-[11px] text-gray-500 mt-2">
                      {saveMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 🎯 Objectifs par ligne + par compte */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Objectif sur une ligne */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">
                Objectif sur une ligne
              </h2>
              <p className="text-xs text-gray-500 mb-2">
                Choisissez un placement existant et un montant cible.
              </p>

              <div className="space-y-2 text-xs">
                <div className="space-y-1">
                  <label className="text-gray-600">Placement</label>
                  <select
                    value={selectedHoldingId}
                    onChange={(e) => setSelectedHoldingId(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-1.5 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  >
                    <option value="">Sélectionner une ligne…</option>
                    {holdings.map((h) => {
                      const acc = accounts.find(
                        (a) => a.id === h.account_id
                      );
                      return (
                        <option key={h.id} value={h.id}>
                          {h.asset_label || "Sans nom"}{" "}
                          {acc ? `• ${acc.name}` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-gray-600">Montant cible</label>
                    <input
                      type="number"
                      value={lineTargetAmount}
                      onChange={(e) =>
                        setLineTargetAmount(Number(e.target.value) || 0)
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-gray-600">Durée (années)</label>
                    <input
                      type="number"
                      value={lineYears}
                      onChange={(e) =>
                        setLineYears(Number(e.target.value) || 0)
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-gray-600">Rendement (%)</label>
                    <input
                      type="number"
                      value={lineReturnPct}
                      onChange={(e) =>
                        setLineReturnPct(Number(e.target.value) || 0)
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-700">
                {!selectedHolding ? (
                  <p className="text-gray-400">
                    Sélectionnez une ligne pour voir la simulation.
                  </p>
                ) : lineObjective ? (
                  <>
                    <p>
                      Valeur actuelle :{" "}
                      <span className="font-semibold">
                        {formatCurrency(lineObjective.currentValue)}
                      </span>
                    </p>
                    <p>
                      Valeur future estimée sans nouvel achat :{" "}
                      <span className="font-semibold">
                        {formatCurrency(lineObjective.futureCurrent)}
                      </span>
                    </p>
                    {lineObjective.extraUnits > 0 ? (
                      <p className="mt-2">
                        Pour viser{" "}
                        <span className="font-semibold">
                          {formatCurrency(lineTargetAmount)}
                        </span>{" "}
                        dans{" "}
                        <span className="font-semibold">
                          {lineYears} ans
                        </span>{" "}
                        avec {lineReturnPct}%/an, tu devrais acheter
                        environ{" "}
                        <span className="font-semibold">
                          {lineObjective.extraUnits.toFixed(2)} parts
                        </span>{" "}
                        supplémentaires, soit{" "}
                        <span className="font-semibold">
                          {formatCurrency(lineObjective.extraCapitalNow)}
                        </span>{" "}
                        aujourd’hui.
                      </p>
                    ) : (
                      <p className="mt-2 text-emerald-600">
                        Avec la valeur actuelle et ce rendement, ton objectif
                        est déjà atteint ou dépassé.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            </div>

            {/* Objectif sur un compte (proportions actuelles) */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-800 mb-1">
                Objectif sur un compte (répartition actuelle)
              </h2>
              <p className="text-xs text-gray-500 mb-2">
                Choisissez un compte, un montant cible et un rendement : on
                calcule combien investir par ligne en gardant les mêmes
                proportions.
              </p>

              <div className="space-y-2 text-xs">
                <div className="space-y-1">
                  <label className="text-gray-600">Compte</label>
                  <select
                    value={selectedAccountIdForGoal}
                    onChange={(e) =>
                      setSelectedAccountIdForGoal(e.target.value)
                    }
                    className="w-full rounded-xl border border-gray-200 px-3 py-1.5 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  >
                    <option value="">Sélectionner un compte…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-gray-600">Montant cible</label>
                    <input
                      type="number"
                      value={accountTargetAmount}
                      onChange={(e) =>
                        setAccountTargetAmount(
                          Number(e.target.value) || 0
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-gray-600">Durée (années)</label>
                    <input
                      type="number"
                      value={accountYears}
                      onChange={(e) =>
                        setAccountYears(Number(e.target.value) || 0)
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-gray-600">Rendement (%)</label>
                    <input
                      type="number"
                      value={accountReturnPct}
                      onChange={(e) =>
                        setAccountReturnPct(Number(e.target.value) || 0)
                      }
                      className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-700 space-y-2">
                {!selectedAccountIdForGoal ? (
                  <p className="text-gray-400">
                    Sélectionnez un compte pour voir la simulation.
                  </p>
                ) : !accountObjective ? (
                  <p className="text-gray-400">
                    Aucune ligne trouvée pour ce compte.
                  </p>
                ) : (
                  <>
                    <p>
                      Valeur actuelle du compte :{" "}
                      <span className="font-semibold">
                        {formatCurrency(accountObjective.totalCurrent)}
                      </span>
                    </p>
                    {accountObjective.extraTotal > 0 ? (
                      <p>
                        Capital supplémentaire total à investir (aujourd’hui)
                        pour viser{" "}
                        <span className="font-semibold">
                          {formatCurrency(accountTargetAmount)}
                        </span>{" "}
                        dans{" "}
                        <span className="font-semibold">
                          {accountYears} ans
                        </span>{" "}
                        avec {accountReturnPct}%/an :{" "}
                        <span className="font-semibold">
                          {formatCurrency(accountObjective.extraTotal)}
                        </span>
                        .
                      </p>
                    ) : (
                      <p className="text-emerald-600">
                        Avec la valeur actuelle et ce rendement, ton objectif
                        sur le compte est déjà atteint ou dépassé.
                      </p>
                    )}

                    {accountObjective.rows.length > 0 && (
                      <div className="mt-2 border-t border-gray-100 pt-2">
                        <p className="font-semibold mb-1">
                          Répartition par ligne :
                        </p>
                        <div className="space-y-1">
                          {accountObjective.rows.map((r) => (
                            <div
                              key={r.id}
                              className="flex justify-between items-center"
                            >
                              <div>
                                <p className="text-gray-800">
                                  {r.label}
                                </p>
                                <p className="text-[11px] text-gray-500">
                                  {formatCurrency(r.currentValue)} • poids{" "}
                                  {r.weight
                                    ? `${(r.weight * 100).toFixed(1)} %`
                                    : "—"}
                                </p>
                              </div>
                              {r.extraUnits > 0 ? (
                                <p className="text-[11px] text-gray-700 text-right">
                                  +{" "}
                                  <span className="font-semibold">
                                    {r.extraUnits.toFixed(2)} parts
                                  </span>{" "}
                                  ({formatCurrency(r.extraCapital)})
                                </p>
                              ) : (
                                <p className="text-[11px] text-gray-400">
                                  0 part en plus
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/* ========== Components utilitaires ========== */

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

function ScenarioCard({ title, scenario, onChange, accent }) {
  const accentClass =
    accent === "gold"
      ? "border-[#D4AF37] bg-[#FFFBEB]"
      : "border-gray-200 bg-gray-50";

  return (
    <div
      className={`rounded-2xl border ${accentClass} p-5 flex flex-col gap-3`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <label className="text-gray-600">Capital de départ</label>
          <input
            type="number"
            value={scenario.initialCapital}
            onChange={(e) => onChange("initialCapital", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-gray-600">Versement mensuel</label>
          <input
            type="number"
            value={scenario.monthlyContribution}
            onChange={(e) =>
              onChange("monthlyContribution", e.target.value)
            }
            className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-gray-600">Durée (années)</label>
          <input
            type="number"
            value={scenario.years}
            onChange={(e) => onChange("years", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-gray-600">Rendement annuel (%)</label>
          <input
            type="number"
            value={scenario.annualReturnPct}
            onChange={(e) => onChange("annualReturnPct", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
          />
        </div>
      </div>
    </div>
  );
}
