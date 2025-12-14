// src/pages/Accounts.jsx
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
  Plus,
  Edit3,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";

// ---- Types techniques (enum account_type dans Supabase) ----
const ACCOUNT_TYPES = [
  { value: "cash", label: "Cash / comptes courants" },
  { value: "savings", label: "Épargne (livrets…)" },
  { value: "investment", label: "Investissement (PEA, CTO…)" },
  { value: "retirement", label: "Retraite / long terme" },
  { value: "other", label: "Autre" },
];

const TYPE_LABELS = {
  cash: "Cash",
  savings: "Épargne",
  investment: "Investissement",
  retirement: "Retraite",
  other: "Autre",
};

// ---- Produits disponibles selon le type ----
const PRODUCTS_BY_TYPE = {
  cash: ["Compte courant", "Compte joint", "Compte pro"],
  savings: ["Livret A", "Livret Jeune", "LEP", "LDDS", "PEL", "Autre livret"],
  investment: ["PEA", "Compte-titres", "Assurance-vie", "Compte crypto", "Autre"],
  retirement: ["Plan épargne retraite", "Autre"],
  other: ["Autre"],
};

// Si jamais tu as un ancien compte sans type, on le devine via product
function inferTypeFromProduct(product) {
  if (!product) return null;
  for (const [type, products] of Object.entries(PRODUCTS_BY_TYPE)) {
    if (products.includes(product)) return type;
  }
  return null;
}

