// Client-side access to Alpha Vantage (https://www.alphavantage.co) — a free,
// keyed market-data API that sends proper CORS headers, so it works directly
// from a static site with no backend or proxy.
//
// The free tier is limited (currently 25 requests/day), so responses are
// cached in localStorage per symbol for a while to stretch that quota.

const API_BASE = "https://www.alphavantage.co/query";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const API_KEY_STORAGE_KEY = "fairvalue.alphaVantageApiKey";

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}

export function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key.trim());
}

function cacheKey(symbol) {
  return `fairvalue.cache.${symbol.toUpperCase()}`;
}

function readCache(symbol) {
  try {
    const raw = localStorage.getItem(cacheKey(symbol));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(symbol, data) {
  try {
    localStorage.setItem(
      cacheKey(symbol),
      JSON.stringify({ timestamp: Date.now(), data })
    );
  } catch {
    // localStorage full or unavailable — non-fatal, just skip caching.
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callApi(params) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Add your free Alpha Vantage API key above to fetch data.");

  const url = new URL(API_BASE);
  Object.entries({ ...params, apikey: apiKey }).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Alpha Vantage error (HTTP ${res.status}).`);
  const data = await res.json();

  if (data.Note || data.Information) {
    throw new Error(
      data.Note || data.Information || "Alpha Vantage rate limit reached — try again later."
    );
  }
  if (data["Error Message"]) throw new Error("Symbol not found.");

  return data;
}

function toNumber(value) {
  if (value == null || value === "None" || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Computes an annualized EPS growth rate (%) from up to `years` of annual EPS
 * history. Alpha Vantage sometimes prepends a stub entry for the current,
 * still-in-progress fiscal year (a partial-year EPS masquerading as annual),
 * which would badly understate growth — so entries are first restricted to
 * whichever fiscal-year-end (month/day) appears most often in the series.
 */
function computeEpsCagr(annualEarnings, years = 5) {
  const parsed = (annualEarnings || [])
    .map((e) => ({ date: new Date(e.fiscalDateEnding), eps: toNumber(e.reportedEPS) }))
    .filter((e) => e.eps != null && !Number.isNaN(e.date.getTime()));

  if (parsed.length < 2) return null;

  const dayKey = (d) => `${d.getMonth()}-${d.getDate()}`;
  const counts = new Map();
  parsed.forEach((e) => {
    const key = dayKey(e.date);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const modalKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const series = parsed
    .filter((e) => dayKey(e.date) === modalKey)
    .sort((a, b) => b.date - a.date) // most recent first
    .slice(0, years + 1)
    .map((e) => e.eps);

  if (series.length < 2) return null;
  const latest = series[0];
  const oldest = series[series.length - 1];
  const periods = series.length - 1;

  if (latest <= 0 || oldest <= 0) return null; // CAGR is meaningless across sign changes
  const cagr = (Math.pow(latest / oldest, 1 / periods) - 1) * 100;
  return Number.isFinite(cagr) ? cagr : null;
}

/**
 * Fetches everything needed for the Lynch fair value calc plus a price chart,
 * using a per-symbol cache to conserve the free daily request quota.
 */
export async function fetchStockData(symbol, { forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = readCache(symbol);
    if (cached) return { ...cached, fromCache: true };
  }

  // Called sequentially with a short stagger (not Promise.all) to stay under
  // Alpha Vantage's per-second/per-minute rate limits, which a burst of
  // parallel calls can trip.
  const quote = await callApi({ function: "GLOBAL_QUOTE", symbol });
  await sleep(500);
  const overview = await callApi({ function: "OVERVIEW", symbol });
  await sleep(500);
  const earnings = await callApi({ function: "EARNINGS", symbol });
  await sleep(500);
  const monthly = await callApi({ function: "TIME_SERIES_MONTHLY", symbol });

  const globalQuote = quote["Global Quote"] || {};
  const currentPrice = toNumber(globalQuote["05. price"]);
  if (!overview.Symbol && currentPrice == null) throw new Error("Symbol not found.");

  const series = monthly["Monthly Time Series"] || {};
  const history = Object.entries(series)
    .map(([date, values]) => ({ date: new Date(date), close: toNumber(values["4. close"]) }))
    .filter((p) => p.close != null)
    .sort((a, b) => a.date - b.date);

  const growthFromEarnings = computeEpsCagr(earnings.annualEarnings);
  const growthFromOverview = toNumber(overview.QuarterlyEarningsGrowthYOY);

  const result = {
    symbol: (overview.Symbol || symbol).toUpperCase(),
    companyName: overview.Name || symbol.toUpperCase(),
    currency: overview.Currency || "USD",
    currentPrice,
    trailingEps: toNumber(overview.EPS),
    trailingPE: toNumber(overview.PERatio),
    dividendYieldPct: toNumber(overview.DividendYield) != null ? toNumber(overview.DividendYield) * 100 : null,
    growthEstimatePct: growthFromEarnings,
    growthSource: growthFromEarnings != null ? "5-year historical EPS CAGR" : null,
    growthFallbackPct: growthFromOverview != null ? growthFromOverview * 100 : null,
    history,
  };

  writeCache(symbol, result);
  return { ...result, fromCache: false };
}
