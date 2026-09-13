// Data layer backed by a Google Sheet (via a small Apps Script Web App) that
// uses GOOGLEFINANCE() — see google-apps-script/README.md for setup. Chosen
// over third-party APIs (Yahoo Finance, Alpha Vantage, Financial Modeling
// Prep) because it needs no per-visitor API key and isn't bound by a small
// shared daily request quota: it runs against the app owner's own Google
// account.
//
// Results are still cached in localStorage per symbol for a while, mostly
// to keep repeat lookups fast and be polite to the underlying sheet.

import { SHEETS_API_URL } from "./config.js";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

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

function toNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Growth rate (%) implied by next year's vs. this year's consensus EPS estimate. */
function computeForwardEpsGrowth(epsCurrentYear, epsNextYear) {
  if (epsCurrentYear == null || epsNextYear == null || epsCurrentYear <= 0) return null;
  const growth = ((epsNextYear - epsCurrentYear) / epsCurrentYear) * 100;
  return Number.isFinite(growth) ? growth : null;
}

/**
 * Fetches everything needed for the Lynch fair value calc plus a price chart,
 * using a per-symbol cache to avoid refetching on every visit.
 */
export async function fetchStockData(symbol, { forceRefresh = false } = {}) {
  if (!SHEETS_API_URL) {
    throw new Error(
      "No data source configured yet — deploy the Google Apps Script (see google-apps-script/README.md) and set SHEETS_API_URL in js/config.js."
    );
  }

  if (!forceRefresh) {
    const cached = readCache(symbol);
    if (cached) return { ...cached, fromCache: true };
  }

  const url = new URL(SHEETS_API_URL);
  url.searchParams.set("symbol", symbol);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Data source error (HTTP ${res.status}).`);
  const data = await res.json();

  if (data.error) throw new Error(data.error);

  const history = (data.history || [])
    .map((row) => ({ date: new Date(row.date), close: toNumber(row.close) }))
    .filter((p) => p.close != null && !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date - b.date);

  const growthEstimatePct = computeForwardEpsGrowth(data.epsCurrentYear, data.epsNextYear);

  const result = {
    symbol: (data.symbol || symbol).toUpperCase(),
    companyName: data.name || symbol.toUpperCase(),
    currency: data.currency || "USD",
    currentPrice: toNumber(data.price),
    trailingEps: toNumber(data.eps),
    trailingPE: toNumber(data.pe),
    dividendYieldPct: null, // not exposed by GOOGLEFINANCE — enter manually if known
    growthEstimatePct,
    growthSource: growthEstimatePct != null ? "next-year consensus EPS growth estimate" : null,
    history,
  };

  writeCache(symbol, result);
  return { ...result, fromCache: false };
}
