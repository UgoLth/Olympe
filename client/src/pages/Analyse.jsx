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
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { motion } from "framer-motion";

// 🎨 Chart.js
import { Line, Doughnut, Radar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler,
} from "chart.js";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadialLinearScale,
  Filler
);

const toNumber = (v) =>
  v === null || v === undefined || v === "" ? 0 : Number(v);

// % de perf entre un prix courant et un prix de référence
const computeReturnPct = (current, reference) => {
  const c = toNumber(current);
  const r = toNumber(reference);
  if (!c || !r || r <= 0) return 0;
  const value = ((c - r) / r) * 100;
  return Number.isFinite(value) ? value : 0;
};

// Même logique que dans Portfolio
const categorizePosition = (accountType, assetClass) => {
  const norm = (s) => (s || "").toLowerCase();

  const t = norm(accountType);
  const a = norm(assetClass);

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

  if (a.includes("crypto")) return "Crypto";
  if (a.includes("cash")) return "Liquidités";
  if (
    a.includes("equity") ||
    a.includes("stock") ||
    a.includes("etf") ||
    a.includes("fund")
  )
    return "Investissements";

  return "Autres";
};

// 🎨 Palette sans bleu ni orange
const palette = {
  Liquidités: "#111827", // noir très foncé
  Épargne: "#D4AF37", // or
  Investissements: "#4B5563", // gris foncé
  Crypto: "#9CA3AF", // gris clair
  Autres: "#6B7280", // gris moyen
};

// Traduction des labels de type de compte
const translateAccountTypeLabel = (label) => {
  const l = (label || "").toLowerCase();

  if (l.includes("invest")) return "Investissement";
  if (l.includes("saving") || l.includes("épargne") || l.includes("epargne"))
    return "Épargne";
  if (l.includes("cash") || l.includes("courant") || l.includes("current"))
    return "Liquidités";

  return label || "Autre";
};

// ---------- Helpers pour le graph ----------

// format court JJ/MM
const formatDateShort = (d) => {
  if (!(d instanceof Date)) d = new Date(d);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
};

