import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import heroImg from "../assets/Background_Login.svg";
import logoOlympe from "../assets/Olyme_logo_remove.png";

export default function Auth() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login"); // "login" ou "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false); // pour le login uniquement
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // gestion "Se souvenir de moi"
        if (remember) {
          localStorage.setItem("olympe_remember_me", "1");
        } else {
          localStorage.removeItem("olympe_remember_me");
        }

        navigate("/dashboard");
      }

      if (mode === "register") {
        // 1️⃣ Création du compte
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;

        // 2️⃣ Connexion auto juste après inscription
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) throw loginError;

        // 3️⃣ On considère qu'un nouveau compte est "remember me" par défaut
        localStorage.setItem("olympe_remember_me", "1");

        // 4️⃣ Redirection vers le dashboard
        navigate("/dashboard");
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1013] text-white flex items-center justify-center px-6 lg:px-16">
      <div className="w-full max-w-6xl flex gap-10 items-center">
        {/* --- CARTE AUTH --- */}
        <div className="w-full max-w-md bg-[#15161b]/95 border border-white/5 rounded-3xl p-8 shadow-[0_20px_80px_rgba(0,0,0,.35)]">
          {/* Logo */}
          <div className="flex justify-center mb-4">
            <img
              src={logoOlympe}
              alt="Olympe Finance logo"
              className="w-52 h-auto select-none pointer-events-none"
            />
          </div>

          {/* Bloc animé login/register */}
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="text-xl font-semibold mb-4 text-center">
                {mode === "login" ? "Connexion" : "Créer un compte"}
              </h2>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="text-sm mb-1 block">E-mail</label>
                  <input
                    type="email"
                    className="w-full bg-[#0f1013] border border-white/5 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#d4af37] transition"
                    placeholder="tonmail@exemple.fr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="text-sm mb-1 block">Mot de passe</label>
                  <input
                    type="password"
                    className="w-full bg-[#0f1013] border border-white/5 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#d4af37] transition"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {/* Options spécifiques au mode login */}
                {mode === "login" && (
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={() => setRemember(!remember)}
                        className="accent-[#d4af37]"
                      />
                      <span className="text-white/70">Se souvenir de moi</span>
                    </label>

                    <button
                      type="button"
                      className="text-[#d4af37] hover:text-[#f2cc58] transition text-sm"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                )}

                {errorMsg && (
                  <p className="text-sm text-red-400 bg-red-400/10 rounded-lg p-2">
                    {errorMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#d4af37] hover:bg-[#c39e30] text-black font-medium py-2 rounded-lg transition mt-2"
                >
                  {loading
                    ? mode === "login"
                      ? "Connexion..."
                      : "Création..."
                    : mode === "login"
                    ? "Connexion"
                    : "Créer mon compte"}
                </button>
              </form>

              {/* Switch texte en bas */}
              <p className="text-xs text-white/50 mt-6 text-center">
                {mode === "login" ? (
                  <>
                    Nouveau sur Olympe ?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("register")}
                      className="text-[#d4af37]"
                    >
                      Crée un compte
                    </button>
                  </>
                ) : (
                  <>
                    Déjà un compte ?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="text-[#d4af37]"
                    >
                      Se connecter
                    </button>
                  </>
                )}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* --- PARTIE DROITE (illustration) --- */}
        <div className="hidden lg:block flex-1 relative h-[460px]">
          <img
            src={heroImg}
            alt="Visualisation financière"
            className="w-full h-full object-contain pointer-events-none select-none"
          />

          <div className="absolute bottom-0 left-10 bg-black/50 border border-white/5 rounded-2xl px-6 py-5 max-w-sm backdrop-blur">
            <h2 className="font-semibold mb-1">Visualise ton patrimoine</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Tableaux de bord, graphiques, indicateurs. Une interface pensée
              pour comprendre la finance sans se prendre la tête.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
