import React, { useEffect, useMemo, useState } from "react";
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

const toNumber = (v) =>
  v === null || v === undefined || v === "" ? 0 : Number(v);

const formatCurrency0 = (n) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const formatPct1 = (v) =>
  `${(v > 0 ? "+" : v < 0 ? "" : "")}${(Math.round(v * 10) / 10).toFixed(1)} %`;

// --- Simulation simple capital + versements mensuels ---
const simulateScenario = ({
  initialCapital,
  monthlyContribution,
  years,
  annualReturnPct,
}) => {
  const values = [];
  let capital = toNumber(initialCapital);
  const monthly = toNumber(monthlyContribution);
  const rYear = toNumber(annualReturnPct) / 100;

  values.push({ year: 0, value: capital });

  for (let i = 1; i <= years; i++) {
    capital = (capital + monthly * 12) * (1 + rYear);
    values.push({ year: i, value: capital });
  }
  return values;
};

// --- Valeur future simple (capital unique aujourd’hui) ---
const futureValue = (current, annualReturnPct, years) => {
  const c = toNumber(current);
  const r = toNumber(annualReturnPct) / 100;
  const t = toNumber(years);
  if (t <= 0) return c;
  return c * Math.pow(1 + r, t);
};

// Montant à investir aujourd’hui pour atteindre une cible
// FV = (current FV + extra * (1+r)^t) = target -> extra
const extraNowForGoal = (currentValue, target, annualReturnPct, years) => {
  const fvCurrent = futureValue(currentValue, annualReturnPct, years);
  const tgt = toNumber(target);
  const r = toNumber(annualReturnPct) / 100;
  const t = toNumber(years);
  if (t <= 0 || r === 0) {
    // si pas de rendement, on considère un investissement cash simple
    return Math.max(0, tgt - currentValue);
  }
  if (fvCurrent >= tgt) return 0;
  const factor = Math.pow(1 + r, t);
  return Math.max(0, (tgt - fvCurrent) / factor);
};