// Construit la série à afficher selon le mode choisi
// history = [{date: Date, value: number}]
const buildHistoryDataset = (history, mode) => {
  if (!history || history.length === 0) return null;

  const sorted = [...history].sort((a, b) => a.date - b.date);

  // 🔹 JOURNALIER : derniers 60 jours
  if (mode === "day") {
    const last = sorted.slice(-60);
    return {
      labels: last.map((p, i) => {
        if (i === last.length - 1) return "Aujourd’hui";
        if (i === last.length - 2) return "Hier";
        return formatDateShort(p.date);
      }),
      datasets: [
        {
          label: "Valeur du portefeuille (€)",
          data: last.map((p) => p.value),
          tension: 0.35,
          fill: true,
          borderWidth: 2,
          borderColor: "#D4AF37",
          backgroundColor: "rgba(212,175,55,0.10)",
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: "#D4AF37",
        },
      ],
    };
  }

  // 🔹 HEBDO : 7 DERNIERS JOURS glissants
  if (mode === "week") {
    const last7 = sorted.slice(-7);

    return {
      labels: last7.map((p) => formatDateShort(p.date)),
      datasets: [
        {
          label: "Valeur du portefeuille (€)",
          data: last7.map((p) => p.value),
          tension: 0.35,
          fill: true,
          borderWidth: 2,
          borderColor: "#D4AF37",
          backgroundColor: "rgba(212,175,55,0.10)",
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#D4AF37",
        },
      ],
    };
  }

  // 🔹 MENSUEL : 30 DERNIERS JOURS glissants
  if (mode === "month") {
    const last30 = sorted.slice(-30);

    return {
      labels: last30.map((p) => formatDateShort(p.date)),
      datasets: [
        {
          label: "Valeur du portefeuille (€)",
          data: last30.map((p) => p.value),
          tension: 0.35,
          fill: true,
          borderWidth: 2,
          borderColor: "#D4AF37",
          backgroundColor: "rgba(212,175,55,0.10)",
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#D4AF37",
        },
      ],
    };
  }

  // 🔹 ANNUEL : agrégation par mois (dernière valeur de chaque mois)
  if (mode === "year") {
    const buckets = {};

    sorted.forEach((p) => {
      const d = new Date(p.date);
      const key = `${d.getFullYear()}-${(d.getMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
      buckets[key] = p.value; // on garde la dernière valeur du mois
    });

    const keys = Object.keys(buckets).sort();

    return {
      labels: keys,
      datasets: [
        {
          label: "Valeur du portefeuille (€)",
          data: keys.map((k) => buckets[k]),
          tension: 0.35,
          fill: true,
          borderWidth: 2,
          borderColor: "#D4AF37",
          backgroundColor: "rgba(212,175,55,0.10)",
          pointRadius: 3,
          pointHoverRadius: 4,
          pointBackgroundColor: "#D4AF37",
        },
      ],
    };
  }

  // 🔹 DEPUIS LE DÉBUT : on affiche tous les jours connus
  if (mode === "all") {
    return {
      labels: sorted.map((p) => formatDateShort(p.date)),
      datasets: [
        {
          label: "Valeur du portefeuille (€)",
          data: sorted.map((p) => p.value),
          tension: 0.35,
          fill: true,
          borderWidth: 2,
          borderColor: "#D4AF37",
          backgroundColor: "rgba(212,175,55,0.10)",
          pointRadius: 2,
          pointHoverRadius: 3,
          pointBackgroundColor: "#D4AF37",
        },
      ],
    };
  }

  return null;
};

export default function Analyse() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");

  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState({
    totalValue: 0,
    totalReturnPct: 0,
    ytdReturnPct: 0,
    monthReturnPct: 0,
    dailyChangePct: 0,
    nbAccounts: 0,
    nbHoldings: 0,
  });

  const [assetAllocations, setAssetAllocations] = useState([]); // camembert
  const [accountTypeAllocations, setAccountTypeAllocations] = useState([]); // barres
  const [holdings, setHoldings] = useState([]); // holdings détaillées

  // 🔹 historique quotidien complet depuis création du compte
  const [portfolioHistory, setPortfolioHistory] = useState([]); // [{date, value}]
  const [historyMode, setHistoryMode] = useState("day"); // "day" | "week" | "month" | "year" | "all"

  // 🔹 historique des prix par instrument pour la comparaison
  const [instrumentHistoryMap, setInstrumentHistoryMap] = useState({});

  // 🔹 holdings sélectionnées pour la comparaison
  const [selectedHolding1, setSelectedHolding1] = useState("");
  const [selectedHolding2, setSelectedHolding2] = useState("");

  // 🔹 paramètres de comparaison
  const [comparisonValueMode, setComparisonValueMode] = useState("value"); // "value" | "perf"
  const [comparisonMode, setComparisonMode] = useState("all"); // "week" | "month" | "year" | "all" | "custom"
  const [comparisonStartDate, setComparisonStartDate] = useState("");
  const [comparisonEndDate, setComparisonEndDate] = useState("");

  const sortedPortfolioHistory = useMemo(
    () => [...portfolioHistory].sort((a, b) => a.date - b.date),
    [portfolioHistory]
  );

  // ---------- AUTH + INIT ----------
  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate("/");
        return;
      }
      setUserEmail(data.user.email || "");
      await loadAnalytics(data.user.id);
    };
    init();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("olympe_remember_me");
    navigate("/");
  };

  // ---------- CHARGEMENT DES DONNÉES ----------
  const loadAnalytics = async (userId) => {
    setLoading(true);
    try {
      // 1) comptes
      const { data: accounts, error: accError } = await supabase
        .from("accounts")
        .select(
          "id, user_id, name, type, currency, initial_amount, current_amount, created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (accError) throw accError;

      // 2) holdings
      const { data: holdingsData, error: holdError } = await supabase
        .from("holdings")
        .select(
          "id, user_id, account_id, instrument_id, quantity, avg_buy_price, current_price, current_value, asset_label"
        )
        .eq("user_id", userId);

      if (holdError) throw holdError;

      const accountsById = Object.fromEntries(
        (accounts || []).map((a) => [a.id, a])
      );

      // 3) instruments & prix historiques
      const instrumentIds = Array.from(
        new Set(
          (holdingsData || [])
            .map((h) => h.instrument_id)
            .filter((id) => !!id)
        )
      );

      let instrumentsById = {};
      let prev1dByInstrument = {};
      let prev30dByInstrument = {};
      let prevYtdByInstrument = {};
      let historicalPricesByInstrument = {};

      if (instrumentIds.length > 0) {
        const now = new Date();

        const earliestAccountDate =
          accounts && accounts.length > 0
            ? new Date(accounts[0].created_at)
            : now;

        const date1d = new Date(now);
        date1d.setDate(now.getDate() - 1);
        const iso1d = date1d.toISOString();

        const date30d = new Date(now);
        date30d.setDate(now.getDate() - 30);
        const iso30d = date30d.toISOString();

        // YTD : on part du 2 janvier de l'année courante
        const startOfYearDate = new Date(now.getFullYear(), 0, 2);
        const isoYtdStart = startOfYearDate.toISOString();

        // Historique pour le graph : depuis la création du compte
        const historyStartDate = new Date(earliestAccountDate);
        historyStartDate.setHours(0, 0, 0, 0);
        const isoHistoryStart = historyStartDate.toISOString();

        const { data: instruments, error: instError } = await supabase
          .from("instruments")
          .select("id, symbol, name, asset_class")
          .in("id", instrumentIds);

        if (instError) throw instError;

        instrumentsById = Object.fromEntries(
          (instruments || []).map((inst) => [inst.id, inst])
        );

        // J-1
        const { data: prices1d } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", iso1d)
          .order("fetched_at", { ascending: true });

        if (prices1d) {
          for (const p of prices1d) {
            const id = p.instrument_id;
            if (!prev1dByInstrument[id]) {
              prev1dByInstrument[id] = toNumber(p.price);
            }
          }
        }

        // 30 jours
        const { data: prices30d } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", iso30d)
          .order("fetched_at", { ascending: true });

        if (prices30d) {
          for (const p of prices30d) {
            const id = p.instrument_id;
            if (!prev30dByInstrument[id]) {
              prev30dByInstrument[id] = toNumber(p.price);
            }
          }
        }

        // YTD (depuis le 2 janvier)
        const { data: pricesYtd } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", isoYtdStart)
          .order("fetched_at", { ascending: true });

        if (pricesYtd) {
          for (const p of pricesYtd) {
            const id = p.instrument_id;
            if (!prevYtdByInstrument[id]) {
              prevYtdByInstrument[id] = toNumber(p.price);
            }
          }
        }

        // Historique complet depuis la création du compte
        const { data: historyPrices } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", isoHistoryStart)
          .order("fetched_at", { ascending: true });

        if (historyPrices) {
          for (const p of historyPrices) {
            const id = p.instrument_id;
            if (!historicalPricesByInstrument[id]) {
              historicalPricesByInstrument[id] = [];
            }
            historicalPricesByInstrument[id].push({
              date: new Date(p.fetched_at),
              price: toNumber(p.price),
            });
          }
        }
      }

      // -------- LIGNES DE PORTEFEUILLE ----------
      let totalHoldingsValue = 0;
      let totalHoldingsInvested = 0;

      const computedHoldings = (holdingsData || []).map((h) => {
        const instrument = instrumentsById[h.instrument_id] || {};
        const account = accountsById[h.account_id] || {};

        const quantity = toNumber(h.quantity);
        const currentPrice = toNumber(h.current_price);
        const avgBuy = toNumber(h.avg_buy_price);

        const value =
          h.current_value !== null && h.current_value !== undefined
            ? toNumber(h.current_value)
            : quantity * currentPrice;

        const invested = quantity * avgBuy;

        totalHoldingsValue += value;
        totalHoldingsInvested += invested;

        const prev1d = prev1dByInstrument[h.instrument_id] || 0;
        const prev30d = prev30dByInstrument[h.instrument_id] || 0;
        const prevYtd = prevYtdByInstrument[h.instrument_id] || 0;

        const dailyChangePct = computeReturnPct(currentPrice, prev1d);
        const monthlyChangePct = computeReturnPct(currentPrice, prev30d);
        const ytdChangePct = computeReturnPct(currentPrice, prevYtd);

        return {
          id: h.id,
          name: h.asset_label || instrument.name || instrument.symbol || "—",
          ticker: instrument.symbol || "",
          account: account.name || "—",
          accountType: account.type || "",
          accountId: h.account_id,
          quantity,
          value,
          invested,
          dailyChangePct,
          monthlyChangePct,
          ytdChangePct,
          allocationPct: 0,
          assetClass: instrument.asset_class || null,
          instrumentId: h.instrument_id, // 👈 pour la comparaison
        };
      });

      // comptes sans holdings
      const accountsWithHoldings = new Set(
        (holdingsData || []).map((h) => h.account_id)
      );
      const standaloneAccounts = (accounts || []).filter(
        (a) => !accountsWithHoldings.has(a.id)
      );

      let totalStandaloneValue = 0;
      let totalStandaloneInvested = 0;

      standaloneAccounts.forEach((a) => {
        totalStandaloneValue += toNumber(a.current_amount);
        totalStandaloneInvested += toNumber(a.initial_amount);
      });

      // -------- HISTORIQUE QUOTIDIEN COMPLET ----------
      const dailyHistory = [];
      if (
        (holdingsData && holdingsData.length > 0) ||
        standaloneAccounts.length > 0
      ) {
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        const earliestAccountDate =
          accounts && accounts.length > 0
            ? new Date(accounts[0].created_at)
            : now;

        earliestAccountDate.setHours(0, 0, 0, 0);

        const msPerDay = 24 * 60 * 60 * 1000;
        const daysDiff = Math.floor(
          (now.getTime() - earliestAccountDate.getTime()) / msPerDay
        );

        for (let offset = daysDiff; offset >= 0; offset--) {
          const dayDate = new Date(now);
          dayDate.setHours(23, 59, 59, 999);
          dayDate.setDate(now.getDate() - offset);

          let portfolioValueForDay = 0;

          // Valeur des holdings à cette date
          (holdingsData || []).forEach((h) => {
            const quantity = toNumber(h.quantity);
            if (!quantity || !h.instrument_id) return;

            const historyList =
              (historicalPricesByInstrument &&
                historicalPricesByInstrument[h.instrument_id]) ||
              [];

            let priceForDay = 0;

            if (historyList.length > 0) {
              // dernière quote <= fin de la journée
              for (let idx = historyList.length - 1; idx >= 0; idx--) {
                if (historyList[idx].date <= dayDate) {
                  priceForDay = historyList[idx].price;
                  break;
                }
              }
              // si rien avant : première quote connue
              if (!priceForDay) {
                priceForDay = historyList[0].price;
              }
            } else {
              // fallback : current_price
              priceForDay = toNumber(h.current_price);
            }

            portfolioValueForDay += quantity * priceForDay;
          });

          // Valeur des comptes "standalone" (épargne/cash)
          standaloneAccounts.forEach((a) => {
            portfolioValueForDay += toNumber(a.current_amount);
          });

          dailyHistory.push({
            date: new Date(dayDate),
            value: portfolioValueForDay,
          });
        }
      }

      const totalValue = totalHoldingsValue + totalStandaloneValue;
      const totalInvested = totalHoldingsInvested + totalStandaloneInvested;

      const holdingsWithAllocation = computedHoldings.map((h) => ({
        ...h,
        allocationPct:
          totalValue > 0 ? Math.round((h.value / totalValue) * 100) : 0,
      }));

      // -------- CAMEMBERT PAR CATÉGORIE ----------
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

      // -------- RÉPARTITION PAR TYPE DE COMPTE ----------
      const accountValueMap = {};
      (accounts || []).forEach((a) => {
        accountValueMap[a.id] = 0;
      });

      holdingsWithAllocation.forEach((h) => {
        if (accountValueMap[h.accountId] === undefined) {
          accountValueMap[h.accountId] = 0;
        }
        accountValueMap[h.accountId] += h.value;
      });

      standaloneAccounts.forEach((a) => {
        accountValueMap[a.id] =
          (accountValueMap[a.id] || 0) + toNumber(a.current_amount);
      });

      const totalAccountsValue = Object.values(accountValueMap).reduce(
        (sum, v) => sum + v,
        0
      );

      const accountTypeTotals = {};
      (accounts || []).forEach((a) => {
        const typeLabel = a.type || "Autre";
        const accVal = accountValueMap[a.id] || 0;
        if (!accountTypeTotals[typeLabel]) accountTypeTotals[typeLabel] = 0;
        accountTypeTotals[typeLabel] += accVal;
      });

      const computedAccountTypeAlloc = Object.entries(accountTypeTotals)
        .map(([label, amount]) => ({
          label,
          percent:
            totalAccountsValue > 0
              ? Math.round((amount / totalAccountsValue) * 100)
              : 0,
        }))
        .sort((a, b) => b.percent - a.percent);

      // -------- VARIATIONS PORTFEUILLE ----------
      let portfolioDaily = 0;
      let portfolioMonthly = 0;
      let portfolioYtd = 0;

      if (totalValue > 0) {
        holdingsWithAllocation.forEach((h) => {
          const weight = h.value / totalValue;
          portfolioDaily += weight * h.dailyChangePct;
          portfolioMonthly += weight * h.monthlyChangePct;
          portfolioYtd += weight * h.ytdChangePct;
        });

        portfolioDaily = Math.round(portfolioDaily * 10) / 10;
        portfolioMonthly = Math.round(portfolioMonthly * 10) / 10;
        portfolioYtd = Math.round(portfolioYtd * 10) / 10;
      }

      const totalReturnPct =
        totalInvested > 0
          ? Math.round(((totalValue - totalInvested) / totalInvested) * 1000) /
            10
          : 0;

      setHoldings(holdingsWithAllocation);
      setAssetAllocations(computedAllocations);
      setAccountTypeAllocations(computedAccountTypeAlloc);
      setPortfolioHistory(dailyHistory);
      setInstrumentHistoryMap(historicalPricesByInstrument); // 👈 pour les comparaisons

      setSummary({
        totalValue,
        totalReturnPct,
        ytdReturnPct: portfolioYtd,
        monthReturnPct: portfolioMonthly,
        dailyChangePct: portfolioDaily,
        nbAccounts: (accounts || []).length,
        nbHoldings: (holdingsData || []).length,
      });
    } catch (err) {
      console.error("Erreur lors du chargement de l'analyse :", err);
    } finally {
      setLoading(false);
    }
  };

  // ---------- FORMATAGE ----------
  const formatCurrency = (value) =>
    new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value || 0);

  const totalValueDisplay = formatCurrency(summary.totalValue);

  // ---------- DATA CAMEMBERT ----------
  const hasAllocations =
    assetAllocations.length > 0 &&
    assetAllocations.some((a) => a.percent > 0);

  const doughnutData = {
    labels: assetAllocations.map((a) => a.label),
    datasets: [
      {
        data: assetAllocations.map((a) => a.percent),
        backgroundColor: assetAllocations.map((a) => a.color),
        borderWidth: 4,
        borderColor: "#F9FAFB",
        hoverOffset: 8,
        borderRadius: 6,
        spacing: 2,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    plugins: {
      legend: { display: false },
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

  // ---------- COURBE (avec multi-périodes) ----------
  const performanceHistoryData = buildHistoryDataset(
    portfolioHistory,
    historyMode
  );

  const historyModeLabel = {
    day: "Journalier",
    week: "Hebdomadaire",
    month: "Mensuel",
    year: "Annuel",
    all: "Depuis le début",
  }[historyMode];

  const performanceHistoryOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0F1013",
        titleColor: "#F9FAFB",
        bodyColor: "#E5E7EB",
        padding: 10,
        cornerRadius: 12,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: "#9CA3AF",
          font: { size: 11 },
          maxRotation: 0,
          autoSkipPadding: 10,
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

  // ---------- ANALYSE DU RISQUE (calculs réels) ----------

  // petit helper pour l'écart-type
  const stdDev = (arr) => {
    if (!arr || arr.length === 0) return 0;
    const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
    const variance =
      arr.reduce((s, x) => s + (x - mean) * (x - mean), 0) / arr.length;
    return Math.sqrt(variance);
  };

  // 1) Volatilité : écart-type des rendements journaliers (%)
  const sortedHistory = [...portfolioHistory].sort(
    (a, b) => a.date - b.date
  );
  const dailyReturns = [];
  for (let i = 1; i < sortedHistory.length; i++) {
    const prev = sortedHistory[i - 1].value;
    const curr = sortedHistory[i].value;
    if (prev > 0) {
      dailyReturns.push((curr / prev - 1) * 100);
    }
  }
  const volatilityPct = stdDev(dailyReturns); // en %
  let volatilityScore = 0;
  if (volatilityPct === 0) {
    volatilityScore = 0;
  } else if (volatilityPct < 0.5) {
    volatilityScore = 1;
  } else if (volatilityPct < 1) {
    volatilityScore = 2;
  } else if (volatilityPct < 1.5) {
    volatilityScore = 3;
  } else if (volatilityPct < 2.5) {
    volatilityScore = 4;
  } else {
    volatilityScore = 5;
  }
  const volatilityLabel =
    volatilityScore <= 2
      ? "Volatilité faible"
      : volatilityScore === 3
      ? "Volatilité moyenne"
      : "Volatilité élevée";

  // 2) Max drawdown : plus grosse baisse entre un plus haut et le creux suivant
  let maxDrawdown = 0; // en %
  if (sortedHistory.length > 0) {
    let peak = sortedHistory[0].value;
    for (let i = 1; i < sortedHistory.length; i++) {
      const v = sortedHistory[i].value;
      if (v > peak) peak = v;
      const dd = (v / peak - 1) * 100; // négatif en cas de baisse
      if (dd < maxDrawdown) maxDrawdown = dd;
    }
  }
  const maxDrawdownPct = Math.round(maxDrawdown * 10) / 10;

  // 3) Diversification : basé sur le poids de la plus grosse ligne
  const maxWeightPct =
    holdings.length > 0
      ? holdings.reduce(
          (m, h) => (h.allocationPct > m ? h.allocationPct : m),
          0
        )
      : 0;
  let diversificationScore = 0;
  if (maxWeightPct === 0) {
    diversificationScore = 0;
  } else if (maxWeightPct > 60) {
    diversificationScore = 1;
  } else if (maxWeightPct > 40) {
    diversificationScore = 2;
  } else if (maxWeightPct > 25) {
    diversificationScore = 3;
  } else if (maxWeightPct > 15) {
    diversificationScore = 4;
  } else {
    diversificationScore = 5;
  }
  const diversificationLabel =
    diversificationScore <= 2
      ? "Portefeuille peu diversifié"
      : diversificationScore === 3
      ? "Portefeuille moyennement diversifié"
      : "Portefeuille bien diversifié";

  // 4) Liquidité : % de liquidités dans le donut
  const cashEntry =
    assetAllocations.find((a) => a.label === "Liquidités") || null;
  const cashPct = cashEntry ? cashEntry.percent : 0;
  let liquidityScore = 0;
  if (cashPct === 0) {
    liquidityScore = 0;
  } else if (cashPct < 5) {
    liquidityScore = 2; // très peu de cash
  } else if (cashPct < 20) {
    liquidityScore = 4;
  } else if (cashPct < 50) {
    liquidityScore = 5;
  } else {
    liquidityScore = 3; // beaucoup de cash -> très liquide mais peu investi
  }

  // 5) Horizon long terme : % d'investissements
  const investEntry =
    assetAllocations.find((a) => a.label === "Investissements") || null;
  const investPct = investEntry ? investEntry.percent : 0;
  let horizonScore = 0;
  if (investPct === 0) {
    horizonScore = 0;
  } else if (investPct < 20) {
    horizonScore = 2;
  } else if (investPct < 50) {
    horizonScore = 3;
  } else if (investPct < 80) {
    horizonScore = 4;
  } else {
    horizonScore = 5;
  }

  // 6) Niveau de risque global (mélange volatilité + drawdown)
  const ddSeverity =
    maxDrawdownPct === 0
      ? 1
      : Math.abs(maxDrawdownPct) > 25
      ? 5
      : Math.abs(maxDrawdownPct) > 15
      ? 4
      : Math.abs(maxDrawdownPct) > 8
      ? 3
      : 2;

  const riskLevelScore = (volatilityScore + ddSeverity) / 2 || 0;

  let globalLabel = "Risque indéterminé";
  if (riskLevelScore <= 2) {
    globalLabel = "Risque faible";
  } else if (riskLevelScore <= 3) {
    globalLabel = "Risque modéré";
  } else if (riskLevelScore <= 4) {
    globalLabel = "Risque dynamique";
  } else {
    globalLabel = "Risque élevé";
  }

  const riskProfile = {
    globalLabel,
    volatilityLabel,
    maxDrawdownPct,
    diversificationLabel,
  };

  const riskRadarData = {
    labels: ["Volatilité", "Diversification", "Liquidité", "Horizon long terme"],
    datasets: [
      {
        label: "Profil de risque",
        data: [
          volatilityScore,
          diversificationScore,
          liquidityScore,
          horizonScore,
        ],
        borderColor: "#D4AF37",
        backgroundColor: "rgba(212,175,55,0.16)",
        borderWidth: 2,
        pointBackgroundColor: "#D4AF37",
        pointRadius: 3,
      },
    ],
  };

  const riskRadarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      r: {
        angleLines: { color: "#E5E7EB" },
        grid: { color: "#E5E7EB" },
        suggestedMin: 0,
        suggestedMax: 5,
        ticks: { display: false },
        pointLabels: {
          color: "#4B5563",
          font: { size: 10 },
        },
      },
    },
  };

  // ---------- TOP LIGNES POUR LA TABLE ----------
  const classifyVolatility = (monthlyChangePct) => {
    const vol = Math.abs(monthlyChangePct || 0);
    if (vol < 2) return "Faible";
    if (vol < 8) return "Moyenne";
    return "Élevée";
  };

  const holdingsAnalysisRows = holdings
    .slice()
    .sort((a, b) => b.allocationPct - a.allocationPct)
    .slice(0, 5)
    .map((h) => ({
      name: h.name,
      ticker: h.ticker,
      weightPct: h.allocationPct,
      perfPct: Math.round(h.monthlyChangePct * 10) / 10,
      volatility: classifyVolatility(h.monthlyChangePct),
    }));

  const bestHolding =
    holdings.length > 0
      ? holdings.reduce(
          (best, h) =>
            best === null || h.monthlyChangePct > best.monthlyChangePct
              ? h
              : best,
          null
        )
      : null;

  const worstHolding =
    holdings.length > 0
      ? holdings.reduce(
          (worst, h) =>
            worst === null || h.monthlyChangePct < worst.monthlyChangePct
              ? h
              : worst,
          null
        )
      : null;

  // ---------- COMPARAISON DE LIGNES ----------

  // helper : construit la série de valeur pour une holding à partir d'une liste de dates
  const buildHoldingSeriesForComparison = (holding, basePoints) => {
    if (!holding || !basePoints || !basePoints.length) return null;
    if (!holding.instrumentId) return null;

    const priceHistory = instrumentHistoryMap[holding.instrumentId];
    if (!priceHistory || !priceHistory.length) return null;

    const sortedPriceHistory = [...priceHistory].sort(
      (a, b) => a.date - b.date
    );

    const data = [];
    let j = 0;
    let lastPrice = sortedPriceHistory[0].price;

    basePoints.forEach((point) => {
      const dayDate = point.date;

      while (
        j < sortedPriceHistory.length &&
        sortedPriceHistory[j].date <= dayDate
      ) {
        lastPrice = sortedPriceHistory[j].price;
        j++;
      }

      data.push(holding.quantity * lastPrice);
    });

    return data;
  };

  // 1) Construire la liste de dates utilisée pour la comparaison
  let comparisonPoints = sortedPortfolioHistory;

  if (sortedPortfolioHistory.length > 0) {
    if (comparisonMode === "week") {
      const last =
        sortedPortfolioHistory[sortedPortfolioHistory.length - 1].date;
      const start = new Date(last);
      start.setDate(start.getDate() - 6); // 7 jours glissants
      comparisonPoints = sortedPortfolioHistory.filter(
        (p) => p.date >= start && p.date <= last
      );
    } else if (comparisonMode === "month") {
      const last =
        sortedPortfolioHistory[sortedPortfolioHistory.length - 1].date;
      const start = new Date(last);
      start.setDate(start.getDate() - 29); // 30 jours glissants
      comparisonPoints = sortedPortfolioHistory.filter(
        (p) => p.date >= start && p.date <= last
      );
    } else if (comparisonMode === "year") {
      const last =
        sortedPortfolioHistory[sortedPortfolioHistory.length - 1].date;
      const start = new Date(last);
      start.setDate(start.getDate() - 364); // ~1 an
      comparisonPoints = sortedPortfolioHistory.filter(
        (p) => p.date >= start && p.date <= last
      );
    } else if (comparisonMode === "custom") {
      const start = comparisonStartDate ? new Date(comparisonStartDate) : null;
      const end = comparisonEndDate ? new Date(comparisonEndDate) : null;
      comparisonPoints = sortedPortfolioHistory.filter((p) => {
        const d = p.date;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    } else {
      // "all"
      comparisonPoints = sortedPortfolioHistory;
    }
  }

  const comparisonLabels = comparisonPoints.map((p) =>
    formatDateShort(p.date)
  );

  const selectedObj1 = holdings.find(
    (h) => String(h.id) === String(selectedHolding1)
  );
  const selectedObj2 = holdings.find(
    (h) => String(h.id) === String(selectedHolding2)
  );

  // 2) Séries en VALEUR €
  const series1Raw = selectedObj1
    ? buildHoldingSeriesForComparison(selectedObj1, comparisonPoints)
    : null;
  const series2Raw = selectedObj2
    ? buildHoldingSeriesForComparison(selectedObj2, comparisonPoints)
    : null;

  // 3) Option : normaliser en PERFORMANCE % depuis le 1er point
  const normalizeToPerf = (series) => {
    if (!series || !series.length) return null;
    const base = series[0];
    if (!base || base <= 0) return null;
    return series.map((v) => ((v / base - 1) * 100));
  };

  const series1 =
    comparisonValueMode === "value" ? series1Raw : normalizeToPerf(series1Raw);
  const series2 =
    comparisonValueMode === "value" ? series2Raw : normalizeToPerf(series2Raw);

  const comparisonData =
    (series1 && series1.length) || (series2 && series2.length)
      ? {
          labels: comparisonLabels,
          datasets: [
            ...(series1
              ? [
                  {
                    label: selectedObj1 ? selectedObj1.name : "Ligne 1",
                    data: series1,
                    tension: 0.35,
                    fill: false,
                    borderWidth: 2,
                    borderColor: "#D4AF37",
                    pointRadius: 0,
                  },
                ]
              : []),
            ...(series2
              ? [
                  {
                    label: selectedObj2 ? selectedObj2.name : "Ligne 2",
                    data: series2,
                    tension: 0.35,
                    fill: false,
                    borderWidth: 2,
                    borderColor: "#4B5563",
                    pointRadius: 0,
                  },
                ]
              : []),
          ],
        }
      : null;

  const comparisonOptions = {
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
          label: (ctx) => {
            const v = ctx.parsed.y;
            if (comparisonValueMode === "value") {
              return `${ctx.dataset.label}: ${formatCurrency(v)}`;
            } else {
              return `${ctx.dataset.label}: ${v.toFixed(1)} %`;
            }
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: "#9CA3AF",
          font: { size: 11 },
          maxRotation: 0,
          autoSkipPadding: 10,
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
          callback: (value) => {
            if (comparisonValueMode === "value") {
              return new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
              }).format(value);
            }
            return `${value} %`;
          },
        },
      },
    },
  };

  // Variants pour les KPI (stagger)
  const kpiVariants = {
    hidden: { opacity: 0, y: 10 },
    show: (i) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.05 * i, duration: 0.3, ease: "easeOut" },
    }),
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
            active
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
              Analyse
            </p>
            <p className="text-sm text-gray-700">
              Comprendre la performance et le risque de votre portefeuille
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-gray-400">Valeur totale</p>
              <p className="text-sm font-semibold text-[#D4AF37]">
                {totalValueDisplay}
              </p>
            </div>
          </div>
        </header>

        <motion.div
          className="flex-1 p-6 overflow-y-auto space-y-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#D4AF37] animate-spin" />
              <span>Chargement de l’analyse…</span>
            </div>
          ) : (
            <>
              {/* 1️⃣ KPIs Performance globale */}
              <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  {
                    label: "Performance totale",
                    value: `${summary.totalReturnPct > 0 ? "+" : ""}${
                      summary.totalReturnPct
                    } %`,
                    subtitle: "Par rapport aux montants investis",
                    positive: summary.totalReturnPct >= 0,
                  },
                  {
                    label: "Performance YTD",
                    value: `${summary.ytdReturnPct > 0 ? "+" : ""}${
                      summary.ytdReturnPct
                    } %`,
                    subtitle: "Depuis le 2 janvier",
                    positive: summary.ytdReturnPct >= 0,
                  },
                  {
                    label: "Sur 30 jours",
                    value: `${summary.monthReturnPct > 0 ? "+" : ""}${
                      summary.monthReturnPct
                    } %`,
                    subtitle: "30 derniers jours",
                    positive: summary.monthReturnPct >= 0,
                  },
                  {
                    label: "Valeur du portefeuille",
                    value: totalValueDisplay,
                    subtitle: `${summary.nbAccounts} comptes • ${summary.nbHoldings} lignes`,
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

              {/* 2️⃣ Courbe + meilleure/pire ligne */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">
                        Évolution de la valeur du portefeuille
                      </h2>
                      <p className="text-xs text-gray-500">
                        Vue {historyModeLabel.toLowerCase()} de la valeur totale
                        estimée.
                      </p>
                    </div>

                    {/* Toggle de période */}
                    <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1 text-[11px]">
                      {[
                        { id: "day", label: "Jour" },
                        { id: "week", label: "Semaine" },
                        { id: "month", label: "Mois" },
                        { id: "year", label: "Année" },
                        { id: "all", label: "Depuis le début" },
                      ].map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setHistoryMode(m.id)}
                          className={`px-2.5 py-1 rounded-full transition text-[11px] ${
                            historyMode === m.id
                              ? "bg-white shadow-sm text-gray-900"
                              : "text-gray-500 hover:text-gray-900"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative flex-1 h-56">
                    {/* petite lumière dorée derrière le graph */}
                    <div className="absolute inset-x-6 bottom-0 h-24 bg-gradient-to-t from-[#F5E7B3] via-transparent to-transparent opacity-40 pointer-events-none" />
                    <div className="relative h-full">
                      {performanceHistoryData ? (
                        <Line
                          data={performanceHistoryData}
                          options={performanceHistoryOptions}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-400">
                          Impossible de calculer l’historique pour le moment.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800 mb-1">
                      Meilleure & pire ligne (30 jours)
                    </h2>
                    <p className="text-xs text-gray-500">
                      Basé sur la performance à 30 jours des lignes de votre
                      portefeuille.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="border border-emerald-100 rounded-xl p-3 bg-emerald-50/60">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-700 mb-1">
                        Meilleure ligne
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {bestHolding ? bestHolding.name : "—"}
                      </p>
                      <p className="text-xs text-emerald-700 mt-1">
                        {bestHolding
                          ? `+${Math.round(
                              bestHolding.monthlyChangePct * 10
                            ) / 10} %`
                          : "—"}
                      </p>
                    </div>

                    <div className="border border-red-100 rounded-xl p-3 bg-red-50/60">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-red-700 mb-1">
                        Pire ligne
                      </p>
                      <p className="text-sm font-semibold text-gray-900">
                        {worstHolding ? worstHolding.name : "—"}
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        {worstHolding
                          ? `${
                              Math.round(worstHolding.monthlyChangePct * 10) /
                              10
                            } %`
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Les performances sont calculées à partir des prix
                    enregistrés dans Olympe et sont fournies à titre
                    exclusivement pédagogique.
                  </p>
                </div>
              </section>

              {/* 2️⃣.bis Comparaison de lignes */}
              <section className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex flex-col gap-4 mb-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">
                        Comparer deux placements
                      </h2>
                      <p className="text-xs text-gray-500">
                        Visualisez l’évolution de la valeur ou de la
                        performance de chaque ligne.
                      </p>
                    </div>

                    {/* Sélection des 2 lignes */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-gray-500">
                          Ligne 1
                        </span>
                        <select
                          value={selectedHolding1}
                          onChange={(e) => setSelectedHolding1(e.target.value)}
                          className="text-xs border border-gray-200 rounded-full px-3 py-1.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                        >
                          <option value="">Choisir un placement…</option>
                          {holdings.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                              {h.ticker ? ` (${h.ticker})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-gray-500">
                          Ligne 2 (optionnel)
                        </span>
                        <select
                          value={selectedHolding2}
                          onChange={(e) => setSelectedHolding2(e.target.value)}
                          className="text-xs border border-gray-200 rounded-full px-3 py-1.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                        >
                          <option value="">
                            Aucune / comparer plus tard
                          </option>
                          {holdings.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                              {h.ticker ? ` (${h.ticker})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Toggle valeur / perf + période */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    {/* Valeur vs Perf */}
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-gray-500">Affichage :</span>
                      <div className="flex items-center bg-gray-100 rounded-full p-1">
                        <button
                          onClick={() => setComparisonValueMode("value")}
                          className={`px-3 py-1 rounded-full transition ${
                            comparisonValueMode === "value"
                              ? "bg-white shadow-sm text-gray-900"
                              : "text-gray-500"
                          }`}
                        >
                          Valeur (€)
                        </button>
                        <button
                          onClick={() => setComparisonValueMode("perf")}
                          className={`px-3 py-1 rounded-full transition ${
                            comparisonValueMode === "perf"
                              ? "bg-white shadow-sm text-gray-900"
                              : "text-gray-500"
                          }`}
                        >
                          Performance (%)
                        </button>
                      </div>
                    </div>

                    {/* Période */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-[11px]">
                      <span className="text-gray-500">Période :</span>
                      <div className="flex items-center bg-gray-100 rounded-full p-1">
                        {[
                          { id: "week", label: "7 j" },
                          { id: "month", label: "30 j" },
                          { id: "year", label: "1 an" },
                          { id: "all", label: "Tout" },
                          { id: "custom", label: "Perso" },
                        ].map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setComparisonMode(m.id)}
                            className={`px-2.5 py-1 rounded-full transition ${
                              comparisonMode === m.id
                                ? "bg-white shadow-sm text-gray-900"
                                : "text-gray-500"
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      {/* Dates personnalisées */}
                      {comparisonMode === "custom" && (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={comparisonStartDate}
                            onChange={(e) => {
                              setComparisonStartDate(e.target.value);
                              setComparisonMode("custom");
                            }}
                            className="text-xs border border-gray-200 rounded-full px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                          />
                          <span className="text-gray-400">→</span>
                          <input
                            type="date"
                            value={comparisonEndDate}
                            onChange={(e) => {
                              setComparisonEndDate(e.target.value);
                              setComparisonMode("custom");
                            }}
                            className="text-xs border border-gray-200 rounded-full px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="h-64">
                  {comparisonData ? (
                    <Line data={comparisonData} options={comparisonOptions} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400 text-center px-6">
                      Sélectionnez au moins une ligne et une période pour
                      afficher l’historique. En mode "Perso", vous pouvez
                      choisir une plage précise (par exemple du 2023-03-01 au
                      2023-05-31).
                    </div>
                  )}
                </div>
              </section>

              {/* 3️⃣ Diversification */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Camembert */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">
                        Répartition par classe d’actifs
                      </h2>
                      <p className="text-xs text-gray-500">
                        Actions, épargne, cryptos, liquidités…
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    {hasAllocations ? (
                      <>
                        <div className="relative h-56 w-56">
                          {/* halo */}
                          <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle_at_30%_0,#FDE68A_0,#FFFFFF_40%,#E5E7EB_80%)] opacity-40 blur-md pointer-events-none" />
                          <div className="relative h-full w-full">
                            <Doughnut
                              data={doughnutData}
                              options={doughnutOptions}
                            />
                          </div>
                        </div>

                        {/* Légende moderne sous le donut */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-md">
                          {assetAllocations.map((a) => (
                            <div
                              key={a.label}
                              className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2"
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: a.color }}
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-medium text-gray-800">
                                  {a.label}
                                </span>
                                <span className="text-[11px] text-gray-500">
                                  {a.percent} %
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="h-40 w-40 rounded-full border-4 border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-400 text-center px-4">
                        Aucune donnée suffisante pour afficher la répartition.
                      </div>
                    )}
                  </div>
                </div>

                {/* Par type de compte */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-800 mb-4">
                    Répartition par type de compte
                  </h2>

                  {accountTypeAllocations.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      Aucune donnée de compte disponible.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {accountTypeAllocations.map((acc) => (
                        <div key={acc.label} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-700">
                              {translateAccountTypeLabel(acc.label)}
                            </span>
                            <span className="text-gray-900 font-medium">
                              {acc.percent} %
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-[#6B7280]"
                              style={{ width: `${acc.percent}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
                    La valeur de chaque compte inclut les placements qu’il
                    contient ainsi que, le cas échéant, le solde en cash.
                  </p>
                </div>
              </section>

              {/* 4️⃣ Analyse du risque */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-2xl border border-gray-200 p-5 lg:col-span-2 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">
                        Profil de risque global
                      </h2>
                      <p className="text-xs text-gray-500">
                        Indicateurs de synthèse sur votre portefeuille.
                      </p>
                    </div>
                  </div>
                  <div className="flex-1 h-56">
                    <Radar data={riskRadarData} options={riskRadarOptions} />
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400 mb-1">
                      Résumé
                    </p>
                    <p className="text-sm font-semibold text-gray-900">
                      {riskProfile.globalLabel}
                    </p>
                  </div>

                  <div className="text-xs space-y-2 text-gray-600">
                    <p>
                      <span className="font-semibold">Volatilité : </span>
                      {riskProfile.volatilityLabel}.
                    </p>
                    <p>
                      <span className="font-semibold">
                        Baisse maximale observée :{" "}
                      </span>
                      {riskProfile.maxDrawdownPct} %.
                    </p>
                    <p>
                      <span className="font-semibold">Diversification : </span>
                      {riskProfile.diversificationLabel}.
                    </p>
                  </div>

                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Ces éléments sont indicatifs et ne constituent pas un
                    conseil en investissement. Ils ont pour but de vous aider à
                    mieux lire votre situation globale.
                  </p>
                </div>
              </section>

              {/* 5️⃣ Analyse des principales lignes */}
              <section className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">
                      Analyse des principales lignes
                    </h2>
                    <p className="text-xs text-gray-500">
                      Top 5 par poids dans le portefeuille.
                    </p>
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
                          Poids
                        </th>
                        <th className="text-right py-2 pr-4 font-medium">
                          Perf. 30 jours
                        </th>
                        <th className="text-right py-2 pr-4 font-medium">
                          Volatilité
                        </th>
                        <th className="text-left py-2 pr-0 font-medium">
                          Indicateur visuel
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdingsAnalysisRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-6 text-center text-xs text-gray-400"
                          >
                            Aucune ligne à analyser pour le moment.
                          </td>
                        </tr>
                      ) : (
                        holdingsAnalysisRows.map((h, index) => (
                          <motion.tr
                            key={h.name + h.ticker}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              delay: 0.03 * index,
                              duration: 0.2,
                            }}
                            className="group border-b border-gray-50 hover:bg-gray-50/60 transition"
                          >
                            <td className="py-2 pr-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-800">
                                  {h.name}
                                </span>
                                {h.ticker && (
                                  <span className="text-[11px] text-gray-400">
                                    {h.ticker}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 pr-4 text-xs text-gray-700">
                              {h.weightPct} %
                            </td>
                            <td className="py-2 pr-4 text-right text-xs">
                              <span
                                className={
                                  h.perfPct > 0
                                    ? "text-emerald-600"
                                    : h.perfPct < 0
                                    ? "text-red-500"
                                    : "text-gray-600"
                                }
                              >
                                {h.perfPct > 0 ? "+" : ""}
                                {h.perfPct} %
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-right text-xs text-gray-700">
                              {h.volatility}
                            </td>
                            <td className="py-2 pr-0">
                              <div className="w-40 h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[#D4AF37]"
                                  style={{ width: `${h.weightPct}%` }}
                                />
                              </div>
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-[11px] text-gray-400 leading-relaxed">
                  Plus une ligne est lourde dans votre portefeuille, plus son
                  comportement impacte la valeur globale.
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
