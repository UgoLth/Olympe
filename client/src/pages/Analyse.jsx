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

// ✅ timezone unique pour les "jours"
const APP_TZ = "Europe/Paris";

// ✅ dayKey "YYYY-MM-DD" DANS LE TIMEZONE APP_TZ (PAS via toISOString)
const getDayKeyInTZ = (date, timeZone = APP_TZ) => {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const da = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${da}`;
};

// ✅ Date stable à partir d'un dayKey (on prend midi UTC pour éviter les décalages)
const dateFromDayKey = (dayKey) => new Date(`${dayKey}T12:00:00.000Z`);

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
  Liquidités: "#111827",
  Épargne: "#D4AF37",
  Investissements: "#4B5563",
  Crypto: "#9CA3AF",
  Autres: "#6B7280",
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

  if (mode === "year") {
    const buckets = {};
    sorted.forEach((p) => {
      const d = new Date(p.date);
      const key = `${d.getFullYear()}-${(d.getMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
      buckets[key] = p.value;
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

/**
 * ✅ FIX ICI (et seulement ici)
 * Avant: plusieurs selects sur des colonnes supposées -> 400 si colonne inexistante -> map vide -> aucune courbe
 * Maintenant: 1 seul select("*") puis on déduit la colonne prix côté JS.
 *
 * ✅ + FIX DATES RECENTES :
 * Supabase/PostgREST retourne ~1000 lignes max par défaut => tu récupérais seulement les plus anciennes (juin/juillet)
 * Maintenant: on prend les plus récentes et on élargit la fenêtre avec range()
 */
const fetchAssetPricesDailySafe = async ({ instrumentIds, fromDayKey }) => {
  const { data, error } = await supabase
    .from("asset_prices_daily")
    .select("*")
    .in("instrument_id", instrumentIds)
    .gte("day", fromDayKey)
    .order("day", { ascending: false }) // ✅ prendre les plus récentes en premier
    .range(0, 5000); // ✅ dépasser la limite silencieuse (~1000)

  if (error) throw error;

  const pickPrice = (row) => {
    const candidates = [
      "close_price",
      "close",
      "adj_close",
      "adjclose",
      "adjusted_close",
      "price",
      "value",
      "last",
      "c",
    ];

    for (const k of candidates) {
      const v = row?.[k];
      const n = Number(v);
      if (v !== null && v !== undefined && v !== "" && Number.isFinite(n))
        return n;
    }

    // fallback: premier champ numérique “plausible”
    const ignore = new Set([
      "instrument_id",
      "day",
      "created_at",
      "updated_at",
      "fetched_at",
      "symbol",
      "name",
      "id",
    ]);

    for (const [k, v] of Object.entries(row || {})) {
      if (ignore.has(k)) continue;
      const n = Number(v);
      if (v !== null && v !== undefined && v !== "" && Number.isFinite(n))
        return n;
    }

    return 0;
  };

  return (data || []).map((r) => {
    // ✅ FIX COMPARATEUR : normaliser la colonne day (DATE) => "YYYY-MM-DD"
    const dayKey =
      typeof r.day === "string" ? r.day : getDayKeyInTZ(r.day, APP_TZ);

    return {
      instrument_id: r.instrument_id,
      day: dayKey, // "YYYY-MM-DD"
      price: pickPrice(r),
    };
  });
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

  const [assetAllocations, setAssetAllocations] = useState([]);
  const [accountTypeAllocations, setAccountTypeAllocations] = useState([]);
  const [holdings, setHoldings] = useState([]);

  // ✅ vient désormais de portfolio_history_daily
  const [portfolioHistory, setPortfolioHistory] = useState([]); // [{date, value}]
  const [historyMode, setHistoryMode] = useState("day");

  // ✅ comparaison: instrumentHistoryMap basé sur asset_prices_daily (1 point/jour)
  const [instrumentHistoryMap, setInstrumentHistoryMap] = useState({});

  const [selectedHolding1, setSelectedHolding1] = useState("");
  const [selectedHolding2, setSelectedHolding2] = useState("");

  const [comparisonValueMode, setComparisonValueMode] = useState("value");
  const [comparisonMode, setComparisonMode] = useState("week");
  const [comparisonStartDate, setComparisonStartDate] = useState("");
  const [comparisonEndDate, setComparisonEndDate] = useState("");

  const sortedPortfolioHistory = useMemo(
    () => [...portfolioHistory].sort((a, b) => a.date - b.date),
    [portfolioHistory]
  );

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

  const loadAnalytics = async (userId) => {
    setLoading(true);
    try {
      // ✅ 0) HISTORIQUE PORTEFEUILLE (table daily)
      const { data: histRows, error: histErr } = await supabase
        .from("portfolio_history_daily")
        .select("day,total_value")
        .eq("user_id", userId)
        .order("day", { ascending: true });

      if (histErr) throw histErr;

      const dailyHistoryFromTable = (histRows || [])
        .filter((r) => r.day != null)
        .map((r) => ({
          // day est un DATE => "YYYY-MM-DD"
          date: dateFromDayKey(r.day),
          value: toNumber(r.total_value),
        }));

      setPortfolioHistory(dailyHistoryFromTable);

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

      // ✅ historique 1 point/jour pour le comparateur (asset_prices_daily)
      let historicalPricesByInstrument = {};

      if (instrumentIds.length > 0) {
        const now = new Date();

        const date1d = new Date(now);
        date1d.setDate(now.getDate() - 1);
        const iso1d = date1d.toISOString();

        const date30d = new Date(now);
        date30d.setDate(now.getDate() - 30);
        const iso30d = date30d.toISOString();

        const startOfYearDate = new Date(now.getFullYear(), 0, 2);
        const isoYtdStart = startOfYearDate.toISOString();

        // ✅ Pour la comparaison, on prend ~2 ans
        const historyStart = new Date(now);
        historyStart.setFullYear(now.getFullYear() - 2);
        historyStart.setHours(0, 0, 0, 0);
        const fromDayKey = getDayKeyInTZ(historyStart, APP_TZ);

        const { data: instruments, error: instError } = await supabase
          .from("instruments")
          .select("id, symbol, name, asset_class")
          .in("id", instrumentIds);

        if (instError) throw instError;

        instrumentsById = Object.fromEntries(
          (instruments || []).map((inst) => [inst.id, inst])
        );

        // J-1 (inchangé)
        const { data: prices1d } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", iso1d)
          .order("fetched_at", { ascending: true });

        if (prices1d) {
          for (const p of prices1d) {
            const id = p.instrument_id;
            if (!prev1dByInstrument[id])
              prev1dByInstrument[id] = toNumber(p.price);
          }
        }

        // 30 jours (inchangé)
        const { data: prices30d } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", iso30d)
          .order("fetched_at", { ascending: true });

        if (prices30d) {
          for (const p of prices30d) {
            const id = p.instrument_id;
            if (!prev30dByInstrument[id])
              prev30dByInstrument[id] = toNumber(p.price);
          }
        }

        // YTD (inchangé)
        const { data: pricesYtd } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", isoYtdStart)
          .order("fetched_at", { ascending: true });

        if (pricesYtd) {
          for (const p of pricesYtd) {
            const id = p.instrument_id;
            if (!prevYtdByInstrument[id])
              prevYtdByInstrument[id] = toNumber(p.price);
          }
        }

        // ✅ Historique comparateur (asset_prices_daily)
        try {
          const dailyRows = await fetchAssetPricesDailySafe({
            instrumentIds,
            fromDayKey,
          });

          historicalPricesByInstrument = {};
          for (const r of dailyRows || []) {
            const id = r.instrument_id;
            const dayKey = r.day; // ✅ dayKey normalisé "YYYY-MM-DD"
            if (!id || !dayKey) continue;

            if (!historicalPricesByInstrument[id])
              historicalPricesByInstrument[id] = [];
            historicalPricesByInstrument[id].push({
              dayKey,
              date: dateFromDayKey(dayKey),
              price: toNumber(r.price),
            });
          }

          Object.keys(historicalPricesByInstrument).forEach((id) => {
            historicalPricesByInstrument[id].sort((a, b) => a.date - b.date);
          });
        } catch (e) {
          console.error(
            "Comparateur: impossible de charger asset_prices_daily.",
            e
          );
          historicalPricesByInstrument = {};
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
          instrumentId: h.instrument_id,
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
        if (accountValueMap[h.accountId] === undefined)
          accountValueMap[h.accountId] = 0;
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

      // ✅ IMPORTANT : instrumentHistoryMap vient maintenant de asset_prices_daily (comparateur)
      setInstrumentHistoryMap(historicalPricesByInstrument);

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
    assetAllocations.length > 0 && assetAllocations.some((a) => a.percent > 0);

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

  // ---------- ANALYSE DU RISQUE ----------
  const stdDev = (arr) => {
    if (!arr || arr.length === 0) return 0;
    const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
    const variance =
      arr.reduce((s, x) => s + (x - mean) * (x - mean), 0) / arr.length;
    return Math.sqrt(variance);
  };

  const sortedHistory = [...portfolioHistory].sort((a, b) => a.date - b.date);
  const dailyReturns = [];
  for (let i = 1; i < sortedHistory.length; i++) {
    const prev = sortedHistory[i - 1].value;
    const curr = sortedHistory[i].value;
    if (prev > 0) dailyReturns.push((curr / prev - 1) * 100);
  }
  const volatilityPct = stdDev(dailyReturns);

  let volatilityScore = 0;
  if (volatilityPct === 0) volatilityScore = 0;
  else if (volatilityPct < 0.5) volatilityScore = 1;
  else if (volatilityPct < 1) volatilityScore = 2;
  else if (volatilityPct < 1.5) volatilityScore = 3;
  else if (volatilityPct < 2.5) volatilityScore = 4;
  else volatilityScore = 5;

  const volatilityLabel =
    volatilityScore <= 2
      ? "Volatilité faible"
      : volatilityScore === 3
      ? "Volatilité moyenne"
      : "Volatilité élevée";

  let maxDrawdown = 0;
  if (sortedHistory.length > 0) {
    let peak = sortedHistory[0].value;
    for (let i = 1; i < sortedHistory.length; i++) {
      const v = sortedHistory[i].value;
      if (v > peak) peak = v;
      const dd = (v / peak - 1) * 100;
      if (dd < maxDrawdown) maxDrawdown = dd;
    }
  }
  const maxDrawdownPct = Math.round(maxDrawdown * 10) / 10;

  const maxWeightPct =
    holdings.length > 0
      ? holdings.reduce(
          (m, h) => (h.allocationPct > m ? h.allocationPct : m),
          0
        )
      : 0;

  let diversificationScore = 0;
  if (maxWeightPct === 0) diversificationScore = 0;
  else if (maxWeightPct > 60) diversificationScore = 1;
  else if (maxWeightPct > 40) diversificationScore = 2;
  else if (maxWeightPct > 25) diversificationScore = 3;
  else if (maxWeightPct > 15) diversificationScore = 4;
  else diversificationScore = 5;

  const diversificationLabel =
    diversificationScore <= 2
      ? "Portefeuille peu diversifié"
      : diversificationScore === 3
      ? "Portefeuille moyennement diversifié"
      : "Portefeuille bien diversifié";

  const cashEntry =
    assetAllocations.find((a) => a.label === "Liquidités") || null;
  const cashPct = cashEntry ? cashEntry.percent : 0;

  let liquidityScore = 0;
  if (cashPct === 0) liquidityScore = 0;
  else if (cashPct < 5) liquidityScore = 2;
  else if (cashPct < 20) liquidityScore = 4;
  else if (cashPct < 50) liquidityScore = 5;
  else liquidityScore = 3;

  const investEntry =
    assetAllocations.find((a) => a.label === "Investissements") || null;
  const investPct = investEntry ? investEntry.percent : 0;

  let horizonScore = 0;
  if (investPct === 0) horizonScore = 0;
  else if (investPct < 20) horizonScore = 2;
  else if (investPct < 50) horizonScore = 3;
  else if (investPct < 80) horizonScore = 4;
  else horizonScore = 5;

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
  if (riskLevelScore <= 2) globalLabel = "Risque faible";
  else if (riskLevelScore <= 3) globalLabel = "Risque modéré";
  else if (riskLevelScore <= 4) globalLabel = "Risque dynamique";
  else globalLabel = "Risque élevé";

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
    plugins: { legend: { display: false } },
    scales: {
      r: {
        angleLines: { color: "#E5E7EB" },
        grid: { color: "#E5E7EB" },
        suggestedMin: 0,
        suggestedMax: 5,
        ticks: { display: false },
        pointLabels: { color: "#4B5563", font: { size: 10 } },
      },
    },
  };

  // ---------- TOP LIGNES ----------
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
      id: h.id,
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

  // ---------- COMPARAISON ----------
  // ✅ MODIF UNIQUEMENT DU COMPARATEUR :
  // - timeline (X) basée sur asset_prices_daily.day
  // - on aligne par "dayKey" (YYYY-MM-DD)
  // - carry-forward (dernier prix connu <= jour demandé)
  const buildHoldingSeriesForComparison = (holding, basePoints) => {
    if (!holding || !basePoints || !basePoints.length) return null;
    if (!holding.instrumentId) return null;

    const priceHistory = instrumentHistoryMap[holding.instrumentId];
    if (!priceHistory || !priceHistory.length) return null;

    // ✅ FIX COMPARATEUR : on normalise dayKey au cas où
    const normalized = priceHistory
      .map((p) => ({
        ...p,
        dayKey:
          typeof p.dayKey === "string"
            ? p.dayKey
            : getDayKeyInTZ(p.dayKey, APP_TZ),
      }))
      .filter((p) => !!p.dayKey);

    // Tri par dayKey (string) => ordre chrono garanti
    const sortedByDayKey = [...normalized].sort((a, b) =>
      String(a.dayKey).localeCompare(String(b.dayKey))
    );

    const dayKeys = sortedByDayKey.map((p) => String(p.dayKey));
    const prices = sortedByDayKey.map((p) => toNumber(p.price));

    // binary search: dernier index i tel que dayKeys[i] <= targetKey
    const lastIndexLE = (targetKey) => {
      const t = String(targetKey);
      let lo = 0;
      let hi = dayKeys.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (dayKeys[mid] <= t) {
          ans = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    };

    const data = [];
    for (const point of basePoints) {
      // ✅ timeline = asset_prices_daily.day
      const targetDayKey = point.dayKey;

      const idx = lastIndexLE(targetDayKey);

      // si aucun prix <= ce jour : null (ça évite de tracer du faux)
      if (idx < 0) {
        data.push(null);
        continue;
      }

      const p = prices[idx];
      if (!p || p <= 0) {
        data.push(null);
        continue;
      }

      data.push(toNumber(holding.quantity) * p);
    }

    // si tout est null => pas de série
    const hasAny = data.some((v) => v !== null && v !== undefined);
    return hasAny ? data : null;
  };

  const selectedObj1 = holdings.find(
    (h) => String(h.id) === String(selectedHolding1)
  );
  const selectedObj2 = holdings.find(
    (h) => String(h.id) === String(selectedHolding2)
  );

  // ✅ FIX: timeline basée sur asset_prices_daily.day (pas portfolio_history_daily)
  const buildComparisonDayKeys = () => {
    const ids = [selectedObj1?.instrumentId, selectedObj2?.instrumentId].filter(
      Boolean
    );

    const set = new Set();
    ids.forEach((id) => {
      (instrumentHistoryMap[id] || []).forEach((p) => {
        const k =
          typeof p?.dayKey === "string"
            ? p.dayKey
            : p?.dayKey
            ? String(p.dayKey)
            : null;
        if (k) set.add(k);
      });
    });

    let keys = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (!keys.length) return [];

    const lastKey = keys[keys.length - 1];

    const subDays = (n) => {
      const d = new Date(`${lastKey}T12:00:00.000Z`);
      d.setDate(d.getDate() - (n - 1));
      const minKey = getDayKeyInTZ(d, APP_TZ);
      return keys.filter((k) => k >= minKey && k <= lastKey);
    };

    if (comparisonMode === "week") keys = subDays(7);
    else if (comparisonMode === "month") keys = subDays(30);
    else if (comparisonMode === "year") keys = subDays(365);
    else if (comparisonMode === "custom") {
      const startKey = comparisonStartDate ? String(comparisonStartDate) : null; // YYYY-MM-DD
      const endKey = comparisonEndDate ? String(comparisonEndDate) : null;
      keys = keys.filter((k) => {
        if (startKey && k < startKey) return false;
        if (endKey && k > endKey) return false;
        return true;
      });
    }

    return keys;
  };

  const comparisonDayKeys = buildComparisonDayKeys();

  const comparisonPoints = comparisonDayKeys.map((k) => ({
    dayKey: k,
    date: dateFromDayKey(k),
  }));

  const comparisonLabels = comparisonPoints.map((p) => formatDateShort(p.date));

  const series1Raw = selectedObj1
    ? buildHoldingSeriesForComparison(selectedObj1, comparisonPoints)
    : null;
  const series2Raw = selectedObj2
    ? buildHoldingSeriesForComparison(selectedObj2, comparisonPoints)
    : null;

  const normalizeToPerf = (series) => {
    if (!series || !series.length) return null;

    // ✅ base = premier point non-null et > 0
    const base = series.find((v) => v !== null && v !== undefined && v > 0);
    if (!base || base <= 0) return null;

    return series.map((v) => {
      if (v === null || v === undefined || v <= 0) return null;
      return (v / base - 1) * 100;
    });
  };

  const series1 =
    comparisonValueMode === "value" ? series1Raw : normalizeToPerf(series1Raw);
  const series2 =
    comparisonValueMode === "value" ? series2Raw : normalizeToPerf(series2Raw);

  // ✅ FIX COMPARATEUR : si on a 1 seul point, il faut afficher le point sinon on ne voit rien
  const pointRadiusFor = (series) => {
    const n = Array.isArray(series) ? series.filter((v) => v != null).length : 0;
    return n <= 1 ? 3 : 0;
  };

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
                    pointRadius: pointRadiusFor(series1), // ✅ FIX COMPARATEUR
                    pointHoverRadius: 4,
                    spanGaps: true, // ✅ pour éviter des trous si quelques null
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
                    pointRadius: pointRadiusFor(series2), // ✅ FIX COMPARATEUR
                    pointHoverRadius: 4,
                    spanGaps: true,
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
        labels: { boxWidth: 12, color: "#4B5563", font: { size: 11 } },
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
            if (v === null || v === undefined) return `${ctx.dataset.label}: —`;
            if (comparisonValueMode === "value") {
              return `${ctx.dataset.label}: ${formatCurrency(v)}`;
            }
            return `${ctx.dataset.label}: ${Number(v).toFixed(1)} %`;
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
        grid: { color: "rgba(209,213,219,0.5)", drawBorder: false },
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

  const kpiVariants = {
    hidden: { opacity: 0, y: 10 },
    show: (i) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.05 * i, duration: 0.3, ease: "easeOut" },
    }),
  };

  return (
    <div className="h-screen bg-[#F5F5F5] flex overflow-hidden">
      {/* SIDEBAR (même que Dashboard) */}
      <aside className="w-64 bg-[#0F1013] text-white flex flex-col">
        {/* TITRE + EMAIL */}
        <div className="flex items-start flex-col justify-center px-6 h-16 border-b border-white/5">
          <p className="text-sm tracking-[0.25em] text-[#D4AF37] uppercase">
            OLYMPE
          </p>
          <p className="text-xs text-white/50 -mt-1">
            {userEmail || "Finance dashboard"}
          </p>
        </div>

        {/* Menu */}
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
            icon={Sparkles}
            label="Simulation"
            onClick={() => navigate("/simulation")}
          />
          <SidebarItem
            icon={GraduationCap}
            label="Glossaire"
            onClick={() => navigate("/glossaire")}
          />
        </nav>

        {/* Bottom */}
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
              {/* 1️⃣ KPIs */}
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
                          ? `+${Math.round(bestHolding.monthlyChangePct * 10) / 10} %`
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
                          ? `${Math.round(worstHolding.monthlyChangePct * 10) / 10} %`
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Les performances sont calculées à partir des prix enregistrés
                    dans Olympe et sont fournies à titre exclusivement pédagogique.
                  </p>
                </div>
              </section>

              {/* 2️⃣.bis Comparaison */}
              <section className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex flex-col gap-4 mb-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">
                        Comparer deux placements
                      </h2>
                      <p className="text-xs text-gray-500">
                        Visualisez l’évolution de la valeur ou de la performance
                        de chaque ligne.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-gray-500">Ligne 1</span>
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
                          <option value="">Aucune / comparer plus tard</option>
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

                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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

                    <div className="flex items-center gap-2 text-[11px]">
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
                            className={`px-3 py-1 rounded-full transition ${
                              comparisonMode === m.id
                                ? "bg-white shadow-sm text-gray-900"
                                : "text-gray-500"
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {comparisonMode === "custom" && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-gray-500">De :</span>
                        <input
                          type="date"
                          value={comparisonStartDate}
                          onChange={(e) => setComparisonStartDate(e.target.value)}
                          className="border border-gray-200 rounded-full px-3 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                        />
                        <span className="text-gray-500">à :</span>
                        <input
                          type="date"
                          value={comparisonEndDate}
                          onChange={(e) => setComparisonEndDate(e.target.value)}
                          className="border border-gray-200 rounded-full px-3 py-1.5 text-xs bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 h-64">
                  {comparisonData ? (
                    <Line data={comparisonData} options={comparisonOptions} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">
                      Sélectionnez au moins une ligne pour afficher la comparaison.
                    </div>
                  )}
                </div>

                <p className="mt-3 text-[11px] text-gray-400">
                  En mode “Performance (%)”, chaque courbe démarre à 0 % et montre la
                  variation relative depuis le début de la période.
                </p>
              </section>

              {/* 3️⃣ Profil de risque + Top lignes */}
              <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 flex flex-col md:flex-row gap-6">
                  <div className="w-full md:w-1/2 h-64">
                    <Radar data={riskRadarData} options={riskRadarOptions} />
                  </div>
                  <div className="w-full md:w-1/2 space-y-3">
                    <h2 className="text-sm font-semibold text-gray-800">
                      Profil de risque global
                    </h2>
                    <p className="text-xs text-gray-500">
                      Basé sur la volatilité quotidienne, les plus fortes baisses et la
                      répartition.
                    </p>

                    <div className="space-y-2 text-xs text-gray-700">
                      <p>
                        <span className="font-semibold text-gray-900">
                          Niveau global :
                        </span>{" "}
                        {riskProfile.globalLabel}
                      </p>
                      <p>
                        <span className="font-semibold text-gray-900">
                          Volatilité :
                        </span>{" "}
                        {riskProfile.volatilityLabel}{" "}
                        {dailyReturns.length > 5 &&
                          `(σ ≈ ${volatilityPct.toFixed(2)} % / jour)`}
                      </p>
                      <p>
                        <span className="font-semibold text-gray-900">
                          Pire baisse enregistrée :
                        </span>{" "}
                        {maxDrawdownPct} %
                      </p>
                      <p>
                        <span className="font-semibold text-gray-900">
                          Diversification :
                        </span>{" "}
                        {riskProfile.diversificationLabel}
                      </p>
                      <p>
                        <span className="font-semibold text-gray-900">
                          Liquidités :
                        </span>{" "}
                        {cashPct} % du portefeuille
                      </p>
                    </div>

                    <p className="text-[11px] text-gray-400">
                      Ces indicateurs ne constituent pas un conseil en investissement.
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-800 mb-1">
                    Analyse des principales lignes
                  </h2>
                  <p className="text-xs text-gray-500 mb-3">
                    Top 5 des lignes les plus pondérées.
                  </p>

                  <div className="overflow-hidden rounded-xl border border-gray-100">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 text-[11px] uppercase tracking-[0.12em] text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Ligne</th>
                          <th className="px-3 py-2 text-right">Poids</th>
                          <th className="px-3 py-2 text-right">Perf 30 j</th>
                          <th className="px-3 py-2 text-right">Volatilité</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdingsAnalysisRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-3 py-4 text-center text-gray-400 text-[11px]"
                            >
                              Pas encore assez de données pour analyser vos lignes.
                            </td>
                          </tr>
                        ) : (
                          holdingsAnalysisRows.map((h, index) => (
                            <motion.tr
                              key={h.id}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.03 * index, duration: 0.2 }}
                              className="group border-b border-gray-50 hover:bg-gray-50/60 transition"
                            >
                              <td className="px-3 py-2">
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium text-gray-900">
                                    {h.name}
                                  </span>
                                  {h.ticker && (
                                    <span className="text-[10px] text-gray-500">
                                      {h.ticker}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right text-xs text-gray-700">
                                {h.weightPct} %
                              </td>
                              <td
                                className={`px-3 py-2 text-right text-xs ${
                                  h.perfPct > 0
                                    ? "text-emerald-600"
                                    : h.perfPct < 0
                                    ? "text-red-600"
                                    : "text-gray-600"
                                }`}
                              >
                                {h.perfPct > 0 ? "+" : ""}
                                {h.perfPct} %
                              </td>
                              <td className="px-3 py-2 text-right text-xs text-gray-700">
                                {h.volatility}
                              </td>
                            </motion.tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* 4️⃣ Donut */}
              <section className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">
                      Répartition par grande catégorie
                    </h2>
                    <p className="text-xs text-gray-500">
                      Liquidités, épargne, investissements, crypto, etc.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                  <div className="md:col-span-2 h-56">
                    {hasAllocations ? (
                      <Doughnut data={doughnutData} options={doughnutOptions} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-400">
                        Aucune donnée de répartition disponible.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {assetAllocations.map((a) => (
                      <div
                        key={a.label}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: a.color }}
                          />
                          <span className="text-gray-700">{a.label}</span>
                        </div>
                        <span className="text-gray-900 font-medium">
                          {a.percent} %
                        </span>
                      </div>
                    ))}
                    {assetAllocations.length === 0 && (
                      <p className="text-[11px] text-gray-400">
                        Ajoutez des comptes et des placements pour voir votre allocation.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}

/* ---------- Petits composants UI ---------- */

// ✅ SidebarItem (même style que Dashboard)
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

function KpiCard({ label, value, subtitle, positive }) {
  const isNumber = typeof value === "string" && value.includes("%");
  const isPositive =
    positive !== undefined
      ? positive
      : isNumber
      ? !value.startsWith("-")
      : false;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col justify-between h-full">
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400 mb-2">
          {label}
        </p>
        <p className="text-base font-semibold text-gray-900">{value}</p>
      </div>
      {subtitle && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] text-gray-500">{subtitle}</p>
          {isNumber && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                isPositive
                  ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                  : "border-red-200 text-red-700 bg-red-50"
              }`}
            >
              {isPositive ? "Positif" : "Négatif"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
