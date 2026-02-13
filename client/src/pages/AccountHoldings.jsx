// src/pages/AccountHoldings.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BarChart3,
  PieChart,
  Wallet,
  GraduationCap,
  Settings,
  LogOut,
  Home,
  ArrowLeft,
  Plus,
  SlidersHorizontal,
  Bot, // ✅ ajout icône Assistant IA
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";

// mêmes noms que dans .env.local
const FINNHUB_API_KEY = import.meta.env.VITE_FINNHUB_KEY;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Helper : récupère le prix depuis l’Edge Function EODHD
 */
async function fetchEodhdPrice(symbol) {
  if (!SUPABASE_URL) {
    console.error("VITE_SUPABASE_URL manquante");
    return null;
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/eodhd-price`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ symbol }),
    });

    const data = await resp.json().catch(() => null);
    console.log("Réponse Edge Function EODHD :", data);

    if (!data || data.price == null) {
      console.warn("EODHD: pas de champ price dans la réponse :", data);
      return null;
    }

    const num =
      typeof data.price === "number"
        ? data.price
        : parseFloat(String(data.price).replace(",", "."));

    if (Number.isNaN(num) || num <= 0) {
      console.warn("EODHD: price invalide :", data.price);
      return null;
    }

    return num;
  } catch (err) {
    console.error("fetchEodhdPrice error:", err);
    return null;
  }
}

/**
 * CoinGecko helpers (GRATUIT, pas de clé requise)
 * - Search : renvoie des coins (id, name, symbol)
 * - Price : renvoie prix EUR
 */
async function coingeckoSearch(query) {
  try {
    const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();

    const coins = Array.isArray(json?.coins) ? json.coins : [];
    return coins.slice(0, 8).map((c) => ({
      source: "coingecko",
      id: c.id, // ex: "bitcoin"
      symbol: String(c.symbol || "").toUpperCase(), // ex: "BTC"
      description: c.name || c.id, // ex: "Bitcoin"
      type: "crypto",
      market_cap_rank: c.market_cap_rank ?? null,
    }));
  } catch (e) {
    console.error("CoinGecko search error:", e);
    return [];
  }
}

async function coingeckoPriceEUR(coingeckoId) {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
      coingeckoId
    )}&vs_currencies=eur`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const v = json?.[coingeckoId]?.eur;
    return typeof v === "number" && v > 0 ? v : null;
  } catch (e) {
    console.error("CoinGecko price error:", e);
    return null;
  }
}

const TYPE_LABELS = {
  cash: "Cash",
  savings: "Épargne",
  investment: "Investissement",
  retirement: "Retraite",
  other: "Autre",
};

