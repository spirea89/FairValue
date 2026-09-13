# Google Sheets data backend

The Fair Value app can be backed by a Google Sheet that uses `GOOGLEFINANCE()`
instead of a rate-limited third-party API. This turns the sheet into a tiny
JSON API via Apps Script — one-time setup, then it works for every visitor
to the site with no per-user API key.

## 1. Create the sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Rename the first tab (bottom-left) to exactly `Engine`.
3. Enter these formulas exactly as shown:

| Cell | Content |
|------|---------|
| `A1` | `Ticker` (a label, not read by the script) |
| `B1` | `AAPL` (placeholder — the script overwrites this per request) |
| `D1` | `=GOOGLEFINANCE(B1,"name")` |
| `D2` | `=GOOGLEFINANCE(B1,"price")` |
| `D3` | `=GOOGLEFINANCE(B1,"pe")` |
| `D4` | `=IFERROR(GOOGLEFINANCE(B1,"eps"),"")` |
| `D5` | `=IFERROR(GOOGLEFINANCE(B1,"epsestimatecurrentyear"),"")` |
| `D6` | `=IFERROR(GOOGLEFINANCE(B1,"epsestimatenextyear"),"")` |
| `D7` | `=IFERROR(GOOGLEFINANCE(B1,"currency"),"USD")` |
| `F1` | `=GOOGLEFINANCE(B1,"close",TODAY()-1825,TODAY(),"DAILY")` |

`F1`'s formula spills down into `F1:G(n)` (a "Date"/"Close" header plus ~5
years of daily rows) — leave those cells empty so it has room to spill.

Give it a few seconds after entering the formulas to see real numbers
populate for AAPL — that confirms `GOOGLEFINANCE` is working before you wire
up the script.

## 2. Add the Apps Script

1. In the sheet, go to **Extensions → Apps Script**.
2. Delete the placeholder `myFunction() {}` code and paste in the contents
   of [`Code.gs`](./Code.gs) from this folder.
3. Click the save icon, name the project something like "Fair Value API".

## 3. Deploy it as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**.
5. Google will ask you to authorize the script (it needs permission to read
   your own sheet). Click through the consent screen — you'll likely see an
   "unverified app" warning since this is your own personal script; click
   **Advanced → Go to (project name) (unsafe)** to proceed. This is expected
   and safe for a script you wrote yourself.
6. Copy the **Web app URL** (it ends in `/exec`).

## 4. Test it

Paste this in a browser tab, using your own URL:

```
<your-web-app-url>?symbol=AAPL
```

Wait a couple of seconds — you should get back JSON like:

```json
{"symbol":"AAPL","name":"Apple Inc.","price":227.5,"pe":34.2,"eps":6.6, ...}
```

Then hand that URL over so it can be wired into `js/config.js` in the app.

## Notes

- **Redeploying after editing the script:** changing `Code.gs` doesn't
  affect the live URL until you create a new version — go to
  **Deploy → Manage deployments → edit (pencil) → New version → Deploy**.
- **This URL is not a secret** — anyone who has it can query your sheet
  (that's what makes it work for every visitor without their own API key),
  but it also means it's visible in the site's JavaScript to anyone who
  looks. That's an acceptable trade-off for a personal project; just know
  it isn't private.
- **Reliability:** `GOOGLEFINANCE()`'s EPS/estimate fields are unofficial
  and occasionally return `#N/A` for some tickers — when that happens the
  app just asks you to enter a growth rate manually, same as it already
  does for other data gaps.
