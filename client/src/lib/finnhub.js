const API_KEY = import.meta.env.VITE_FINNHUB_KEY;

export async function searchInstrument(query) {
  const url = `https://finnhub.io/api/v1/search?q=${query}&token=${API_KEY}`;
  const res = await fetch(url);
  return res.json();
}

export async function getQuote(symbol) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`;
  const res = await fetch(url);
  return res.json();
}

export async function getCandles(symbol, resolution = "D", from, to) {
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${API_KEY}`;
  const res = await fetch(url);
  return res.json();
}
