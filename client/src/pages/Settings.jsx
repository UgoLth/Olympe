// src/pages/Settings.jsx

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  PieChart,
  Wallet,
  GraduationCap,
  Settings as SettingsIcon,
  LogOut,
  Home,
  SlidersHorizontal,
  Bot,
} from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "../lib/supabaseClient";

export default function Settings() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);

  // ✏️ États pour les formulaires
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingName, setLoadingName] = useState(false);
  const [message, setMessage] = useState("");

  // 🔄 Récupération user + profil
  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        navigate("/");
        return;
      }

      const currentUser = data.user;
      setUser(currentUser);
      setUserEmail(currentUser.email);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", currentUser.id)
        .single();

      if (!profileError && profileData) {
        setProfile(profileData);
        setFirstName(profileData.first_name || "");
        setLastName(profileData.last_name || "");
      }

      setLoading(false);
    };

    fetchData();
  }, [navigate]);

  const createdAt = user
    ? new Date(user.created_at).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  // ✉️ Mise à jour de l'email
  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!user) {
      setMessage("Utilisateur non connecté.");
      return;
    }

    const cleanedEmail = newEmail.trim().toLowerCase();
    if (!cleanedEmail) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanedEmail)) {
      setMessage("Format d’adresse email invalide.");
      return;
    }

    setLoadingEmail(true);
    const { data, error } = await supabase.auth.updateUser({
      email: cleanedEmail,
    });
    setLoadingEmail(false);

    if (error) {
      console.error("Erreur update email :", error);
      setMessage("Erreur lors de la mise à jour de l’email : " + error.message);
    } else {
      const updatedEmail = data?.user?.email ?? cleanedEmail;
      setUser((prev) => (prev ? { ...prev, email: updatedEmail } : prev));
      setUserEmail(updatedEmail);
      setNewEmail("");
      setMessage("Email mis à jour avec succès.");
    }
  };

  // 🔐 Mise à jour du mot de passe
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!user) {
      setMessage("Utilisateur non connecté.");
      return;
    }

    if (!newPassword) return;

    setLoadingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoadingPassword(false);

    if (error) {
      console.error("Erreur update password :", error);
      setMessage(
        "Erreur lors de la mise à jour du mot de passe : " + error.message
      );
    } else {
      setMessage("Mot de passe mis à jour avec succès.");
      setNewPassword("");
    }
  };

  // 👤 Mise à jour nom / prénom (table profiles)
  const handleUpdateName = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!user) {
      setMessage("Utilisateur non connecté.");
      return;
    }

    // Si les deux sont vides, on ne fait rien
    if (!firstName.trim() && !lastName.trim()) {
      setMessage("Merci de renseigner au moins un des deux champs.");
      return;
    }

    setLoadingName(true);
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id, // FK vers auth.users.id
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
        },
        { onConflict: "id" }
      )
      .select("first_name, last_name")
      .single();

    setLoadingName(false);

    if (error) {
      console.error("Erreur update nom/prénom :", error);
      setMessage(
        "Erreur lors de la mise à jour du nom/prénom : " + error.message
      );
    } else {
      setProfile(data);
      setMessage("Nom / prénom mis à jour avec succès.");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("olympe_remember_me");
    navigate("/");
  };

  // 🚫 "fausse" suppression : confirmation + déconnexion
  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm(
      "Es-tu sûr de vouloir supprimer ton compte ?\n\nPour l’instant, cela va simplement te déconnecter."
    );

    if (!confirmDelete) return;

    await supabase.auth.signOut();
    localStorage.removeItem("olympe_remember_me");
    navigate("/");
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
            icon={GraduationCap}
            label="Glossaire"
            onClick={() => navigate("/glossaire")}
          />
          <SidebarItem
            icon={SlidersHorizontal}
            label="Simulation"
            onClick={() => navigate("/simulation")}
          />
          <SidebarItem icon={Bot} label="Assistant IA" onClick={() => navigate("/assistant")} />

        </nav>

        <div className="mt-auto px-4 pb-4 space-y-2">
          <button
            onClick={() => navigate("/settings")}
            className="w-full flex items-center gap-2 text-sm text-white/70 hover:text-white transition"
          >
            <SettingsIcon size={16} />
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
        {/* Topbar */}
        <header className="h-16 bg-white flex items-center justify-between px-6 border-b border-gray-200">
          <div>
            <p className="text-sm text-gray-500">Paramètres du compte</p>
            <h1 className="text-xl font-semibold text-gray-900">
              Profil & sécurité
            </h1>
          </div>
        </header>

        {/* CONTENU AVEC ANIMATION */}
        <motion.div
          className="flex-1 p-6 space-y-6 overflow-y-auto"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {loading || !user ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-gray-500">
                Chargement des paramètres...
              </p>
            </div>
          ) : (
            <>
              {/* Données personnelles */}
              <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h2 className="text-lg font-semibold mb-4">
                  Données personnelles
                </h2>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <InfoRow label="Nom" value={profile?.last_name || "—"} />
                  <InfoRow label="Prénom" value={profile?.first_name || "—"} />
                  <InfoRow label="Email" value={user.email} />
                  <InfoRow
                    label="Date de création du compte"
                    value={createdAt}
                  />
                </div>
              </section>

              {/* Actions */}
              <section className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                <h2 className="text-lg font-semibold mb-2">Actions</h2>

                {/* Modifier nom / prénom */}
                <div className="border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-sm font-medium">
                    Modifier le nom et le prénom
                  </p>
                  <form
                    onSubmit={handleUpdateName}
                    className="flex flex-col md:flex-row gap-3"
                  >
                    <input
                      type="text"
                      placeholder="Prénom"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/60"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Nom"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/60"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={loadingName}
                      className="px-4 py-2 rounded-lg text-sm bg-[#0F1013] text-white hover:bg-black disabled:opacity-60"
                    >
                      {loadingName ? "En cours..." : "Mettre à jour"}
                    </button>
                  </form>
                </div>

                {/* Modifier email */}
                <div className="border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-sm font-medium">
                    Modifier l’adresse email
                  </p>
                  <form
                    onSubmit={handleUpdateEmail}
                    className="flex flex-col md:flex-row gap-3"
                  >
                    <input
                      type="email"
                      placeholder="Nouvelle adresse email"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/60"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={loadingEmail}
                      className="px-4 py-2 rounded-lg text-sm bg-[#D4AF37] text-white hover:bg-[#c59a2f] disabled:opacity-60"
                    >
                      {loadingEmail ? "En cours..." : "Mettre à jour"}
                    </button>
                  </form>
                </div>

                {/* Modifier mot de passe */}
                <div className="border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-sm font-medium">
                    Modifier le mot de passe
                  </p>
                  <form
                    onSubmit={handleUpdatePassword}
                    className="flex flex-col md:flex-row gap-3"
                  >
                    <input
                      type="password"
                      placeholder="Nouveau mot de passe"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/60"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="submit"
                      disabled={loadingPassword}
                      className="px-4 py-2 rounded-lg text-sm bg-[#0F1013] text-white hover:bg-black disabled:opacity-60"
                    >
                      {loadingPassword ? "En cours..." : "Mettre à jour"}
                    </button>
                  </form>
                </div>

                {/* Supprimer + déconnexion */}
                <div className="flex flex-col md:flex-row gap-3">
                  <button
                    onClick={handleDeleteAccount}
                    className="flex-1 px-4 py-2 rounded-lg text-sm border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Supprimer le compte
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex-1 px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50"
                  >
                    Se déconnecter
                  </button>
                </div>

                {message && (
                  <p className="text-xs text-gray-500 mt-1">{message}</p>
                )}
              </section>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}

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

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <span className="text-sm text-gray-900 mt-1">{value}</span>
    </div>
  );
}
