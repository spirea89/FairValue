# Fair Value

A small web app that estimates a stock's fair value using **Peter Lynch's**
growth-based valuation rule of thumb, with live price and fundamentals data
pulled from Google Finance. No backend server, no build step — pure
HTML/CSS/JS, deployable straight to GitHub Pages.

## How it works

Peter Lynch's heuristic (from *One Up on Wall Street*): a fairly priced
growth stock trades at a P/E ratio equal to its annual earnings growth rate
(PEG = 1). Optionally, dividend yield can be credited toward growth (the
"PEGY" variant), since dividend payers need less earnings growth to deliver
the same total return.

```
Fair P/E   = growth rate  (+ dividend yield, if enabled)
Fair Value = EPS (TTM) × Fair P/E
```

The app pre-fills EPS and a growth rate automatically, but every input is
editable so you can plug in your own assumptions. Dividend yield isn't
available from this data source, so enter it manually if you want to
include it.

## Data source

Price, EPS, and P/E come from **Google Finance**, via a Google Sheet that
uses the `GOOGLEFINANCE()` function, wrapped in a small Apps Script "Web
App" that serves it as JSON — see
[`google-apps-script/README.md`](./google-apps-script/README.md) for the
one-time setup. The deployed URL is set in [`js/config.js`](./js/config.js).

The growth rate is the 5-year historical EPS CAGR, computed from real
annual filings via the **SEC's free EDGAR API** — `GOOGLEFINANCE()`'s own
forward growth-estimate fields turned out to be unreliable and often blank.
If a stock isn't SEC-registered (e.g. non-US listings), the app falls back
to Google Finance's consensus growth estimate, and finally to manual entry
if neither is available.

This avoids the two alternatives that were tried and ruled out:

- **Yahoo Finance** — its endpoints now require server-side authentication
  (a "crumb" token) and reject unauthenticated browser requests, so a static
  site can't call them at all anymore.
- **Third-party APIs (Alpha Vantage, Financial Modeling Prep)** — both work,
  but require every visitor to have their own API key and are capped by a
  small shared daily request quota, which real usage burns through fast.

Because the Google Sheet approach runs against the app owner's own Google
account rather than a shared per-key quota, it works for every visitor with
no setup on their end.

## Versioning

The footer shows the running build's version and date, so you can tell if
your browser has the latest deploy — compare it against the version in
[js/version.js on `main`](https://github.com/spirea89/FairValue/blob/main/js/version.js).
If it's out of date, hard-refresh (Cmd/Ctrl+Shift+R) to bypass any cached copy.

## Running locally

No install required. From this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploying to GitHub Pages

This is a static site, so GitHub Pages can serve it directly from the `main`
branch with no build step:

1. Push to `main` on GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch",
   branch `main`, folder `/ (root)`.
4. Save — the site will be published at
   `https://<username>.github.io/FairValue/`.

## Disclaimer

Educational tool only. Not investment advice.
