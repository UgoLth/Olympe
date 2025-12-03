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

      // 4) prix historiques (pour clôture veille + 30 jours)
      const prevCloseByInstrument = {}; // clôture veille
      const price30dByInstrument = {}; // prix il y a ~30 jours

      if (instrumentIds.length > 0) {
        // ⏱ dates de référence
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(todayStart.getDate() - 1);

        const thirtyDaysAgoStart = new Date(todayStart);
        thirtyDaysAgoStart.setDate(todayStart.getDate() - 30);

        // On récupère TOUS les prix des 30 derniers jours
        const { data: pricesHistory, error: pricesError } = await supabase
          .from("asset_prices")
          .select("instrument_id, price, fetched_at")
          .in("instrument_id", instrumentIds)
          .gte("fetched_at", thirtyDaysAgoStart.toISOString())
          .order("fetched_at", { ascending: true });

        if (pricesError) {
          console.error("Erreur récupération historique des prix :", pricesError);
        } else if (pricesHistory) {
          for (const p of pricesHistory) {
            const id = p.instrument_id;
            const ts = new Date(p.fetched_at);
            const price = toNumber(p.price);

            // 4.1) Prix 30 jours : on prend le PREMIER prix rencontré
            if (!price30dByInstrument[id]) {
              price30dByInstrument[id] = price;
            }

            // 4.2) Clôture veille :
            // on veut le DERNIER prix de la veille => ts dans [hier 00:00 ; aujourd'hui 00:00[
            if (ts >= yesterdayStart && ts < todayStart) {
              // comme c'est trié ASC, on écrase à chaque fois -> on garde le dernier
              prevCloseByInstrument[id] = price;
            }
          }
        }
      }

      // -------- LIGNES DE PORTEFEUILLE (valeur + variations prix) ----------
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

        const prevClose = prevCloseByInstrument[h.instrument_id] || 0;
        const price30d = price30dByInstrument[h.instrument_id] || 0;

        let dailyChangePct = 0;
        let monthlyChangePct = 0;

        // 📌 Variation jour = (dernier cours - clôture veille) / clôture veille
        if (prevClose > 0 && currentPrice > 0) {
          dailyChangePct = ((currentPrice - prevClose) / prevClose) * 100;
        }

        // 📌 Variation 30 jours = (dernier cours - prix il y a 30 jours) / prix 30j
        if (price30d > 0 && currentPrice > 0) {
          monthlyChangePct = ((currentPrice - price30d) / price30d) * 100;
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
          allocationPct: 0, // mis à jour après
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

      // maj du poids de chaque ligne
      const holdingsWithAllocation = computedHoldings.map((h) => ({
        ...h,
        allocationPct:
          totalValue > 0 ? Math.round((h.value / totalValue) * 100) : 0,
      }));

      // -------- CAMEMBERT : TOTAUX PAR CATÉGORIE ----------
      const categoryTotals = {};
      const addToCategory = (label, amount) => {
        if (!categoryTotals[label]) categoryTotals[label] = 0;
        categoryTotals[label] += amount;
      };

      // holdings → on regarde type de compte + asset_class
      holdingsWithAllocation.forEach((h) => {
        const label = categorizePosition(h.accountType, h.assetClass);
        addToCategory(label, h.value);
      });

      // comptes sans holdings → ex : livrets
      standaloneAccounts.forEach((a) => {
        const label = categorizePosition(a.type, null);
        addToCategory(label, toNumber(a.current_amount));
      });

      const palette = {
        Liquidités: "#4B5563",
        Épargne: "#22C55E",
        Investissements: "#3B82F6",
        Crypto: "#EAB308",
        Autres: "#A855F7",
      };

      const computedAllocations = Object.entries(categoryTotals).map(
        ([label, amount]) => ({
          label,
          percent:
            totalValue > 0 ? Math.round((amount / totalValue) * 100) : 0,
          color: palette[label] || "#6B7280",
        })
      );

      // -------- VARIATIONS PORTFEUILLE (pondérées) ----------
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

  // ---------- RENDER ----------
  return (
    <div className="h-screen bg-[#F5F5F5] flex overflow-hidden">
      {/* SIDEBAR */}
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
        {/* TOPBAR */}
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
            <button
              onClick={async () => {
                const { data } = await supabase.auth.getUser();
                if (data?.user) {
                  await loadPortfolio(data.user.id);
                }
              }}
              className="px-3 py-1.5 rounded-full border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 transition"
            >
              🔄 Rafraîchir les cours
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              Chargement du portefeuille…
            </div>
          ) : (
            <>
              {/* KPIs */}
              <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <KpiCard
                  label="Valeur totale"
                  value={totalValueDisplay}
                  subtitle="Somme de tous vos comptes"
                />
                <KpiCard
                  label="Variation jour"
                  value={`${summary.dailyChangePct > 0 ? "+" : ""}${
                    summary.dailyChangePct
                  } %`}
                  positive={summary.dailyChangePct >= 0}
                  subtitle="Depuis la clôture veille"
                />
                <KpiCard
                  label="Variation 30 jours"
                  value={`${summary.monthlyChangePct > 0 ? "+" : ""}${
                    summary.monthlyChangePct
                  } %`}
                  positive={summary.monthlyChangePct >= 0}
                  subtitle="Sur les 30 derniers jours"
                />
                <KpiCard
                  label="Comptes & lignes"
                  value={`${summary.nbAccounts} comptes`}
                  subtitle={`${summary.nbHoldings} placements`}
                />
              </section>

              {/* Répartition + légende */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Graphique placeholder */}
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
                      Bientôt : graphique Chart.js
                    </span>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <div className="h-40 w-40 rounded-full border-4 border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-400 text-center px-4">
                      Zone pour le camembert (Chart.js)
                    </div>
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
                    <button className="px-3 py-1.5 rounded-full border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 transition">
                      ➕ Ajouter un placement
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
                            Aucun placement pour le moment. Ajoutez une
                            première ligne pour voir votre portefeuille se
                            construire.
                          </td>
                        </tr>
                      ) : (
                        holdings.map((h) => (
                          <tr
                            key={h.id}
                            className="border-b border-gray-50 hover:bg-gray-50/60 transition"
                          >
                            <td className="py-2 pr-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-800">
                                  {h.name}
                                </span>
                                <span className="text-[11px] text-gray-400">
                                  {h.ticker}
                                </span>
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
                          </tr>
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
        </div>
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
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex flex-col justify-between">
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
