/**
 * Turns this Spreadsheet into a small JSON API for the Fair Value app,
 * combining GOOGLEFINANCE() (price, EPS, P/E, historical prices) with two
 * external sources for a real earnings growth rate — GOOGLEFINANCE's own
 * growth-estimate fields are unreliable and often blank:
 *
 *  1. Nasdaq's public financials API — 4 years of annual Net Income, used
 *     to compute a CAGR. Tried first: reliable in practice, no bot-blocking
 *     observed. Net Income CAGR is a close but imperfect stand-in for EPS
 *     CAGR (they diverge if share count has moved a lot from buybacks).
 *  2. The SEC's free EDGAR API — real historical per-share EPS, which is
 *     what Lynch's formula actually wants. Tried second, as a bonus: SEC's
 *     Akamai bot protection sometimes blocks automated traffic from shared
 *     cloud IPs (including Google's) with a 403, so this can fail
 *     intermittently for reasons outside this script's control.
 *
 * If both fail, this falls back to Google Finance's own growth estimate,
 * and finally to the app asking the user to enter a growth rate manually.
 *
 * Setup: see ../google-apps-script/README.md for the sheet layout this
 * expects and how to deploy this as a Web App.
 *
 * Usage once deployed: GET <web-app-url>?symbol=AAPL
 *
 * One-time setup: this script calls out to external sites (sec.gov,
 * nasdaq.com), which Google requires you to explicitly authorize. Select
 * "authorizeExternalRequests" in the function dropdown (top toolbar, next
 * to Run) and click Run once — that triggers the authorization prompt.
 * Click through it (Review Permissions → your account → Advanced → "Go to
 * (project) (unsafe)" → Allow), then check the Execution log (View →
 * Executions, or Ctrl/Cmd+Enter) for the result.
 */

function authorizeExternalRequests() {
  Logger.log('3y net income CAGR for AAPL (Nasdaq): ' + getNetIncomeCagrFromNasdaq('AAPL') + '%');

  var cik = getCikForSymbol('AAPL');
  Logger.log('CIK for AAPL (SEC): ' + cik);
  if (cik) {
    Logger.log('5y EPS CAGR for AAPL (SEC): ' + getEpsCagrFromSec(cik) + '%');
  }
}

var SHEET_NAME = 'Engine';
var TICKER_CELL = 'B1';
var OUTPUT_CELLS = {
  name: 'D1',
  price: 'D2',
  pe: 'D3',
  eps: 'D4',
  epsCurrentYear: 'D5',
  epsNextYear: 'D6',
  currency: 'D7',
};
var HISTORY_FIRST_ROW = 2; // row 1 is the "Date"/"Close" header from GOOGLEFINANCE
var HISTORY_FIRST_COLUMN = 6; // column F
var HISTORY_MAX_ROWS = 1900; // ~5 years of trading days, with headroom

// SEC asks that automated callers identify themselves — see
// https://www.sec.gov/os/webmaster-faq#developers. Any identifying string is
// fine; it doesn't need to be verified or personal.
var SEC_USER_AGENT = 'FairValueApp/1.0 (+https://github.com/spirea89/FairValue)';
var SEC_EPS_TAGS = ['EarningsPerShareDiluted', 'EarningsPerShareBasic'];