export default function AccountHoldings() {
  const { accountId } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [account, setAccount] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Formulaire d’achat (nouveau placement)
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    label: "",
    symbol: "",
    quantity: "",
    buyPrice: "",
    instrumentId: null, // 🔗 id dans la table instruments
  });

  // Modal de vente
  const [sellModalHolding, setSellModalHolding] = useState(null);
  const [sellForm, setSellForm] = useState({
    quantityToSell: "",
  });

  // état pour l'autocomplétion
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // ✅ Détection compte crypto
  const isCryptoAccount = useMemo(() => {
    const p = String(account?.product || "").toLowerCase();
    const t = String(account?.type || "").toLowerCase();
    return p.includes("crypto") || t === "crypto";
  }, [account]);

  // ----------- Auth + chargement compte + placements ----------- //
  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) {
        navigate("/");
        return;
      }

      setUser(data.user);
      setUserEmail(data.user.email || "");
      await fetchAccountAndHoldings(data.user.id, accountId);
    };

    init();
  }, [navigate, accountId]);

  const fetchAccountAndHoldings = async (userId, accId) => {
    setLoading(true);
    setError("");

    // Récupérer le compte
    const { data: accountData, error: accError } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("id", accId)
      .single();

    if (accError || !accountData) {
      console.error(accError);
      setError("Compte introuvable ou inaccessible.");
      setLoading(false);
      return;
    }

    setAccount(accountData);

    // Récupérer les placements + l'instrument lié
    const { data: holdingsData, error: holdError } = await supabase
      .from("holdings")
      .select(
        `
        *,
        instrument:instruments!holdings_instrument_id_fkey (
          name,
          symbol,
          exchange,
          asset_class
        )
      `
      )
      .eq("user_id", userId)
      .eq("account_id", accId)
      .order("created_at", { ascending: true });

    if (holdError) {
      console.error(holdError);
      setError("Erreur lors du chargement des placements.");
      setHoldings([]);
    } else {
      setHoldings(holdingsData || []);
    }

    setLoading(false);
  };

  // ----------- Formulaire ajout placement (achat) ----------- //
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm({
      label: "",
      symbol: "",
      quantity: "",
      buyPrice: "",
      instrumentId: null,
    });
    setSearchResults([]);
    setSearchError("");
  };

  // --- Autocomplétion : CoinGecko si compte crypto, sinon Finnhub --- //
  useEffect(() => {
    let query = form.symbol.trim();
    if (!query) query = form.label.trim();

    if (query.length < 2) {
      setSearchResults([]);
      setSearchError("");
      return;
    }

    let cancelled = false;

    const run = async () => {
      setSearchLoading(true);
      setSearchError("");

      try {
        // ✅ CRYPTO -> CoinGecko
        if (isCryptoAccount) {
          const results = await coingeckoSearch(query);
          if (!cancelled) setSearchResults(results);
          return;
        }

        // ✅ ACTIONS/ETF -> Finnhub
        if (!FINNHUB_API_KEY) {
          if (!cancelled) {
            setSearchResults([]);
            setSearchError("Clé Finnhub manquante : suggestions indisponibles.");
          }
          return;
        }

        const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(
          query
        )}&token=${FINNHUB_API_KEY}`;

        const res = await fetch(url);
        if (!res.ok) {
          console.warn("Erreur API Finnhub search, status:", res.status);
          if (!cancelled) {
            setSearchResults([]);
            setSearchError("Impossible de récupérer les suggestions.");
          }
          return;
        }

        const json = await res.json();
        if (!cancelled) setSearchResults(json.result || []);
      } catch (err) {
        console.error("Autocomplete error:", err);
        if (!cancelled) {
          setSearchError("Impossible de récupérer les suggestions.");
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    };

    const timer = setTimeout(run, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.symbol, form.label, isCryptoAccount]);

  // Quand l'utilisateur choisit une suggestion
  const handlePickSuggestion = async (item) => {
    const isCoinGecko = item?.source === "coingecko";
    const pickedSymbol = isCoinGecko
      ? String(item.symbol || "").toUpperCase()
      : item.symbol || "";

    const pickedLabel = isCoinGecko
      ? item.description || pickedSymbol
      : item.description || item.symbol || "";

    // maj symbole + libellé visibles dans le formulaire
    setForm((prev) => ({
      ...prev,
      symbol: pickedSymbol,
      label: pickedLabel || prev.label,
    }));

    setSearchResults([]);
    setSearchError("");

    // si pas de symbole, on s'arrête
    if (!pickedSymbol) return;

    // 🔒 Sécurité métier: sur compte crypto, on n’accepte que CoinGecko
    if (isCryptoAccount && !isCoinGecko) {
      setError(
        "Ce compte est un compte crypto : sélectionne une cryptomonnaie (CoinGecko), pas un ETF/action."
      );
      return;
    }

    // 1) on récupère ou crée l'instrument dans la BDD
    // ⚠️ Sans modifier ta BDD : on stocke l’id coingecko dans exchange sous la forme `coingecko:<id>`
    const exchangeKey = isCoinGecko && item.id ? `coingecko:${item.id}` : null;

    let instrumentId = null;
    try {
      let q = supabase.from("instruments").select("id, symbol, exchange");

      if (isCoinGecko && exchangeKey) {
        // ✅ Pour éviter collision avec ETFs (BTC/ETH), on identifie la crypto via exchange
        q = q.eq("exchange", exchangeKey);
      } else {
        q = q.eq("symbol", pickedSymbol);
      }

      const { data: existing, error: existingError } = await q.limit(1);
      if (existingError) throw existingError;

      if (existing && existing.length > 0) {
        instrumentId = existing[0].id;
      } else {
        const insertPayload = {
          symbol: pickedSymbol,
          name: pickedLabel || pickedSymbol,
          asset_class: isCoinGecko ? "crypto" : item.type || null,
          currency: isCoinGecko ? "EUR" : null,
          exchange: isCoinGecko ? exchangeKey : null,
        };

        const { data: inserted, error: insertError } = await supabase
          .from("instruments")
          .insert(insertPayload)
          .select("id")
          .single();

        if (insertError) throw insertError;
        instrumentId = inserted.id;
      }
    } catch (err) {
      console.error("Erreur Supabase instruments:", err);
      setError("Erreur lors de la création/récupération de l'instrument.");
      return;
    }

    if (instrumentId) {
      setForm((prev) => ({ ...prev, instrumentId }));
    }

    // 2) on récupère le prix actuel
    let price = null;

    // ✅ CRYPTO -> CoinGecko prix EUR
    if (isCoinGecko && item.id) {
      price = await coingeckoPriceEUR(item.id);
    } else {
      // ---- Essai 1 : Finnhub ----
      if (FINNHUB_API_KEY && pickedSymbol) {
        try {
          const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
            pickedSymbol
          )}&token=${FINNHUB_API_KEY}`;

          const res = await fetch(url);
          if (!res.ok) {
            console.warn("Erreur API Finnhub quote, status:", res.status);
          } else {
            const quote = await res.json();
            console.log("Quote Finnhub pour", pickedSymbol, quote);

            if (
              quote &&
              typeof quote.c === "number" &&
              !Number.isNaN(quote.c) &&
              quote.c > 0
            ) {
              price = quote.c;
            }
          }
        } catch (err) {
          console.error("Erreur Finnhub quote:", err);
        }
      }

      // ---- Essai 2 : EODHD (fallback) ----
      if (!price && pickedSymbol) {
        const eodPrice = await fetchEodhdPrice(pickedSymbol);
        console.log("Prix EODHD pour", pickedSymbol, eodPrice);
        if (
          typeof eodPrice === "number" &&
          !Number.isNaN(eodPrice) &&
          eodPrice > 0
        ) {
          price = eodPrice;
        }
      }
    }

    // ---- Préremplissage si prix trouvé ----
    if (price) {
      setForm((prev) => ({
        ...prev,
        buyPrice: Number(price).toFixed(2),
      }));
    }
  };

  // ----------- Création / mise à jour de holding + mouvement (ACHAT) ----------- //
  const handleCreateHolding = async (e) => {
    e.preventDefault();
    if (!user || !account) return;

    const quantity = form.quantity
      ? parseFloat(String(form.quantity).replace(",", "."))
      : 0;
    const buyPrice = form.buyPrice
      ? parseFloat(String(form.buyPrice).replace(",", "."))
      : 0;

    if (!quantity || !buyPrice) {
      setError(
        "Merci de renseigner une quantité et un prix d'achat unitaire valides."
      );
      return;
    }

    if (!form.instrumentId) {
      setError("Merci de sélectionner un instrument dans la liste.");
      return;
    }

    const label =
      form.label.trim() || form.symbol.trim() || "Nouveau placement";

    setSaving(true);
    setError("");

    try {
      // 1) On regarde si un holding existe déjà
      const { data: existingRows, error: existingError } = await supabase
        .from("holdings")
        .select("*")
        .eq("user_id", user.id)
        .eq("account_id", account.id)
        .eq("instrument_id", form.instrumentId)
        .limit(1);

      if (existingError) throw existingError;

      const existingHolding =
        existingRows && existingRows.length > 0 ? existingRows[0] : null;

      let holdingId = null;

      if (existingHolding) {
        // Holding déjà existant → maj qty + PRU
        const oldQty = Number(existingHolding.quantity ?? 0);
        const oldPru = Number(existingHolding.avg_buy_price ?? 0);
        const newQty = oldQty + quantity;

        const totalCostOld = oldQty * oldPru;
        const totalCostNew = quantity * buyPrice;
        const newAvgBuyPrice =
          newQty > 0 ? (totalCostOld + totalCostNew) / newQty : 0;

        const { data: updated, error: updateError } = await supabase
          .from("holdings")
          .update({
            quantity: newQty,
            avg_buy_price: newAvgBuyPrice,
            asset_label: label,
            current_price: buyPrice,
            current_value: newQty * buyPrice,
          })
          .eq("id", existingHolding.id)
          .select("id")
          .single();

        if (updateError) throw updateError;
        holdingId = updated.id;
      } else {
        // Nouveau holding
        const { data: inserted, error: insertHoldError } = await supabase
          .from("holdings")
          .insert({
            user_id: user.id,
            account_id: account.id,
            instrument_id: form.instrumentId,
            quantity,
            avg_buy_price: buyPrice,
            asset_label: label,
            current_price: buyPrice,
            current_value: quantity * buyPrice,
          })
          .select("id")
          .single();

        if (insertHoldError) throw insertHoldError;
        holdingId = inserted.id;
      }

      // 2) Mouvement BUY
      if (holdingId) {
        const amount = quantity * buyPrice;
        const { error: movError } = await supabase.from("movements").insert({
          user_id: user.id,
          account_id: account.id,
          holding_id: holdingId,
          type: "BUY",
          amount,
          unit_price: buyPrice,
          quantity,
          description: `Achat ${label}`,
          occurred_at: new Date().toISOString(),
        });

        if (movError) {
          console.error("Erreur mouvement BUY :", movError);
        }
      }

      await fetchAccountAndHoldings(user.id, account.id);
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error(err);
      setError("Erreur lors de l'ajout du placement.");
    } finally {
      setSaving(false);
    }
  };

  // ----------- VENTE d’un placement ----------- //
  const openSellModal = (holding) => {
    setSellModalHolding(holding);
    setSellForm({ quantityToSell: "" });
    setError("");
  };

  const handleSellChange = (e) => {
    const { name, value } = e.target;
    setSellForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSellSubmit = async (e) => {
    e.preventDefault();
    if (!user || !account || !sellModalHolding) return;

    const qtyToSell = sellForm.quantityToSell
      ? parseFloat(String(sellForm.quantityToSell).replace(",", "."))
      : 0;

    if (!qtyToSell) {
      setError("Merci de renseigner une quantité à vendre valide.");
      return;
    }

    const currentQty = Number(sellModalHolding.quantity ?? 0);
    if (qtyToSell > currentQty) {
      setError("Impossible de vendre plus que la quantité détenue.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const holdingId = sellModalHolding.id;
      const label =
        sellModalHolding.instrument?.name ||
        sellModalHolding.instrument?.symbol ||
        "Placement";

      const sellPricePerUnit =
        sellModalHolding.current_price != null
          ? Number(sellModalHolding.current_price)
          : Number(sellModalHolding.avg_buy_price ?? 0);

      const newQty = currentQty - qtyToSell;

      if (newQty <= 0) {
        const { error: delError } = await supabase
          .from("holdings")
          .delete()
          .eq("id", holdingId);

        if (delError) throw delError;
      } else {
        const { error: updError } = await supabase
          .from("holdings")
          .update({
            quantity: newQty,
            current_price: sellPricePerUnit,
            current_value: newQty * sellPricePerUnit,
          })
          .eq("id", holdingId);

        if (updError) throw updError;
      }

      const amount = qtyToSell * sellPricePerUnit;

      const { error: movError } = await supabase.from("movements").insert({
        user_id: user.id,
        account_id: account.id,
        holding_id: holdingId,
        type: "SELL",
        amount,
        unit_price: sellPricePerUnit,
        quantity: qtyToSell,
        description: `Vente ${label}`,
        occurred_at: new Date().toISOString(),
      });

      if (movError) {
        console.error("Erreur mouvement SELL :", movError);
      }

      await fetchAccountAndHoldings(user.id, account.id);
      setSellModalHolding(null);
      setSellForm({ quantityToSell: "" });
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la vente du placement.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("olympe_remember_me");
    navigate("/");
  };

  // valeur du compte = somme (quantité * PRU)
  const totalAccountValue = useMemo(() => {
    if (!holdings || holdings.length === 0) return 0;
    return holdings.reduce((sum, h) => {
      const qty = Number(h.quantity ?? 0);
      const pru = Number(h.avg_buy_price ?? 0);
      return sum + qty * pru;
    }, 0);
  }, [holdings]);

  // ---------------- Rendu --------------- //
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
            active
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
          <SidebarItem
            icon={SlidersHorizontal}
            label="Simulation"
            onClick={() => navigate("/simulation")}
          />
          {/* ✅ Bouton Assistant IA ajouté */}
          <SidebarItem
            icon={Bot}
            label="Assistant IA"
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

      {/* MAIN */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* TOPBAR */}
        <header className="h-16 bg-white flex items-center justify-between px-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/accounts")}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft size={16} />
              Retour
            </button>
            <span className="text-sm text-gray-500">
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-700">
              Valeur du compte :{" "}
              <span className="font-semibold text-[#D4AF37]">
                {totalAccountValue
                  ? totalAccountValue.toLocaleString("fr-FR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "—"}{" "}
                {account?.currency || "EUR"}
              </span>
            </p>
          </div>
        </header>

        {/* CONTENU */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {/* Infos compte */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              {isCryptoAccount ? "Compte crypto" : "Compte d'investissement"}
            </p>
            <h1 className="text-lg font-semibold text-gray-900">
              Placements du compte : {account?.name || "—"}
            </h1>
            <p className="text-sm text-gray-500">
              Produit :{" "}
              <span className="font-medium text-gray-800">
                {account?.product || "—"}
              </span>{" "}
              — Type :{" "}
              <span className="font-medium text-gray-800">
                {account?.type ? TYPE_LABELS[account.type] || account.type : "—"}
              </span>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {isCryptoAccount
                ? "Sur un compte crypto, les suggestions viennent de CoinGecko (cryptomonnaies natives)."
                : "Sur un compte investissement, les suggestions viennent de Finnhub (actions/ETF) avec fallback EODHD."}
            </p>
          </div>

          {/* Carte placements */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-800">
                Placements du compte
              </p>
              <motion.button
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97, y: 0 }}
                onClick={() => {
                  setShowForm(true);
                  setError("");
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0F1013] text-xs font-semibold text-white shadow-sm hover:bg-black"
              >
                <Plus size={14} />
                Nouveau placement
              </motion.button>
            </div>

            {loading ? (
              <div className="px-4 py-6 text-sm text-gray-500">
                Chargement des placements...
              </div>
            ) : holdings.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500">
                Aucun placement pour ce compte pour le moment. Ajoute ton premier
                titre avec le bouton{" "}
                <span className="font-semibold">“Nouveau placement”</span>.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                <div className="px-4 py-2 text-[11px] uppercase text-gray-400 flex">
                  <div className="w-4/12">Libellé</div>
                  <div className="w-2/12 text-right">Quantité</div>
                  <div className="w-2/12 text-right">PRU</div>
                  <div className="w-2/12 text-right">Cours actuel</div>
                  <div className="w-2/12 text-right">Valeur</div>
                  <div className="w-[80px] text-right">Actions</div>
                </div>

                {holdings.map((h, index) => {
                  const label =
                    h.instrument?.name || h.instrument?.symbol || "Placement";

                  const qty = Number(h.quantity ?? 0);
                  const avgPrice = Number(h.avg_buy_price ?? 0);
                  const currentPrice =
                    h.current_price != null ? Number(h.current_price) : avgPrice;
                  const value = qty * currentPrice;

                  return (
                    <motion.div
                      key={h.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="px-4 py-2 text-sm flex items-center"
                    >
                      <div className="w-4/12 flex flex-col">
                        <span className="font-medium text-gray-900">
                          {label}
                        </span>
                        {h.created_at && (
                          <span className="text-[11px] text-gray-400">
                            Ajouté le{" "}
                            {new Date(h.created_at).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </div>

                      <div className="w-2/12 text-right text-gray-800">{qty}</div>

                      <div className="w-2/12 text-right text-gray-800">
                        {avgPrice.toLocaleString("fr-FR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        €
                      </div>

                      <div className="w-2/12 text-right text-gray-800">
                        {currentPrice.toLocaleString("fr-FR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        €
                      </div>

                      <div className="w-2/12 text-right font-semibold text-gray-900">
                        {value.toLocaleString("fr-FR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        €
                      </div>

                      <div className="w-[80px] flex justify-end">
                        <button
                          onClick={() => openSellModal(h)}
                          className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          Vendre
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-2 text-sm bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* MODAL AJOUT PLACEMENT (ACHAT) */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 flex items-center justify-center bg-black/40"
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                className="w-full max-w-md bg-white rounded-lg shadow-xl border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">
                      Nouveau placement
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                      {isCryptoAccount
                        ? "Compte crypto : tape un nom ou symbole (ex: BTC, Ethereum) → CoinGecko."
                        : "Compte investissement : tape un symbole ou nom → Finnhub (fallback EODHD)."}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    Fermer
                  </button>
                </div>

                <form onSubmit={handleCreateHolding} className="space-y-3">
                  {/* Libellé */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">
                      Libellé / nom du placement
                    </label>
                    <input
                      type="text"
                      name="label"
                      value={form.label}
                      onChange={handleFormChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/60 focus:border-[#D4AF37]"
                      placeholder={
                        isCryptoAccount ? "Ex : Bitcoin" : "Ex : ETF MSCI World"
                      }
                    />
                  </div>

                  {/* Symbole + suggestions */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">
                      {isCryptoAccount ? "Symbole / recherche crypto" : "Symbole (ticker)"}
                    </label>
                    <input
                      type="text"
                      name="symbol"
                      value={form.symbol}
                      onChange={handleFormChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/60 focus:border-[#D4AF37]"
                      placeholder={
                        isCryptoAccount
                          ? 'Ex : BTC, ETH... ou "Ethereum"'
                          : 'Ex : AAPL, CW8.PA... ou "Apple"'
                      }
                    />

                    {searchLoading && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        Recherche en cours...
                      </p>
                    )}
                    {searchError && (
                      <p className="text-[10px] text-red-500 mt-1">
                        {searchError}
                      </p>
                    )}

                    {searchResults.length > 0 && (
                      <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-md bg-white shadow-sm text-xs">
                        {searchResults.slice(0, 8).map((item) => {
                          const key = `${item.source || "finnhub"}-${
                            item.id || item.symbol
                          }-${item.description || ""}`;

                          const left = item.symbol || "";
                          const right = item.description || "";

                          return (
                            <button
                              type="button"
                              key={key}
                              onClick={() => handlePickSuggestion(item)}
                              className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
                            >
                              <span className="font-medium">{left}</span>
                              {right && (
                                <span className="text-gray-500 ml-1">
                                  — {right}
                                  {item.source === "coingecko" &&
                                    item.market_cap_rank && (
                                      <span className="text-gray-400">
                                        {" "}
                                        (rank {item.market_cap_rank})
                                      </span>
                                    )}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {!isCryptoAccount && !FINNHUB_API_KEY && (
                      <p className="text-[10px] text-red-500 mt-1">
                        Clé Finnhub manquante : aucun remplissage automatique
                        possible.
                      </p>
                    )}
                  </div>

                  {/* Quantité + prix */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">
                        Quantité
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        name="quantity"
                        value={form.quantity}
                        onChange={handleFormChange}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/60 focus:border-[#D4AF37]"
                        placeholder="Ex : 0.25"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">
                        Prix d&apos;achat unitaire (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        name="buyPrice"
                        value={form.buyPrice}
                        onChange={handleFormChange}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/60 focus:border-[#D4AF37]"
                        placeholder="Ex : 50.00"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        resetForm();
                      }}
                      className="px-4 py-2 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.03, y: -1 }}
                      whileTap={{ scale: 0.96, y: 0 }}
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 text-xs rounded-md bg-[#D4AF37] text-[#0F1013] font-semibold hover:bg-[#e0c35b] disabled:opacity-60"
                    >
                      {saving ? "Enregistrement..." : "Ajouter le placement"}
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODAL VENTE */}
        <AnimatePresence>
          {sellModalHolding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 flex items-center justify-center bg-black/40"
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                className="w-full max-w-md bg-white rounded-lg shadow-xl border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">
                      Vendre un placement
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Indique la quantité à vendre. Le prix de vente utilisé
                      sera le cours actuel affiché pour ce titre (ou le PRU si
                      aucun cours n&apos;est disponible).
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSellModalHolding(null);
                      setSellForm({ quantityToSell: "" });
                    }}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    Fermer
                  </button>
                </div>

                <form onSubmit={handleSellSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-700">
                      Quantité à vendre (max {sellModalHolding.quantity})
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      name="quantityToSell"
                      value={sellForm.quantityToSell}
                      onChange={handleSellChange}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/60 focus:border-[#D4AF37]"
                      placeholder="Ex : 0.05"
                    />
                  </div>

                  <p className="text-[11px] text-gray-500">
                    Cours actuel utilisé pour la vente :{" "}
                    <span className="font-medium">
                      {(
                        sellModalHolding.current_price ??
                        sellModalHolding.avg_buy_price ??
                        0
                      ).toLocaleString("fr-FR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      €
                    </span>
                  </p>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSellModalHolding(null);
                        setSellForm({ quantityToSell: "" });
                      }}
                      className="px-4 py-2 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.03, y: -1 }}
                      whileTap={{ scale: 0.96, y: 0 }}
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 text-xs rounded-md bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-60"
                    >
                      {saving ? "Traitement..." : "Vendre"}
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// SidebarItem
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
