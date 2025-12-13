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
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  Target,
  TrendingUp,
  ListChecks,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { motion } from "framer-motion";

const toNumber = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v));

const formatCurrency0 = (n) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const formatPct1 = (v) => {
  const x = Number(v) || 0;
  const s = x > 0 ? "+" : "";
  return `${s}${(Math.round(x * 10) / 10).toFixed(1)} %`;
};

// % entre prix courant et prix de référence
const computeReturnPct = (current, reference) => {
  const c = toNumber(current);
  const r = toNumber(reference);
  if (!c || !r || r <= 0) return 0;
  const value = ((c - r) / r) * 100;
  return Number.isFinite(value) ? value : 0;
};

const scopeLabel = (s) => {
  if (!s) return "Objectif";
  if (s === "global_simulation") return "Objectif global";
  if (s === "line_goal") return "Objectif ligne";
  if (s === "account_goal") return "Objectif compte";
  return s;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState(null);

  const [loading, setLoading] = useState(true);

  // data
  const [accounts, setAccounts] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [goals, setGoals] = useState([]);
  const [movements, setMovements] = useState([]);

  // KPIs
  const [summary, setSummary] = useState({
    totalValue: 0,
    dailyChangePct: 0,
    monthChangePct: 0,
  });

  // ---- AUTH ----
  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate("/");
        return;
      }
      setUserEmail(data.user.email || "");
      setUserId(data.user.id);
      await loadDashboard(data.user.id);
    };
    init();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("olympe_remember_me");
    navigate("/");
  };

  const loadDashboard = async (uid) => {
    setLoading(true);
    try {
      // 1) Accounts
      const { data: accountsData, error: accErr } = await supabase
        .from("accounts")
        .select("id, user_id, name, type, currency, initial_amount, current_amount, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: true });

      if (accErr) throw accErr;

      // 2) Holdings
      const { data: holdingsData, error: holdErr } = await supabase
        .from("holdings")
        .select("id, user_id, account_id, instrument_id, quantity, avg_buy_price, current_price, current_value, asset_label, created_at")
        .eq("user_id", uid);

      if (holdErr) throw holdErr;

      // 3) Goals
      const { data: goalsData, error: goalsErr } = await supabase
        .from("investment_goals")
        .select(
          "id, user_id, title, description, target_amount, target_date, initial_capital, monthly_contribution, expected_return_pct, horizon_years, scope, account_id, holding_id, allocation_mode, details, created_at, updated_at"
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(6);

      if (goalsErr) throw goalsErr;

      // 4) Movements (derniers) ✅ + fallback si RLS/aucune ligne
      const buildFallbackMovements = (accRows, holdRows) => {
        const accNameById = Object.fromEntries((accRows || []).map((a) => [a.id, a.name || "Compte"]));

        // pseudo-mouvements depuis holdings (ajout = achat)
        const fromHoldings = (holdRows || []).map((h) => {
          const qty = toNumber(h.quantity);
          const unit = toNumber(h.avg_buy_price);
          const amount = qty * unit;

          const label = h.asset_label || "Placement";
          const accName = accNameById[h.account_id] || "Compte";

          return {
            id: `fallback-holding-${h.id}`,
            user_id: uid,
            account_id: h.account_id,
            holding_id: h.id,
            type: "BUY",
            amount,
            description: `Achat ${label} • ${accName}`,
            occurred_at: h.created_at || null,
            created_at: h.created_at || null,
          };
        });

        // pseudo-mouvements depuis comptes (versement initial si montant > 0)
        const fromAccounts = (accRows || [])
          .filter((a) => toNumber(a.initial_amount) > 0 || toNumber(a.current_amount) > 0)
          .map((a) => {
            const amount = toNumber(a.initial_amount) > 0 ? toNumber(a.initial_amount) : toNumber(a.current_amount);
            return {
              id: `fallback-account-${a.id}`,
              user_id: uid,
              account_id: a.id,
              holding_id: null,
              type: "DEPOSIT",
              amount,
              description: `Versement initial • ${a.name || "Compte"}`,
              occurred_at: a.created_at || null,
              created_at: a.created_at || null,
            };
          });

        const all = [...fromHoldings, ...fromAccounts];

        // tri date desc (occurred_at sinon created_at)
        all.sort((x, y) => {
          const dx = new Date(x.occurred_at || x.created_at || 0).getTime();
          const dy = new Date(y.occurred_at || y.created_at || 0).getTime();
          return dy - dx;
        });

        return all.slice(0, 6);
      };

      const { data: movDataRaw, error: movErr } = await supabase
        .from("movements")
        .select("id, user_id, account_id, holding_id, type, amount, description, occurred_at, created_at")
        .eq("user_id", uid)
        // si occurred_at est parfois NULL, on garde un tri cohérent en re-triant côté JS juste après
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .limit(6);

      // Si RLS filtre tout (data vide sans erreur), ou erreur => fallback
      let movData = movDataRaw || [];
      if (movErr || movData.length === 0) {
        movData = buildFallbackMovements(accountsData || [], holdingsData || []);
      } else {
        // petit tri défensif côté JS (si occurred_at NULL ou incohérences)
        movData = [...movData].sort((a, b) => {
          const da = new Date(a.occurred_at || a.created_at || 0).getTime();
          const db = new Date(b.occurred_at || b.created_at || 0).getTime();
          return db - da;
        });
      }

      // ---- Total value (logique proche Analyse) ----
      const accountsWithHoldings = new Set((holdingsData || []).map((h) => h.account_id));
      const standaloneAccounts = (accountsData || []).filter((a) => !accountsWithHoldings.has(a.id));

      let totalHoldingsValue = 0;
      const holdingsComputed = (holdingsData || []).map((h) => {
        const qty = toNumber(h.quantity);
        const cp = toNumber(h.current_price);
        const value =
          h.current_value !== null && h.current_value !== undefined ? toNumber(h.current_value) : qty * cp;

        totalHoldingsValue += value;

        return {
          ...h,
          _computedValue: value,
        };
      });

      let totalStandaloneValue = 0;
      standaloneAccounts.forEach((a) => {
        totalStandaloneValue += toNumber(a.current_amount);
      });

      const totalValue = totalHoldingsValue + totalStandaloneValue;

      // ---- Perf J-1 / 30j pondérée sur holdings (asset_prices) ----
      const instrumentIds = Array.from(new Set((holdingsData || []).map((h) => h.instrument_id).filter(Boolean)));

      let prev1dByInstrument = {};
      let prev30dByInstrument = {};

      if (instrumentIds.length > 0) {
        const now = new Date();

        const d1 = new Date(now);
        d1.setDate(now.getDate() - 1);
        const iso1d = d1.toISOString();

        const d30 = new Date(now);
        d30.setDate(now.getDate() - 30);
        const iso30d = d30.toISOString();

        const { data: prices1d } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", iso1d)
          .order("fetched_at", { ascending: true });

        if (prices1d) {
          for (const p of prices1d) {
            const id = p.instrument_id;
            if (!prev1dByInstrument[id]) prev1dByInstrument[id] = toNumber(p.price);
          }
        }

        const { data: prices30d } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", iso30d)
          .order("fetched_at", { ascending: true });

        if (prices30d) {
          for (const p of prices30d) {
            const id = p.instrument_id;
            if (!prev30dByInstrument[id]) prev30dByInstrument[id] = toNumber(p.price);
          }
        }
      }

      let daily = 0;
      let month = 0;

      if (totalValue > 0) {
        // perf pondérée sur holdings uniquement
        holdingsComputed.forEach((h) => {
          const v = toNumber(h._computedValue);
          if (v <= 0) return;

          const weight = v / totalValue;

          const currentPrice = toNumber(h.current_price);
          const prev1d = prev1dByInstrument[h.instrument_id] || 0;
          const prev30d = prev30dByInstrument[h.instrument_id] || 0;

          const dPct = computeReturnPct(currentPrice, prev1d);
          const mPct = computeReturnPct(currentPrice, prev30d);

          daily += weight * dPct;
          month += weight * mPct;
        });

        daily = Math.round(daily * 10) / 10;
        month = Math.round(month * 10) / 10;
      }

      // ---- Account values (avec holdings groupés) ----
      const accountValueMap = {};
      (accountsData || []).forEach((a) => (accountValueMap[a.id] = 0));

      holdingsComputed.forEach((h) => {
        accountValueMap[h.account_id] = (accountValueMap[h.account_id] || 0) + toNumber(h._computedValue);
      });

      standaloneAccounts.forEach((a) => {
        accountValueMap[a.id] = (accountValueMap[a.id] || 0) + toNumber(a.current_amount);
      });

      // ---- Goals: current amount dépend du scope (global/account/holding) ----
      const holdingById = Object.fromEntries((holdingsComputed || []).map((h) => [h.id, h]));
      const accountById = Object.fromEntries((accountsData || []).map((a) => [a.id, a]));

      const goalsComputed = (goalsData || []).map((g) => {
        let current = 0;

        // priorité : holding -> account -> global
        if (g.holding_id && holdingById[g.holding_id]) {
          current = toNumber(holdingById[g.holding_id]._computedValue);
        } else if (g.account_id && accountValueMap[g.account_id] !== undefined) {
          current = toNumber(accountValueMap[g.account_id]);
        } else {
          current = totalValue;
        }

        const target = toNumber(g.target_amount);
        const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

        const accName = g.account_id && accountById[g.account_id] ? accountById[g.account_id].name : null;

        return {
          ...g,
          _current_amount: current,
          _progress_pct: pct,
          _account_name: accName,
        };
      });

      setAccounts(accountsData || []);
      setHoldings(holdingsComputed || []);
      setGoals(goalsComputed);
      setMovements(movData || []);
      setSummary({
        totalValue,
        dailyChangePct: daily,
        monthChangePct: month,
      });
    } catch (e) {
      console.error("Dashboard load error:", e);
    } finally {
      setLoading(false);
    }
  };

  // ---- Derived UI ----
  const accountsPreview = useMemo(() => {
    if (!accounts.length) return [];
    // valeur du compte = holdings + standalone (même logique que plus haut, recalcul rapide)
    const holdingsByAccount = {};
    holdings.forEach((h) => {
      holdingsByAccount[h.account_id] = (holdingsByAccount[h.account_id] || 0) + toNumber(h._computedValue);
    });

    const accountsWithHoldings = new Set(holdings.map((h) => h.account_id));

    const rows = accounts.map((a) => {
      const base = toNumber(holdingsByAccount[a.id]);
      const standalone = accountsWithHoldings.has(a.id) ? 0 : toNumber(a.current_amount);
      const value = base + standalone;
      return {
        id: a.id,
        name: a.name || "Compte",
        type: a.type || "",
        value,
      };
    });

    return rows.sort((a, b) => b.value - a.value).slice(0, 6);
  }, [accounts, holdings]);

  const insights = useMemo(() => {
    const main = accountsPreview.length ? accountsPreview[0] : null;

    return [
      {
        type: summary.dailyChangePct >= 0 ? "good" : "bad",
        text: `Votre portefeuille ${summary.dailyChangePct >= 0 ? "progresse" : "recule"} de ${formatPct1(
          summary.dailyChangePct
        )} aujourd’hui`,
      },
      {
        type: summary.monthChangePct >= 0 ? "good" : "bad",
        text: `Sur 30 jours : ${formatPct1(summary.monthChangePct)}`,
      },
      ...(main
        ? [
            {
              type: "neutral",
              text: `Votre compte principal est “${main.name}” (${formatCurrency0(main.value)})`,
            },
          ]
        : []),
    ];
  }, [summary.dailyChangePct, summary.monthChangePct, accountsPreview]);

  const kpiVariants = {
    hidden: { opacity: 0, y: 10 },
    show: (i) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.05 * i, duration: 0.35, ease: "easeOut" },
    }),
  };

  return (
    <div className="h-screen bg-[#F5F5F5] flex overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0F1013] text-white flex flex-col">
        <div className="flex items-start flex-col justify-center px-6 h-16 border-b border-white/5">
          <p className="text-sm tracking-[0.25em] text-[#D4AF37] uppercase">OLYMPE</p>
          <p className="text-xs text-white/50 -mt-1">{userEmail || "Finance dashboard"}</p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          <SidebarItem icon={Home} label="Tableau de bord" active />
          <SidebarItem icon={Wallet} label="Comptes & placements" onClick={() => navigate("/accounts")} />
          <SidebarItem icon={BarChart3} label="Analyse" onClick={() => navigate("/analyse")} />
          <SidebarItem icon={PieChart} label="Portefeuille" onClick={() => navigate("/portefeuille")} />
          <SidebarItem icon={GraduationCap} label="Glossaire" onClick={() => navigate("/glossaire")} />
          <SidebarItem icon={SlidersHorizontal} label="Simulation" onClick={() => navigate("/simulation")} />
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
            <span className="font-semibold text-[#D4AF37]">{formatCurrency0(summary.totalValue)}</span>
          </p>
        </header>

        <motion.div
          className="flex-1 p-6 overflow-y-auto space-y-6"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-sm text-gray-500 gap-3">
              <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-[#D4AF37] animate-spin" />
              <span>Chargement du tableau de bord…</span>
            </div>
          ) : (
            <>
              {/* ROW 1 — Compact + Accounts */}
              <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Compact summary (plus de gros vide) */}
                <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">Aujourd’hui pour vous</h2>
                      <p className="text-xs text-gray-500">
                        Un résumé rapide basé sur vos comptes, placements et prix enregistrés.
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">Total</p>
                      <p className="text-sm font-semibold text-[#D4AF37]">{formatCurrency0(summary.totalValue)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      {
                        label: "Variation du jour",
                        value: formatPct1(summary.dailyChangePct),
                        positive: summary.dailyChangePct >= 0,
                      },
                      {
                        label: "Sur 30 jours",
                        value: formatPct1(summary.monthChangePct),
                        positive: summary.monthChangePct >= 0,
                      },
                      {
                        label: "Valeur totale",
                        value: formatCurrency0(summary.totalValue),
                      },
                    ].map((k, i) => (
                      <motion.div key={k.label} custom={i} variants={kpiVariants} initial="hidden" animate="show">
                        <KpiCard label={k.label} value={k.value} positive={k.positive} />
                      </motion.div>
                    ))}
                  </div>

                  {/* A retenir (collé au résumé => plus d'espace perdu) */}
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp size={16} className="text-gray-700" />
                      <h3 className="text-sm font-semibold text-gray-800">À retenir</h3>
                    </div>

                    <div className="space-y-2">
                      {insights.map((i, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200"
                        >
                          {i.type === "good" && <ArrowUpRight className="text-emerald-600" size={16} />}
                          {i.type === "bad" && <ArrowDownRight className="text-red-500" size={16} />}
                          {i.type === "neutral" && <div className="h-2 w-2 rounded-full bg-gray-500" />}
                          <span>{i.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Accounts preview */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h2 className="text-sm font-semibold text-gray-800">Aperçu des comptes</h2>
                  <p className="text-xs text-gray-500 mb-3">Vos comptes les plus importants.</p>

                  <div className="space-y-2">
                    {accountsPreview.length === 0 ? (
                      <p className="text-xs text-gray-400">Aucun compte pour le moment.</p>
                    ) : (
                      accountsPreview.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 border border-gray-200"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900">{a.name}</span>
                            <span className="text-[11px] text-gray-500">{a.type || "—"}</span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900">{formatCurrency0(a.value)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>

              {/* ROW 2 — Goals + Movements */}
              <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Goals (avec infos utiles) */}
                <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-800">Objectifs financiers</h2>
                      <p className="text-xs text-gray-500">
                        Progression calculée à partir de la valeur actuelle (portefeuille / compte / ligne).
                      </p>
                    </div>

                    <button
                      onClick={() => navigate("/simulation")}
                      className="text-xs px-3 py-2 rounded-full bg-[#0F1013] text-white hover:bg-black transition inline-flex items-center gap-2"
                    >
                      <Target size={16} />
                      Gérer
                    </button>
                  </div>

                  <div className="mt-4 space-y-4">
                    {goals.length === 0 ? (
                      <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-xl p-3">
                        Aucun objectif pour le moment. Tu peux en créer depuis Simulation.
                      </div>
                    ) : (
                      goals.map((g) => {
                        const pct = g._progress_pct || 0;
                        const target = toNumber(g.target_amount);
                        const current = toNumber(g._current_amount);

                        return (
                          <motion.div
                            key={g.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{g.title || "Objectif"}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  {scopeLabel(g.scope)}
                                  {g._account_name ? ` • ${g._account_name}` : ""}
                                  {g.allocation_mode ? ` • mode: ${g.allocation_mode}` : ""}
                                </p>

                                {/* Infos utiles */}
                                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-gray-600">
                                  <InfoPill label="Actuel" value={formatCurrency0(current)} />
                                  <InfoPill label="Cible" value={target > 0 ? formatCurrency0(target) : "—"} />
                                  <InfoPill label="Horizon" value={g.horizon_years ? `${g.horizon_years} an(s)` : "—"} />
                                  <InfoPill
                                    label="Rendement"
                                    value={
                                      g.expected_return_pct !== null && g.expected_return_pct !== undefined
                                        ? `${toNumber(g.expected_return_pct).toFixed(1)} %/an`
                                        : "—"
                                    }
                                  />
                                  <InfoPill
                                    label="Versement"
                                    value={
                                      g.monthly_contribution !== null && g.monthly_contribution !== undefined
                                        ? `${formatCurrency0(toNumber(g.monthly_contribution))}/mois`
                                        : "—"
                                    }
                                  />
                                  <InfoPill
                                    label="Capital initial"
                                    value={
                                      g.initial_capital !== null && g.initial_capital !== undefined
                                        ? formatCurrency0(toNumber(g.initial_capital))
                                        : "—"
                                    }
                                  />
                                  <InfoPill
                                    label="Créé le"
                                    value={g.created_at ? new Date(g.created_at).toLocaleDateString("fr-FR") : "—"}
                                  />
                                  <InfoPill label="Lien" value={g.holding_id ? "Ligne" : g.account_id ? "Compte" : "Global"} />
                                </div>
                              </div>

                              <div className="text-right">
                                <p className="text-sm font-semibold text-gray-900">{pct}%</p>
                                <p className="text-[11px] text-gray-500">
                                  {target > 0 ? `${formatCurrency0(target - current)} restant` : "—"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 h-2 bg-white rounded-full overflow-hidden border border-gray-200">
                              <div className="h-full bg-[#D4AF37]" style={{ width: `${pct}%` }} />
                            </div>

                            {g.description && <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">{g.description}</p>}
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Movements */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <ListChecks size={16} className="text-gray-700" />
                    <h2 className="text-sm font-semibold text-gray-800">Derniers mouvements</h2>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">Achats, versements, opérations…</p>

                  <div className="space-y-2">
                    {movements.length === 0 ? (
                      <p className="text-xs text-gray-400">Aucun mouvement enregistré pour le moment.</p>
                    ) : (
                      movements.map((m) => {
                        const amount = toNumber(m.amount);
                        const date = m.occurred_at
                          ? new Date(m.occurred_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
                          : m.created_at
                          ? new Date(m.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
                          : "—";

                        return (
                          <div
                            key={m.id}
                            className="flex justify-between items-center px-3 py-2 rounded-xl bg-gray-50 border border-gray-200"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 truncate">{m.description || m.type || "Mouvement"}</p>
                              <p className="text-[11px] text-gray-500">{date}</p>
                            </div>
                            <p className={`text-sm font-semibold ${amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                              {amount >= 0 ? "+" : ""}
                              {formatCurrency0(amount)}
                            </p>
                          </div>
                        );
                      })
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

function KpiCard({ label, value, positive }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex flex-col justify-between">
      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">{label}</p>
      <p
        className={`text-base font-semibold ${
          positive === undefined ? "text-gray-900" : positive ? "text-emerald-600" : "text-red-500"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="bg-white/70 border border-gray-200 rounded-lg px-2 py-1">
      <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400">{label}</p>
      <p className="text-[11px] text-gray-700 font-medium">{value}</p>
    </div>
  );
}