// Nasdaq's API expects a browser-like User-Agent — it 403s on generic/bot
// user agents (unlike SEC, it doesn't ask for an identifying one instead).
var NASDAQ_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function doGet(e) {
  var lock = LockService.getScriptLock();
  var gotLock = lock.tryLock(30000);
  if (!gotLock) {
    return jsonResponse({ error: 'Server busy, please try again in a moment.' });
  }

  try {
    var symbol = ((e.parameter && e.parameter.symbol) || '').toUpperCase().trim();
    if (!symbol) return jsonResponse({ error: 'Missing symbol parameter.' });

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) return jsonResponse({ error: 'Sheet tab "' + SHEET_NAME + '" not found.' });

    sheet.getRange(TICKER_CELL).setValue(symbol);
    SpreadsheetApp.flush();
    Utilities.sleep(2000); // give GOOGLEFINANCE a moment to refresh for the new ticker

    var name = sheet.getRange(OUTPUT_CELLS.name).getValue();
    var price = sheet.getRange(OUTPUT_CELLS.price).getValue();
    var pe = sheet.getRange(OUTPUT_CELLS.pe).getValue();
    var eps = sheet.getRange(OUTPUT_CELLS.eps).getValue();
    var epsCurrentYear = sheet.getRange(OUTPUT_CELLS.epsCurrentYear).getValue();
    var epsNextYear = sheet.getRange(OUTPUT_CELLS.epsNextYear).getValue();
    var currency = sheet.getRange(OUTPUT_CELLS.currency).getValue();

    if (typeof price !== 'number') {
      return jsonResponse({ error: 'Symbol not found, or Google Finance has no data for it.' });
    }

    var historyValues = sheet
      .getRange(HISTORY_FIRST_ROW, HISTORY_FIRST_COLUMN, HISTORY_MAX_ROWS, 2)
      .getValues();

    var history = [];
    for (var i = 0; i < historyValues.length; i++) {
      var rowDate = historyValues[i][0];
      var rowClose = historyValues[i][1];
      if (Object.prototype.toString.call(rowDate) === '[object Date]' && typeof rowClose === 'number') {
        history.push({ date: Utilities.formatDate(rowDate, 'UTC', 'yyyy-MM-dd'), close: rowClose });
      }
    }

    var growthEstimatePct = null;
    var growthSource = null;

    var nasdaqGrowth = getNetIncomeCagrFromNasdaq(symbol);
    if (nasdaqGrowth != null) {
      growthEstimatePct = nasdaqGrowth;
      growthSource = '3-year historical net income CAGR (Nasdaq)';
    }

    if (growthEstimatePct == null) {
      var cik = getCikForSymbol(symbol);
      if (cik) {
        var secGrowth = getEpsCagrFromSec(cik);
        if (secGrowth != null) {
          growthEstimatePct = secGrowth;
          growthSource = '5-year historical EPS CAGR (SEC EDGAR filings)';
        }
      }
    }

    if (growthEstimatePct == null && typeof epsCurrentYear === 'number' && typeof epsNextYear === 'number' && epsCurrentYear > 0) {
      growthEstimatePct = ((epsNextYear - epsCurrentYear) / epsCurrentYear) * 100;
      growthSource = 'next-year consensus EPS growth estimate (Google Finance)';
    }

    return jsonResponse({
      symbol: symbol,
      name: typeof name === 'string' && name ? name : symbol,
      price: price,
      pe: typeof pe === 'number' ? pe : null,
      eps: typeof eps === 'number' ? eps : null,
      currency: typeof currency === 'string' && currency ? currency : 'USD',
      growthEstimatePct: growthEstimatePct,
      growthSource: growthSource,
      history: history,
    });
  } finally {
    lock.releaseLock();
  }
}

/** Resolves a ticker to its 10-digit SEC CIK via SEC's public ticker index, caching the result. */
function getCikForSymbol(symbol) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'cik_' + symbol;
  var cached = cache.get(cacheKey);
  // Only trust a well-formed cached CIK — guards against a stale bad value
  // from an older version of this script that cached "null" as a string.
  if (cached != null && /^\d{10}$/.test(cached)) return cached;

  var cik = null;
  try {
    var resp = UrlFetchApp.fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': SEC_USER_AGENT },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() === 200) {
      var data = JSON.parse(resp.getContentText());
      var keys = Object.keys(data);
      for (var i = 0; i < keys.length; i++) {
        if (data[keys[i]].ticker === symbol) {
          cik = String(data[keys[i]].cik_str);
          while (cik.length < 10) cik = '0' + cik;
          break;
        }
      }
    }
  } catch (err) {
    cik = null;
  }

  // Only cache a successful match. A miss might be a transient error (SEC's
  // bot protection rate-limiting this request, a network blip) rather than
  // a real "this ticker isn't SEC-registered" — caching that for 6h would
  // mask things working again.
  if (cik !== null) cache.put(cacheKey, cik, 21600); // 6h — SEC's max cache TTL
  return cik;
}

