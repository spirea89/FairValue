# Fair Value

A small web app that estimates a stock's fair value using **Peter Lynch's**
growth-based valuation rule of thumb, with live price and fundamentals data
pulled from Alpha Vantage in the browser. No backend, no build step — pure
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

The app pre-fills EPS, dividend yield, and a growth rate (the trailing
5-year EPS CAGR, computed from annual earnings history) automatically, but
every input is editable so you can plug in your own assumptions.

## Data source

Fundamentals and historical prices come from
[Alpha Vantage](https://www.alphavantage.co), a free market-data API that
supports direct browser requests (unlike Yahoo Finance's endpoints, which
now require server-side authentication and can't be called from a static
site). Alpha Vantage requires a free API key — no credit card, signup takes
under a minute at https://www.alphavantage.co/support/#api-key.

The app asks for this key on first use and stores it only in the browser's
`localStorage`; it's never committed to the repo or sent anywhere but Alpha
Vantage. The free tier is capped at **25 requests/day**, and each stock
lookup uses 4 of them, so results are cached locally per symbol for 6 hours
to stretch that quota.

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
