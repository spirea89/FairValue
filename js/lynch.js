// Peter Lynch fair value model.
//
// Lynch's heuristic (from "One Up on Wall Street"): a fairly priced growth
// stock trades at a P/E equal to its earnings growth rate (PEG = 1). Many
// practitioners extend this to "PEGY" by crediting dividend yield toward
// growth, since a dividend-paying company needs less earnings growth to
// deliver the same total return.
//
//   Fair P/E   = growthRatePct (+ dividendYieldPct, if included)
//   Fair Value = EPS * Fair P/E

export function computeFairValue({ eps, growthRatePct, dividendYieldPct = 0, includeDividend }) {
  if (eps == null || growthRatePct == null) return null;
  const effectiveGrowth = growthRatePct + (includeDividend ? dividendYieldPct || 0 : 0);
  const fairPE = Math.max(effectiveGrowth, 0);
  return eps * fairPE;
}

export function verdictFor(currentPrice, fairValue) {
  if (currentPrice == null || fairValue == null || fairValue <= 0) return null;
  const gapPct = ((fairValue - currentPrice) / currentPrice) * 100;
  let label;
  if (gapPct > 15) label = "Undervalued";
  else if (gapPct < -15) label = "Overvalued";
  else label = "Fairly valued";
  return { gapPct, label };
}