/** Computes an annualized EPS growth rate (%) from up to 5 years of SEC-reported annual EPS. */
function getEpsCagrFromSec(cik) {
  for (var t = 0; t < SEC_EPS_TAGS.length; t++) {
    var result = tryEpsTag(cik, SEC_EPS_TAGS[t]);
    if (result != null) return result;
  }
  return null;
}

function tryEpsTag(cik, tag) {
  var url = 'https://data.sec.gov/api/xbrl/companyconcept/CIK' + cik + '/us-gaap/' + tag + '.json';
  var resp;
  try {
    resp = UrlFetchApp.fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT }, muteHttpExceptions: true });
  } catch (err) {
    return null;
  }
  if (resp.getResponseCode() !== 200) return null;

  var data = JSON.parse(resp.getContentText());
  var units = (data.units && data.units['USD/shares']) || [];

  // Keep only full-year figures from annual reports (10-K), since the same
  // concept also gets reported quarterly and in restated year-to-date chunks.
  var annual = units.filter(function (u) {
    if (u.form !== '10-K' || !u.start || !u.end) return false;
    var days = (new Date(u.end) - new Date(u.start)) / (1000 * 60 * 60 * 24);
    return days > 300 && days < 380;
  });

  // A fiscal year can appear more than once (amendments) — keep the most
  // recently filed value per period end date.
  var byEnd = {};
  annual.forEach(function (u) {
    if (!byEnd[u.end] || new Date(u.filed) > new Date(byEnd[u.end].filed)) {
      byEnd[u.end] = u;
    }
  });

  var series = Object.keys(byEnd)
    .map(function (end) {
      return byEnd[end];
    })
    .sort(function (a, b) {
      return new Date(b.end) - new Date(a.end);
    })
    .slice(0, 6) // up to 5 years of growth
    .map(function (u) {
      return u.val;
    });

  if (series.length < 2) return null;
  var latest = series[0];
  var oldest = series[series.length - 1];
  var periods = series.length - 1;
  if (latest <= 0 || oldest <= 0) return null; // CAGR is meaningless across sign changes

  var cagr = (Math.pow(latest / oldest, 1 / periods) - 1) * 100;
  return isFinite(cagr) ? cagr : null;
}

/** Computes an annualized growth rate (%) from up to 4 years of Nasdaq-reported annual net income. */
function getNetIncomeCagrFromNasdaq(symbol) {
  var url = 'https://api.nasdaq.com/api/company/' + symbol + '/financials?frequency=1';
  var resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      headers: { 'User-Agent': NASDAQ_USER_AGENT, Accept: 'application/json' },
      muteHttpExceptions: true,
    });
  } catch (err) {
    return null;
  }
  if (resp.getResponseCode() !== 200) return null;

  var data = JSON.parse(resp.getContentText());
  var rows = data.data && data.data.incomeStatementTable && data.data.incomeStatementTable.rows;
  if (!rows) return null;

  var netIncomeRow = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].value1 === 'Net Income') {
      netIncomeRow = rows[i];
      break;
    }
  }
  if (!netIncomeRow) return null;

  // value2 is the most recent year, value5 the oldest of the 4 shown.
  var series = [netIncomeRow.value2, netIncomeRow.value3, netIncomeRow.value4, netIncomeRow.value5]
    .map(parseMoney)
    .filter(function (v) {
      return v != null;
    });

  if (series.length < 2) return null;
  var latest = series[0];
  var oldest = series[series.length - 1];
  var periods = series.length - 1;
  if (latest <= 0 || oldest <= 0) return null; // CAGR is meaningless across sign changes

  var cagr = (Math.pow(latest / oldest, 1 / periods) - 1) * 100;
  return isFinite(cagr) ? cagr : null;
}

/** Parses a Nasdaq-style money string like "$112,010,000" or "--" into a number (or null). */
function parseMoney(str) {
  if (typeof str !== 'string') return null;
  var cleaned = str.replace(/[$,]/g, '').trim();
  if (cleaned === '' || cleaned === '--') return null;
  var n = Number(cleaned);
  return isFinite(n) ? n : null;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
