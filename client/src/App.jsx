// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";   // ⬅️ AJOUT IMPORTANT
import Glossary from "./pages/Glossary";
import Accounts from "./pages/Accounts";
import FinnhubTest from "./pages/FinnhubTest";
import AccountHoldings from "./pages/AccountHoldings";
import Portfolio from "./pages/Portfolio";
import Analyse from "./pages/Analyse";
import Simulation from "./pages/Simulation";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Page d'authentification */}
        <Route path="/" element={<Auth />} />

        {/* Dashboard */}
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Page paramètres */}
        <Route path="/settings" element={<Settings />} />  {/* ⬅️ AJOUT */}

        <Route path="/glossaire" element={<Glossary />} />

        <Route path="/accounts" element={<Accounts />} />

        <Route path="/FinnhubTest" element={<FinnhubTest />} />

        <Route path="/accounts/:accountId/holdings" element={<AccountHoldings />} />

        <Route path="/portefeuille" element={<Portfolio />} />

        <Route path="/analyse" element={<Analyse />} />

        <Route path="/simulation" element={<Simulation />} />



      </Routes>
    </BrowserRouter>
  );
}

export default App;