export default function Simulation() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState(null);

  // --- Données portefeuille ---
  const [accounts, setAccounts] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [instrumentsById, setInstrumentsById] = useState({});
  const [instrumentReturns, setInstrumentReturns] = useState({}); // % annuel estimé
  const [accountReturns, setAccountReturns] = useState({}); // rendement auto basé sur répartition actuelle
  const [loadingData, setLoadingData] = useState(true);

  // --- Scénarios globaux ---
  const [scenarioA, setScenarioA] = useState({
    name: "Scénario A",
    initialCapital: "",
    monthlyContribution: "",
    years: "",
    annualReturnPct: "",
  });

  const [scenarioB, setScenarioB] = useState({
    name: "Scénario B",
    initialCapital: "",
    monthlyContribution: "",
    years: "",
    annualReturnPct: "",
  });

  // Objectif global (basé sur scénario A)
  const [globalGoalTitle, setGlobalGoalTitle] = useState("");
  const [globalGoalTarget, setGlobalGoalTarget] = useState("");
  const [savingGlobalGoal, setSavingGlobalGoal] = useState(false);
  const [globalGoalMessage, setGlobalGoalMessage] = useState("");

  // --- Objectif par ligne ---
  const [selectedHoldingId, setSelectedHoldingId] = useState("");
  const [lineTargetAmount, setLineTargetAmount] = useState("");
  const [lineYears, setLineYears] = useState("");
  const [lineReturnInput, setLineReturnInput] = useState(""); // valeur que tape l'utilisateur
  const [savingLineGoal, setSavingLineGoal] = useState(false);
  const [lineGoalMessage, setLineGoalMessage] = useState("");

  // --- Objectif par compte ---
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [accountTargetAmount, setAccountTargetAmount] = useState("");
  const [accountYears, setAccountYears] = useState("");
  const [accountReturnInput, setAccountReturnInput] = useState("");
  const [allocationMode, setAllocationMode] = useState("current"); // "current" | "target"
  const [targetWeights, setTargetWeights] = useState({}); // {holdingId: %}
  const [savingAccountGoal, setSavingAccountGoal] = useState(false);
  const [accountGoalMessage, setAccountGoalMessage] = useState("");

  // --- AUTH + chargement données ---
  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate("/");
        return;
      }
      setUserEmail(data.user.email || "");
      setUserId(data.user.id);
      await loadPortfolioData(data.user.id);
    };
    init();
  }, [navigate]);

  const loadPortfolioData = async (uid) => {
    setLoadingData(true);
    try {
      const { data: accountsData, error: accErr } = await supabase
        .from("accounts")
        .select(
          "id, user_id, name, type, currency, current_amount, initial_amount"
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: true });

      if (accErr) throw accErr;

      const { data: holdingsData, error: holdErr } = await supabase
        .from("holdings")
        .select(
          "id, user_id, account_id, instrument_id, quantity, avg_buy_price, current_price, current_value, asset_label"
        )
        .eq("user_id", uid);

      if (holdErr) throw holdErr;

      const instrumentIds = Array.from(
        new Set(
          (holdingsData || [])
            .map((h) => h.instrument_id)
            .filter((id) => !!id)
        )
      );

      let instrumentsByIdLocal = {};
      let instrumentReturnsLocal = {};
      let accountReturnsLocal = {};

      if (instrumentIds.length > 0) {
        const { data: instruments, error: instErr } = await supabase
          .from("instruments")
          .select("id, symbol, name, asset_class")
          .in("id", instrumentIds);

        if (instErr) throw instErr;

        instrumentsByIdLocal = Object.fromEntries(
          (instruments || []).map((i) => [i.id, i])
        );

        // Prices sur 1 an pour calculer un rendement simple
        const now = new Date();
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        const isoOneYearAgo = oneYearAgo.toISOString();

        const { data: prices, error: priceErr } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", isoOneYearAgo)
          .order("fetched_at", { ascending: true });

        if (priceErr) throw priceErr;

        const grouped = {};
        (prices || []).forEach((p) => {
          if (!grouped[p.instrument_id]) grouped[p.instrument_id] = [];
          grouped[p.instrument_id].push({
            date: new Date(p.fetched_at),
            price: toNumber(p.price),
          });
        });

        Object.entries(grouped).forEach(([instId, series]) => {
          if (!series.length) return;
          const first = series[0].price;
          const last = series[series.length - 1].price;
          if (first > 0 && last > 0) {
            const simpleReturn = ((last / first - 1) * 100);
            instrumentReturnsLocal[instId] = simpleReturn; // déjà en %
          }
        });

        // Rendement moyen par compte (répartition actuelle)
        const holdingsByAccount = {};
        (holdingsData || []).forEach((h) => {
          if (!holdingsByAccount[h.account_id]) holdingsByAccount[h.account_id] = [];
          holdingsByAccount[h.account_id].push(h);
        });

        (accountsData || []).forEach((acc) => {
          const list = holdingsByAccount[acc.id] || [];
          let totalVal = 0;
          list.forEach((h) => {
            totalVal += toNumber(h.current_value);
          });
          if (totalVal <= 0) {
            accountReturnsLocal[acc.id] = null;
            return;
          }

          let sum = 0;
          list.forEach((h) => {
            const instR = instrumentReturnsLocal[h.instrument_id];
            if (instR === undefined || instR === null) return;
            const weight = toNumber(h.current_value) / totalVal;
            sum += weight * instR;
          });
          accountReturnsLocal[acc.id] = sum; // % estimé
        });
      }

      setAccounts(accountsData || []);
      setHoldings(holdingsData || []);
      setInstrumentsById(instrumentsByIdLocal);
      setInstrumentReturns(instrumentReturnsLocal);
      setAccountReturns(accountReturnsLocal);
    } catch (err) {
      console.error("Erreur chargement simulation :", err);
    } finally {
      setLoadingData(false);
    }
  };

  // --- Déconnexion automatique si pas "remember" ---
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

  // --- MàJ scénarios (string -> nombre dans la simulation) ---
  const updateScenario = (which, field, value) => {
    const updater = which === "A" ? setScenarioA : setScenarioB;
    updater((prev) => ({ ...prev, [field]: value }));
  };

  const parseScenarioForSim = (s) => ({
    initialCapital: toNumber(s.initialCapital),
    monthlyContribution: toNumber(s.monthlyContribution),
    years: Math.max(0, Math.floor(toNumber(s.years))),
    annualReturnPct: toNumber(s.annualReturnPct),
  });

  const simA = useMemo(
    () => simulateScenario(parseScenarioForSim(scenarioA)),
    [scenarioA]
  );
  const simB = useMemo(
    () => simulateScenario(parseScenarioForSim(scenarioB)),
    [scenarioB]
  );

  const finalA =
    simA.length > 0 ? simA[simA.length - 1].value : 0;
  const finalB =
    simB.length > 0 ? simB[simB.length - 1].value : 0;

  const diffAB = finalB - finalA;
  const maxYearsSim = Math.max(
    simA.length ? simA[simA.length - 1].year : 0,
    simB.length ? simB[simB.length - 1].year : 0
  );

  const simLabels = [];
  const dataA = [];
  const dataB = [];
  for (let year = 0; year <= maxYearsSim; year++) {
    simLabels.push(`Année ${year}`);
    const pA = simA.find((p) => p.year === year);
    const pB = simB.find((p) => p.year === year);
    dataA.push(pA ? pA.value : dataA.length ? dataA[dataA.length - 1] : 0);
    dataB.push(pB ? pB.value : dataB.length ? dataB[dataB.length - 1] : 0);
  }

  const simChartData =
    simLabels.length > 1
      ? {
          labels: simLabels,
          datasets: [
            {
              label: "Scénario A",
              data: dataA,
              tension: 0.35,
              borderWidth: 2,
              borderColor: "#D4AF37",
              backgroundColor: "rgba(212,175,55,0.15)",
              fill: true,
              pointRadius: 0,
            },
            {
              label: "Scénario B",
              data: dataB,
              tension: 0.35,
              borderWidth: 2,
              borderColor: "#4B5563",
              fill: false,
              pointRadius: 0,
            },
          ],
        }
      : null;

  const simChartOptions = {
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
            `${ctx.dataset.label}: ${formatCurrency0(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#9CA3AF", font: { size: 11 } },
      },
      y: {
        grid: {
          color: "rgba(209,213,219,0.5)",
          drawBorder: false,
        },
        ticks: {
          color: "#9CA3AF",
          font: { size: 11 },
          callback: (value) => formatCurrency0(value),
        },
      },
    },
  };

  // --- Enregistrement objectif global ---
  const handleSaveGlobalGoal = async () => {
    if (!userId) return;
    setSavingGlobalGoal(true);
    setGlobalGoalMessage("");

    const parsed = parseScenarioForSim(scenarioA);
    try {
      const { error } = await supabase.from("investment_goals").insert({
        user_id: userId,
        title: globalGoalTitle || "Objectif global",
        target_amount: toNumber(globalGoalTarget) || null,
        initial_capital: parsed.initialCapital,
        monthly_contribution: parsed.monthlyContribution,
        expected_return_pct: parsed.annualReturnPct,
        horizon_years: parsed.years,
        scope: "global_simulation",
        details: {
          scenario: "A",
        },
      });
      if (error) {
        console.error(error);
        setGlobalGoalMessage("Erreur lors de l’enregistrement de l’objectif.");
      } else {
        setGlobalGoalMessage(
          "Objectif global enregistré dans votre tableau de bord ✨"
        );
      }
    } finally {
      setSavingGlobalGoal(false);
    }
  };

  // --- Sélecteurs utiles ---
  const holdingsWithMeta = useMemo(
    () =>
      holdings.map((h) => {
        const inst = instrumentsById[h.instrument_id] || {};
        const acc = accounts.find((a) => a.id === h.account_id) || {};
        return {
          ...h,
          instrumentSymbol: inst.symbol || "",
          instrumentName: inst.name || "",
          accountName: acc.name || "",
          currentValue:
            h.current_value !== null && h.current_value !== undefined
              ? toNumber(h.current_value)
              : toNumber(h.quantity) * toNumber(h.current_price),
        };
      }),
    [holdings, instrumentsById, accounts]
  );

  const holdingsByAccount = useMemo(() => {
    const map = {};
    holdingsWithMeta.forEach((h) => {
      if (!map[h.account_id]) map[h.account_id] = [];
      map[h.account_id].push(h);
    });
    return map;
  }, [holdingsWithMeta]);

  // --- Objectif par ligne : calculs ---
  const selectedHolding = holdingsWithMeta.find(
    (h) => String(h.id) === String(selectedHoldingId)
  );

  const autoLineReturn =
    selectedHolding && instrumentReturns[selectedHolding.instrument_id] !== undefined
      ? instrumentReturns[selectedHolding.instrument_id]
      : null;

  const effectiveLineReturn =
    lineReturnInput === "" && autoLineReturn !== null
      ? autoLineReturn
      : toNumber(lineReturnInput);

  const lineExtraNow = selectedHolding
    ? extraNowForGoal(
        selectedHolding.currentValue,
        toNumber(lineTargetAmount),
        effectiveLineReturn,
        toNumber(lineYears)
      )
    : 0;

  const lineExtraShares =
    selectedHolding && toNumber(selectedHolding.current_price) > 0
      ? lineExtraNow / toNumber(selectedHolding.current_price)
      : 0;

  const handleSaveLineGoal = async () => {
    if (!userId || !selectedHolding) return;
    setSavingLineGoal(true);
    setLineGoalMessage("");

    try {
      const effectiveR = effectiveLineReturn || null;
      const { error } = await supabase.from("investment_goals").insert({
        user_id: userId,
        title:
          (selectedHolding.instrumentName || selectedHolding.asset_label) +
          " – objectif",
        target_amount: toNumber(lineTargetAmount) || null,
        initial_capital: selectedHolding.currentValue,
        expected_return_pct: effectiveR,
        horizon_years: toNumber(lineYears) || null,
        scope: "line_goal",
        account_id: selectedHolding.account_id,
        holding_id: selectedHolding.id,
        details: {
          type: "single_line",
          instrument_id: selectedHolding.instrument_id,
          instrument_symbol: selectedHolding.instrumentSymbol,
          auto_return_pct: autoLineReturn,
          used_return_pct: effectiveR,
          extra_now: lineExtraNow,
          extra_shares: lineExtraShares,
        },
      });

      if (error) {
        console.error(error);
        setLineGoalMessage(
          "Erreur lors de l’enregistrement de l’objectif de ligne."
        );
      } else {
        setLineGoalMessage(
          "Objectif de ligne enregistré dans votre tableau de bord ✨"
        );
      }
    } finally {
      setSavingLineGoal(false);
    }
  };

  // --- Objectif par compte : calculs ---
  const selectedAccount = accounts.find(
    (a) => String(a.id) === String(selectedAccountId)
  );

  const accountHoldings = selectedAccount
    ? holdingsByAccount[selectedAccount.id] || []
    : [];

  const accountCurrentValue = accountHoldings.reduce(
    (sum, h) => sum + h.currentValue,
    0
  );

  // Rendement auto basé sur proportions actuelles
  const autoReturnCurrent =
    selectedAccount && accountReturns[selectedAccount.id] !== undefined
      ? accountReturns[selectedAccount.id]
      : null;

  // Rendement auto basé sur répartition cible (si au moins un rendement connu)
  const autoReturnTarget = useMemo(() => {
    if (!selectedAccount || !accountHoldings.length) return null;

    // somme des % saisis (on ignore les NaN)
    let sumPct = 0;
    accountHoldings.forEach((h) => {
      const p = toNumber(targetWeights[h.id]);
      if (p > 0) sumPct += p;
    });

    if (sumPct <= 0) return null;

    let result = 0;
    accountHoldings.forEach((h) => {
      const instR = instrumentReturns[h.instrument_id];
      if (instR === undefined || instR === null) return;
      const pct = toNumber(targetWeights[h.id]);
      if (pct <= 0) return;
      const weight = pct / sumPct;
      result += weight * instR;
    });

    return result;
  }, [selectedAccount, accountHoldings, targetWeights, instrumentReturns]);

  const effectiveAccountReturn =
    accountReturnInput === ""
      ? allocationMode === "current"
        ? autoReturnCurrent || 0
        : autoReturnTarget || 0
      : toNumber(accountReturnInput);

  const accountExtraNow =
    selectedAccount && accountCurrentValue > 0
      ? extraNowForGoal(
          accountCurrentValue,
          toNumber(accountTargetAmount),
          effectiveAccountReturn,
          toNumber(accountYears)
        )
      : 0;

  // Répartition de ce capital supplémentaire
  const accountAllocationRows = useMemo(() => {
    if (!selectedAccount || !accountHoldings.length || accountExtraNow <= 0) {
      return [];
    }

    let weights = [];
    if (allocationMode === "current" || !selectedAccount) {
      // poids actuels
      if (accountCurrentValue <= 0) return [];
      weights = accountHoldings.map((h) => ({
        holding: h,
        weight: h.currentValue / accountCurrentValue,
      }));
    } else {
      // répartition cible : on normalise ce que l'utilisateur a saisi
      let sum = 0;
      accountHoldings.forEach((h) => {
        const p = toNumber(targetWeights[h.id]);
        if (p > 0) sum += p;
      });
      if (sum <= 0) return [];
      weights = accountHoldings.map((h) => ({
        holding: h,
        weight: Math.max(0, toNumber(targetWeights[h.id])) / sum,
      }));
    }

    return weights.map(({ holding, weight }) => {
      const extra = accountExtraNow * weight;
      const price = toNumber(holding.current_price);
      const extraParts = price > 0 ? extra / price : 0;

      return {
        holding,
        weight,
        extraAmount: extra,
        extraParts,
      };
    });
  }, [
    selectedAccount,
    accountHoldings,
    accountExtraNow,
    allocationMode,
    targetWeights,
    accountCurrentValue,
  ]);

  const handleTargetWeightChange = (holdingId, value) => {
    setTargetWeights((prev) => ({
      ...prev,
      [holdingId]: value,
    }));
  };

  const handleSaveAccountGoal = async () => {
    if (!userId || !selectedAccount) return;
    setSavingAccountGoal(true);
    setAccountGoalMessage("");

    try {
      const { error } = await supabase.from("investment_goals").insert({
        user_id: userId,
        title: `Objectif compte – ${selectedAccount.name || "Compte"}`,
        target_amount: toNumber(accountTargetAmount) || null,
        initial_capital: accountCurrentValue,
        expected_return_pct: effectiveAccountReturn || null,
        horizon_years: toNumber(accountYears) || null,
        scope: "account_goal",
        account_id: selectedAccount.id,
        allocation_mode: allocationMode,
        details: {
          auto_return_current_pct: autoReturnCurrent,
          auto_return_target_pct: autoReturnTarget,
          used_return_pct: effectiveAccountReturn,
          extra_total: accountExtraNow,
          allocation_mode: allocationMode,
          target_weights:
            allocationMode === "target" ? targetWeights : undefined,
          lines: accountAllocationRows.map((row) => ({
            holding_id: row.holding.id,
            instrument_id: row.holding.instrument_id,
            instrument_symbol: row.holding.instrumentSymbol,
            weight: row.weight,
            extra_amount: row.extraAmount,
            extra_parts: row.extraParts,
          })),
        },
      });

      if (error) {
        console.error(error);
        setAccountGoalMessage(
          "Erreur lors de l’enregistrement de l’objectif de compte."
        );
      } else {
        setAccountGoalMessage(
          "Objectif de compte enregistré dans votre tableau de bord ✨"
        );
      }
    } finally {
      setSavingAccountGoal(false);
    }
  };

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
              Projetez vos placements et créez des objectifs personnalisés.
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

        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {loadingData ? (
            <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#D4AF37] animate-spin" />
              <span>Chargement des données de simulation…</span>
            </div>
          ) : (
            <>
              {/* 1️⃣ Scénarios + graph + objectif global */}
              <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Profils + scénarios */}
                <div className="xl:col-span-2 space-y-4">
                  {/* Profils types */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <h2 className="text-sm font-semibold text-gray-800 mb-1">
                      Profils types
                    </h2>
                    <p className="text-xs text-gray-500 mb-3">
                      Appliquez un profil à votre scénario A (simple preset, vous
                      pouvez ensuite ajuster).
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {[
                        {
                          id: "prudent",
                          label: "Prudent • 3%/an • 8 ans",
                          r: 3,
                          y: 8,
                        },
                        {
                          id: "equilibre",
                          label: "Équilibré • 5%/an • 12 ans",
                          r: 5,
                          y: 12,
                        },
                        {
                          id: "dynamique",
                          label: "Dynamique • 7%/an • 15 ans",
                          r: 7,
                          y: 15,
                        },
                      ].map((p) => (
                        <button
                          key={p.id}
                          onClick={() =>
                            setScenarioA((prev) => ({
                              ...prev,
                              annualReturnPct: String(p.r),
                              years: String(p.y),
                            }))
                          }
                          className="px-3 py-1.5 rounded-full border text-xs bg-white text-gray-700 border-gray-200 hover:border-gray-400 transition"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Scénario A + B formulaires */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ScenarioCard
                      title="Scénario A"
                      scenario={scenarioA}
                      onChange={(field, value) =>
                        updateScenario("A", field, value)
                      }
                      accent
                    />
                    <ScenarioCard
                      title="Scénario B"
                      scenario={scenarioB}
                      onChange={(field, value) =>
                        updateScenario("B", field, value)
                      }
                    />
                  </div>

                  {/* Graph */}
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
                        {simChartData ? (
                          <Line data={simChartData} options={simChartOptions} />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-gray-400 text-center px-4">
                            Renseignez au moins un scénario pour afficher la
                            simulation.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Résumé + objectif global */}
                <div className="space-y-4">
                  {/* Résumé A/B */}
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
                          {formatCurrency0(finalA)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">
                          Scénario B
                        </p>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCurrency0(finalB)}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-gray-700">
                      {finalA > 0 && finalB > 0 ? (
                        <>
                          À horizon{" "}
                          <span className="font-semibold">
                            {Math.max(
                              parseScenarioForSim(scenarioA).years,
                              parseScenarioForSim(scenarioB).years
                            )}{" "}
                            ans
                          </span>
                          , le scénario B génère{" "}
                          <span
                            className={
                              diffAB >= 0
                                ? "font-semibold text-emerald-600"
                                : "font-semibold text-red-500"
                            }
                          >
                            {diffAB >= 0 ? "+" : ""}
                            {formatCurrency0(diffAB)}
                          </span>{" "}
                          de différence par rapport au scénario A.
                        </>
                      ) : (
                        <span className="text-gray-400">
                          Complétez les paramètres pour comparer les scénarios.
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                      Ces simulations sont pédagogiques et ne constituent pas un
                      conseil en investissement.
                    </p>
                  </div>

                  {/* Objectif global */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                    <h2 className="text-sm font-semibold text-gray-800">
                      Enregistrer comme objectif global
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
                          value={globalGoalTitle}
                          onChange={(e) =>
                            setGlobalGoalTitle(e.target.value)
                          }
                          className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                          placeholder="ex : Objectif PEA 2035"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-gray-600">
                          Montant cible (en €)
                        </label>
                        <input
                          type="number"
                          value={globalGoalTarget}
                          onChange={(e) =>
                            setGlobalGoalTarget(e.target.value)
                          }
                          className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                          placeholder="ex : 20000"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleSaveGlobalGoal}
                      disabled={savingGlobalGoal}
                      className="mt-3 inline-flex items-center justify-center px-3 py-2 rounded-full text-xs font-medium bg-[#0F1013] text-white hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition"
                    >
                      {savingGlobalGoal
                        ? "Enregistrement..."
                        : "Enregistrer cet objectif"}
                    </button>

                    {globalGoalMessage && (
                      <p className="text-[11px] text-gray-500 mt-2">
                        {globalGoalMessage}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* 2️⃣ Objectif sur une ligne & sur un compte */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Objectif par ligne */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-gray-800">
                    Objectif sur une ligne
                  </h2>
                  <p className="text-xs text-gray-500">
                    Choisissez un placement existant et un montant cible.
                  </p>

                  <div className="space-y-3 text-xs">
                    <div className="space-y-1">
                      <label className="text-gray-600">Placement</label>
                      <select
                        value={selectedHoldingId}
                        onChange={(e) =>
                          setSelectedHoldingId(e.target.value)
                        }
                        className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      >
                        <option value="">Sélectionner une ligne...</option>
                        {holdingsWithMeta.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.instrumentName || h.asset_label || "—"} •{" "}
                            {h.accountName || "Compte"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-gray-600">Montant cible</label>
                        <input
                          type="number"
                          value={lineTargetAmount}
                          onChange={(e) =>
                            setLineTargetAmount(e.target.value)
                          }
                          className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                          placeholder="ex : 2000"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-gray-600">
                          Durée (années)
                        </label>
                        <input
                          type="number"
                          value={lineYears}
                          onChange={(e) => setLineYears(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                          placeholder="ex : 5"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-gray-600">
                          Rendement (%/an)
                        </label>
                        <input
                          type="number"
                          value={lineReturnInput}
                          onChange={(e) =>
                            setLineReturnInput(e.target.value)
                          }
                          className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                          placeholder={
                            autoLineReturn !== null
                              ? `ex : ${autoLineReturn.toFixed(1)}`
                              : "ex : 6"
                          }
                        />
                        {autoLineReturn !== null && (
                          <p className="text-[10px] text-gray-400">
                            Rendement estimé de cette ligne :{" "}
                            {autoLineReturn.toFixed(1)} %/an (approx.).
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-gray-700 space-y-1">
                      {selectedHolding ? (
                        <>
                          <p>
                            Valeur actuelle :{" "}
                            {formatCurrency0(selectedHolding.currentValue)}
                          </p>
                          <p>
                            Pour viser{" "}
                            {formatCurrency0(toNumber(lineTargetAmount))} dans{" "}
                            {toNumber(lineYears) || 0} ans avec un rendement
                            de{" "}
                            {effectiveLineReturn
                              ? `${effectiveLineReturn.toFixed(1)} %/an`
                              : "0 %/an"}
                            , vous devriez investir environ{" "}
                            <span className="font-semibold">
                              {formatCurrency0(lineExtraNow)}
                            </span>{" "}
                            aujourd’hui, soit environ{" "}
                            <span className="font-semibold">
                              {lineExtraShares.toFixed(2)} parts
                            </span>{" "}
                            supplémentaires.
                          </p>
                        </>
                      ) : (
                        <p className="text-gray-400">
                          Sélectionnez une ligne pour voir le calcul
                          d’objectif.
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleSaveLineGoal}
                    disabled={savingLineGoal || !selectedHolding}
                    className="mt-3 inline-flex items-center justify-center px-4 py-2 rounded-full text-xs font-medium bg-[#0F1013] text-white hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {savingLineGoal
                      ? "Enregistrement..."
                      : "Enregistrer cet objectif de ligne"}
                  </button>

                  {lineGoalMessage && (
                    <p className="text-[11px] text-gray-500 mt-2">
                      {lineGoalMessage}
                    </p>
                  )}
                </div>

                {/* Objectif par compte */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">
                        Objectif sur un compte
                      </h2>
                      <p className="text-xs text-gray-500">
                        Choisissez un compte, un montant cible et un rendement.
                      </p>
                    </div>
                    <div className="flex bg-gray-100 rounded-full p-1 text-[11px]">
                      <button
                        onClick={() => setAllocationMode("current")}
                        className={`px-3 py-1 rounded-full transition ${
                          allocationMode === "current"
                            ? "bg-white shadow-sm text-gray-900"
                            : "text-gray-500"
                        }`}
                      >
                        Proportions actuelles
                      </button>
                      <button
                        onClick={() => setAllocationMode("target")}
                        className={`px-3 py-1 rounded-full transition ${
                          allocationMode === "target"
                            ? "bg-white shadow-sm text-gray-900"
                            : "text-gray-500"
                        }`}
                      >
                        Répartition cible
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="space-y-1">
                      <label className="text-gray-600">Compte</label>
                      <select
                        value={selectedAccountId}
                        onChange={(e) => {
                          setSelectedAccountId(e.target.value);
                          setAccountGoalMessage("");
                        }}
                        className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                      >
                        <option value="">Sélectionner un compte…</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name || "Compte"}{" "}
                            {a.type ? `• ${a.type}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-gray-600">
                          Montant cible
                        </label>
                        <input
                          type="number"
                          value={accountTargetAmount}
                          onChange={(e) =>
                            setAccountTargetAmount(e.target.value)
                          }
                          className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                          placeholder="ex : 20000"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-gray-600">
                          Durée (années)
                        </label>
                        <input
                          type="number"
                          value={accountYears}
                          onChange={(e) => setAccountYears(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                          placeholder="ex : 10"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-gray-600">
                          Rendement (%/an)
                        </label>
                        <input
                          type="number"
                          value={accountReturnInput}
                          onChange={(e) =>
                            setAccountReturnInput(e.target.value)
                          }
                          className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                          placeholder={
                            allocationMode === "current"
                              ? autoReturnCurrent !== null
                                ? `ex : ${autoReturnCurrent.toFixed(1)}`
                                : "ex : 6"
                              : autoReturnTarget !== null
                              ? `ex : ${autoReturnTarget.toFixed(1)}`
                              : "ex : 6"
                          }
                        />
                        {selectedAccount && (
                          <p className="text-[10px] text-gray-400">
                            Rendement estimé du compte :{" "}
                            {allocationMode === "current"
                              ? autoReturnCurrent !== null
                                ? `${autoReturnCurrent.toFixed(
                                    1
                                  )} % (moyenne pondérée des lignes actuelles)`
                                : "non disponible"
                              : autoReturnTarget !== null
                              ? `${autoReturnTarget.toFixed(
                                  1
                                )} % (pondéré par la répartition cible)`
                              : "saisissez une répartition cible pour estimer."}
                          </p>
                        )}
                      </div>
                    </div>

                    {selectedAccount && (
                      <>
                        <p className="text-xs text-gray-700">
                          Valeur actuelle du compte :{" "}
                          <span className="font-semibold">
                            {formatCurrency0(accountCurrentValue)}
                          </span>
                        </p>
                        <p className="text-xs text-gray-700">
                          Capital supplémentaire total estimé à investir
                          aujourd’hui pour viser{" "}
                          {formatCurrency0(
                            toNumber(accountTargetAmount)
                          )}{" "}
                          dans {toNumber(accountYears) || 0} ans avec{" "}
                          {effectiveAccountReturn.toFixed(1)} %/an :{" "}
                          <span className="font-semibold">
                            {formatCurrency0(accountExtraNow)}
                          </span>
                          .
                        </p>
                      </>
                    )}

                    {/* Répartition par ligne */}
                    {selectedAccount && (
                      <div className="border-t border-gray-100 pt-3 mt-2 space-y-2">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">
                          Répartition par ligne :
                        </p>
                        {accountHoldings.length === 0 ? (
                          <p className="text-xs text-gray-400">
                            Aucun placement sur ce compte.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {accountHoldings.map((h) => {
                              const row = accountAllocationRows.find(
                                (r) => r.holding.id === h.id
                              );
                              const currentWeight =
                                accountCurrentValue > 0
                                  ? (h.currentValue / accountCurrentValue) *
                                    100
                                  : 0;

                              const targetValue = targetWeights[h.id] || "";

                              return (
                                <div
                                  key={h.id}
                                  className="flex justify-between items-start text-xs"
                                >
                                  <div>
                                    <p className="font-medium text-gray-800">
                                      {h.instrumentName ||
                                        h.asset_label ||
                                        "Placement"}
                                    </p>
                                    <p className="text-[11px] text-gray-500">
                                      {formatCurrency0(h.currentValue)} • poids{" "}
                                      {currentWeight.toFixed(1)} %
                                    </p>

                                    {allocationMode === "target" && (
                                      <div className="mt-1 flex items-center gap-2">
                                        <span className="text-[11px] text-gray-500">
                                          Cible :
                                        </span>
                                        <input
                                          type="number"
                                          value={targetValue}
                                          onChange={(e) =>
                                            handleTargetWeightChange(
                                              h.id,
                                              e.target.value
                                            )
                                          }
                                          className="w-20 rounded-full border border-gray-200 px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                                          placeholder="ex : 33"
                                        />
                                        <span className="text-[11px] text-gray-500">
                                          %
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right text-[11px] text-gray-600">
                                    {row ? (
                                      <>
                                        <p>
                                          +{" "}
                                          {row.extraParts.toFixed(2)} parts (
                                          {formatCurrency0(
                                            row.extraAmount
                                          )}
                                          )
                                        </p>
                                      </>
                                    ) : (
                                      <p className="text-gray-400">
                                        {accountExtraNow <= 0
                                          ? "Aucun apport nécessaire."
                                          : "Aucune répartition calculée."}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleSaveAccountGoal}
                    disabled={savingAccountGoal || !selectedAccount}
                    className="mt-3 inline-flex items-center justify-center px-4 py-2 rounded-full text-xs font-medium bg-[#0F1013] text-white hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {savingAccountGoal
                      ? "Enregistrement..."
                      : "Enregistrer cet objectif de compte"}
                  </button>

                  {accountGoalMessage && (
                    <p className="text-[11px] text-gray-500 mt-2">
                      {accountGoalMessage}
                    </p>
                  )}
                </div>
              </section>
            </>
          )}
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

function ScenarioCard({ title, scenario, onChange, accent }) {
  return (
    <div
      className={`rounded-2xl border p-5 flex flex-col gap-3 ${
        accent
          ? "border-[#D4AF37] bg-[#FFFBEB]"
          : "border-gray-200 bg-gray-50"
      }`}
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
            placeholder="ex : 5000"
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
            placeholder="ex : 200"
          />
        </div>
        <div className="space-y-1">
          <label className="text-gray-600">Durée (années)</label>
          <input
            type="number"
            value={scenario.years}
            onChange={(e) => onChange("years", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            placeholder="ex : 15"
          />
        </div>
        <div className="space-y-1">
          <label className="text-gray-600">Rendement annuel (%)</label>
          <input
            type="number"
            value={scenario.annualReturnPct}
            onChange={(e) =>
              onChange("annualReturnPct", e.target.value)
            }
            className="w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            placeholder="ex : 7"
          />
        </div>
      </div>
    </div>
  );
}
