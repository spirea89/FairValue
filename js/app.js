import { fetchStockData } from "./marketData.js";
import { computeFairValue, verdictFor } from "./lynch.js";
import { APP_VERSION, BUILD_DATE } from "./version.js";

document.getElementById("version-info").textContent = `Version ${APP_VERSION} · ${BUILD_DATE}`;

const form = document.getElementById("search-form");
const tickerInput = document.getElementById("ticker");
const searchBtn = document.getElementById("search-btn");
const statusEl = document.getElementById("status");

const resultSection = document.getElementById("result");
const companyNameEl = document.getElementById("company-name");
const companySymbolEl = document.getElementById("company-symbol");
const verdictBadge = document.getElementById("verdict-badge");
const cacheNote = document.getElementById("cache-note");
const metricPrice = document.getElementById("metric-price");
const metricFairValue = document.getElementById("metric-fair-value");
const metricGap = document.getElementById("metric-gap");
const metricPE = document.getElementById("metric-pe");

const inputEps = document.getElementById("input-eps");
const inputGrowth = document.getElementById("input-growth");
const inputDividend = document.getElementById("input-dividend");
const inputIncludeDividend = document.getElementById("input-include-dividend");
const recalcBtn = document.getElementById("recalc-btn");
const growthSourceNote = document.getElementById("growth-source-note");
const dividendFormulaPart = document.getElementById("dividend-formula-part");

const chartSection = document.getElementById("chart-section");
const rangeSelect = document.getElementById("range-select");
const chartCanvas = document.getElementById("price-chart");

let currentPrice = null;
let currentCurrency = "USD";
let fullHistory = [];
let priceChart = null;

const currencyFormat = (value, currency = "USD") => {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  searchBtn.disabled = isLoading;
  searchBtn.textContent = isLoading ? "Loading…" : "Calculate";
}

function readAssumptions() {
  return {
    eps: inputEps.value !== "" ? parseFloat(inputEps.value) : null,
    growthRatePct: inputGrowth.value !== "" ? parseFloat(inputGrowth.value) : null,
    dividendYieldPct: inputDividend.value !== "" ? parseFloat(inputDividend.value) : 0,
    includeDividend: inputIncludeDividend.checked,
  };
}

function updateResults() {
  const { eps, growthRatePct, dividendYieldPct, includeDividend } = readAssumptions();
  const fairValue = computeFairValue({ eps, growthRatePct, dividendYieldPct, includeDividend });
  const verdict = verdictFor(currentPrice, fairValue);

  metricPrice.textContent = currencyFormat(currentPrice, currentCurrency);
  metricFairValue.textContent = fairValue != null ? currencyFormat(fairValue, currentCurrency) : "—";
  metricPE.textContent =
    currentPrice != null && eps ? (currentPrice / eps).toFixed(1) : "—";

  dividendFormulaPart.style.display = includeDividend ? "inline" : "none";

  if (verdict) {
    const sign = verdict.gapPct > 0 ? "+" : "";
    metricGap.textContent = `${sign}${verdict.gapPct.toFixed(1)}%`;
    metricGap.className = `metric-value ${verdict.gapPct >= 0 ? "positive" : "negative"}`;
    verdictBadge.textContent = verdict.label;
    verdictBadge.className = `verdict-badge ${
      verdict.label === "Undervalued" ? "undervalued" : verdict.label === "Overvalued" ? "overvalued" : ""
    }`.trim();
  } else {
    metricGap.textContent = "—";
    metricGap.className = "metric-value";
    verdictBadge.textContent = "—";
    verdictBadge.className = "verdict-badge";
  }

  drawFairValueLine(fairValue);
}

function populateAssumptions(data) {
  inputEps.value = data.trailingEps ?? "";
  inputDividend.value = data.dividendYieldPct != null ? data.dividendYieldPct.toFixed(2) : 0;
  inputIncludeDividend.checked = false;
  currentCurrency = data.currency;

  const growth = data.growthEstimatePct;
  if (growth != null) {
    inputGrowth.value = growth.toFixed(1);
    growthSourceNote.textContent = `Growth rate: ${data.growthSource}.`;
  } else {
    inputGrowth.value = "";
    growthSourceNote.textContent = "No growth data available for this stock — enter a growth rate manually.";
  }
}

function rangeToYears(range) {
  if (range === "1y") return 1;
  if (range === "5y") return 5;
  return Infinity; // max
}

function drawPriceChart(range) {
  const years = rangeToYears(range);
  const points = Number.isFinite(years)
    ? fullHistory.filter((p) => p.date >= new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000))
    : fullHistory;

  const labels = points.map((p) =>
    p.date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  );
  const closes = points.map((p) => p.close);

  if (priceChart) priceChart.destroy();

  priceChart = new Chart(chartCanvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Price",
          data: closes,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.08)",
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.15,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { ticks: { callback: (v) => `$${v}` } },
      },
      plugins: { legend: { display: false } },
    },
  });

  const { eps, growthRatePct, dividendYieldPct, includeDividend } = readAssumptions();
  drawFairValueLine(computeFairValue({ eps, growthRatePct, dividendYieldPct, includeDividend }));
}

function drawFairValueLine(fairValue) {
  if (!priceChart) return;
  const kept = priceChart.data.datasets.filter((d) => d.label !== "Fair value");
  if (fairValue != null) {
    const labels = priceChart.data.labels;
    kept.push({
      label: "Fair value",
      data: labels.map(() => fairValue),
      borderColor: "#16a34a",
      borderDash: [6, 6],
      pointRadius: 0,
      borderWidth: 2,
      fill: false,
    });
  }
  priceChart.data.datasets = kept;
  priceChart.update();
}

async function loadStock(symbol, { forceRefresh = false } = {}) {
  setLoading(true);
  setStatus(`Loading ${symbol}…`);
  resultSection.hidden = true;
  chartSection.hidden = true;

  try {
    const data = await fetchStockData(symbol, { forceRefresh });
    currentPrice = data.currentPrice;
    fullHistory = data.history;

    companyNameEl.textContent = data.companyName;
    companySymbolEl.textContent = data.symbol;
    cacheNote.textContent = data.fromCache
      ? "Showing cached data (refreshed within the last 6 hours) to conserve the free API quota."
      : "";

    populateAssumptions(data);
    updateResults();

    resultSection.hidden = false;
    chartSection.hidden = fullHistory.length === 0;
    if (!chartSection.hidden) drawPriceChart(rangeSelect.value);

    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Something went wrong fetching that stock.", true);
  } finally {
    setLoading(false);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const symbol = tickerInput.value.trim().toUpperCase();
  if (!symbol) return;
  loadStock(symbol);
});

recalcBtn.addEventListener("click", updateResults);

rangeSelect.addEventListener("change", () => {
  if (fullHistory.length) drawPriceChart(rangeSelect.value);
});