export default function Accounts() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const [form, setForm] = useState({
    name: "",
    type: "",
    product: "",
    initialAmount: "",
    currency: "EUR",
    creationDate: new Date().toISOString().slice(0, 10),
  });

  // ---------------- Vérif utilisateur + chargement
  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        navigate("/");
        return;
      }
      setUser(data.user);
      setUserEmail(data.user.email || "");
      fetchAccounts(data.user.id);
    };
    init();
  }, [navigate]);

  const fetchAccounts = async (userId) => {
    setLoadingAccounts(true);
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setError("Erreur lors du chargement des comptes.");
    } else {
      setAccounts(data || []);
    }
    setLoadingAccounts(false);
  };

  // ---------------- Gestion formulaire
  const handleChange = (e) => {
    const { name, value } = e.target;

    // Si on change le type → reset du produit
    if (name === "type") {
      setForm((prev) => ({
        ...prev,
        type: value,
        product: "",
      }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setEditingAccount(null);
    setForm({
      name: "",
      type: "",
      product: "",
      initialAmount: "",
      currency: "EUR",
      creationDate: new Date().toISOString().slice(0, 10),
    });
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (account) => {
    const inferredType = account.type || inferTypeFromProduct(account.product);

    setEditingAccount(account);
    setForm({
      name: account.name,
      type: inferredType || "",
      product: account.product || "",
      initialAmount: account.initial_amount?.toString() ?? "",
      currency: account.currency,
      creationDate: account.created_at?.slice(0, 10) ?? "",
    });

    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setError("");

    const initial = form.initialAmount
      ? parseFloat(form.initialAmount.replace(",", ".")) // au cas où l’utilisateur tape une virgule
      : 0;

    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      type: form.type || null, // ✔ enum PostgreSQL propre
      product: form.product || null,
      currency: form.currency,
      initial_amount: initial,
      current_amount: editingAccount?.current_amount ?? initial,
    };

    try {
      if (editingAccount) {
        const { error } = await supabase
          .from("accounts")
          .update(payload)
          .eq("id", editingAccount.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts").insert([payload]);
        if (error) throw error;
      }

      fetchAccounts(user.id);
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error(err);
      setError("Erreur lors de l'enregistrement du compte.");
    }

    setSaving(false);
  };

  const handleDelete = async (account) => {
    if (!user) return;
    if (!window.confirm(`Supprimer "${account.name}" ?`)) return;

    await supabase.from("accounts").delete().eq("id", account.id);
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("olympe_remember_me");
    navigate("/");
  };

  const availableProducts =
    form.type && PRODUCTS_BY_TYPE[form.type] ? PRODUCTS_BY_TYPE[form.type] : [];

  const totalValue = "— €";

  return (
    <div className="h-screen bg-[#F5F5F5] flex overflow-hidden">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0F1013] text-white flex flex-col">
        <div className="flex items-start flex-col justify-center px-6 h-16 border-b border-white/5">
          <p className="text-sm tracking-[0.25em] text-[#D4AF37] uppercase">
            OLYMPE
          </p>
          <p className="text-xs text-white/50 -mt-1">{userEmail}</p>
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
        {/* TOP BAR */}
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {new Date().toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <p className="text-sm">
            Valeur totale :{" "}
            <span className="font-semibold text-[#D4AF37]">{totalValue}</span>
          </p>
        </header>

        {/* CONTENT */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-semibold">Comptes & placements</h1>
              <p className="text-sm text-gray-500">
                Gérez vos comptes et vos soldes initiaux.
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={openCreateForm}
              className="bg-[#D4AF37] text-[#0F1013] px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-[#e0c35b]"
            >
              <Plus size={16} className="inline-block mr-2" />
              Nouveau compte
            </motion.button>
          </div>

          {error && (
            <div className="mb-4 text-sm bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg">
              {error}
            </div>
          )}

          {/* LISTE DES COMPTES */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <p className="font-medium text-gray-800 text-sm">Vos comptes</p>
              <p className="text-xs text-gray-500">{accounts.length} compte(s)</p>
            </div>

            {loadingAccounts ? (
              <p className="px-4 py-6 text-sm text-gray-500">Chargement...</p>
            ) : accounts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-500">
                Aucun compte pour le moment. Ajoutez un compte pour commencer.
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {accounts.map((account, index) => {
                  const type = account.type || inferTypeFromProduct(account.product);
                  const isInvestmentAccount = type === "investment" || type === "retirement";

                  return (
                    <motion.div
                      key={account.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-semibold">{account.name}</p>

                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {account.product && (
                            <span className="px-2 py-0.5 bg-gray-100 rounded-full text-[11px]">
                              {account.product}
                            </span>
                          )}

                          {type && (
                            <span className="px-2 py-0.5 bg-gray-50 rounded-full border text-[10px] text-gray-600">
                              {TYPE_LABELS[type]}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-500 mt-1">
                          Solde initial :{" "}
                          <strong>
                            {Number(account.initial_amount || 0).toLocaleString("fr-FR", {
                              minimumFractionDigits: 2,
                            })}{" "}
                            {account.currency}
                          </strong>
                          {account.created_at && (
                            <>
                              {" "}
                              • Créé le {new Date(account.created_at).toLocaleDateString("fr-FR")}
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* 👉 Bouton pour gérer les placements, seulement pour les comptes invest / retraite */}
                        {isInvestmentAccount && (
                          <button
                            onClick={() =>
                              navigate(`/accounts/${account.id}/holdings`, {
                                state: {
                                  accountId: account.id,
                                  accountName: account.name,
                                  accountType: type,
                                },
                              })
                            }
                            className="px-3 py-1.5 text-xs bg-[#0F1013] border border-[#D4AF37]/40 text-[#D4AF37] rounded hover:bg-[#1a1c21]"
                          >
                            Voir les placements
                          </button>
                        )}

                        <button
                          onClick={() => openEditForm(account)}
                          className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded hover:bg-gray-100"
                        >
                          <Edit3 size={14} className="inline-block mr-1" />
                          Modifier
                        </button>

                        <button
                          onClick={() => handleDelete(account)}
                          className="px-3 py-1.5 text-xs bg-red-50 border border-red-200 text-red-700 rounded hover:bg-red-100"
                        >
                          <Trash2 size={14} className="inline-block mr-1" />
                          Supprimer
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* MODAL FORM */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-30 flex items-center justify-center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: 20 }}
                className="bg-white w-full max-w-md rounded-lg shadow-xl p-6 border"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-base font-semibold">
                      {editingAccount ? "Modifier le compte" : "Nouveau compte"}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Renseigne les informations du compte.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowForm(false);
                      resetForm();
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Fermer
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* NOM */}
                  <div>
                    <label className="text-xs font-medium text-gray-700">Nom du compte</label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      required
                      className="w-full border rounded-md px-3 py-2 mt-1 text-sm"
                      placeholder="Ex : PEA – Trade Republic"
                    />
                  </div>

                  {/* TYPE */}
                  <div>
                    <label className="text-xs font-medium text-gray-700">Type</label>
                    <select
                      name="type"
                      value={form.type}
                      onChange={handleChange}
                      required
                      className="w-full border rounded-md px-3 py-2 mt-1 text-sm"
                    >
                      <option value="">Sélectionner...</option>
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* PRODUIT */}
                  <div>
                    <label className="text-xs font-medium text-gray-700">Produit / compte précis</label>
                    <select
                      name="product"
                      value={form.product}
                      onChange={handleChange}
                      disabled={!form.type}
                      className="w-full border rounded-md px-3 py-2 mt-1 text-sm disabled:bg-gray-100"
                    >
                      {!form.type && <option>Choisir un type d’abord...</option>}
                      {form.type && [
                        <option key={"_"} value="">
                          Sélectionner...
                        </option>,
                        ...availableProducts.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        )),
                      ]}
                    </select>
                  </div>

                  {/* SOLDE + DEVISE */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700">Solde initial</label>
                      <input
                        type="number"
                        step="0.01"
                        name="initialAmount"
                        value={form.initialAmount}
                        onChange={handleChange}
                        className="w-full border rounded-md px-3 py-2 mt-1 text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-700">Devise</label>
                      <select
                        name="currency"
                        value={form.currency}
                        onChange={handleChange}
                        className="w-full border rounded-md px-3 py-2 mt-1 text-sm"
                      >
                        <option value="EUR">EUR (€)</option>
                        <option value="USD">USD ($)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="CHF">CHF (Fr.)</option>
                      </select>
                    </div>
                  </div>

                  {/* BOUTONS */}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        resetForm();
                      }}
                      className="px-4 py-2 border rounded-md text-xs"
                    >
                      Annuler
                    </button>

                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.95 }}
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-[#D4AF37] text-[#0F1013] rounded-md text-xs font-semibold"
                    >
                      {saving ? "Enregistrement..." : editingAccount ? "Mettre à jour" : "Créer le compte"}
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

// COMPONENT SIDEBAR ITEM
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
