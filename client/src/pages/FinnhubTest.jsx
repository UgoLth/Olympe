import React, { useEffect } from "react";
import { searchInstrument, getQuote } from "../lib/finnhub";

export default function FinnhubTest() {
  useEffect(() => {
    const run = async () => {
      try {
        const search = await searchInstrument("AAPL"); // Recherche Apple
        console.log("🔍 Résultat SEARCH :", search);

        const quote = await getQuote("AAPL"); // Cours Apple
        console.log("💵 Résultat QUOTE :", quote);
      } catch (error) {
        console.error("❌ Erreur Finnhub :", error);
      }
    };

    run();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Test Finnhub</h2>
      <p>Regarde la console du navigateur 👀</p>
    </div>
  );
}
