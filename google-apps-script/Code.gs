/**
 * Turns this Spreadsheet into a small JSON API for the Fair Value app,
 * backed by the built-in GOOGLEFINANCE() function.
 *
 * Setup: see ../google-apps-script/README.md for the sheet layout this
 * expects and how to deploy this as a Web App.
 *
 * Usage once deployed: GET <web-app-url>?symbol=AAPL
 */

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

    return jsonResponse({
      symbol: symbol,
      name: typeof name === 'string' && name ? name : symbol,
      price: price,
      pe: typeof pe === 'number' ? pe : null,
      eps: typeof eps === 'number' ? eps : null,
      epsCurrentYear: typeof epsCurrentYear === 'number' ? epsCurrentYear : null,
      epsNextYear: typeof epsNextYear === 'number' ? epsNextYear : null,
      currency: typeof currency === 'string' && currency ? currency : 'USD',
      history: history,
    });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
