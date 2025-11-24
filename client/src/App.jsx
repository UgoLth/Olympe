// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";   // ⬅️ AJOUT IMPORTANT

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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
