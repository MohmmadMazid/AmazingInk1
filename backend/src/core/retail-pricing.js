/**
 * UK retail price build-up — pure, deterministic, no I/O.
 *
 * Implements the merchant's pricing sheet:
 *     Cost + Postage  →  + Profit  →  + Tax  =  Live display price
 *
 * THE CRITICAL DISTINCTION this module gets right: a shelf price is affected by two kinds
 * of percentage, and they work in OPPOSITE directions.
 *
 *   TAX (VAT 20%) is ADDED ON TOP. The customer pays it; HMRC takes it out of the gross.
 *       display = net × (1 + vat)
 *
 *   FEES (eBay 12.9%, card 2.9%) are DEDUCTED FROM RECEIPTS. To still clear £X after a
 *   12.9% cut you must charge X / (1 − 0.129) = X × 1.148 — NOT X × 1.129.
 *       you keep = display × (1/(1+vat)) − display × feeRate
 *
 * Treating a commission as an add-on markup understates the price and can sell at a loss.
 * The merchant's sheet lumps "WEB 2.5% + VAT 20% = 22.5%" together, which is close enough
 * at 2.5% but badly wrong at eBay's 12.9%. `sheetMode: true` reproduces his exact figure
 * for continuity; the default computes the true economics and reports real profit.
 */

/* --------------------------------- postage -------------------------------- */
/** Weight-banded postage — the 1.50 / 2.10 / 3.29 / 7.00 ladder on the sheet. */
export const DEFAULT_POSTAGE_BANDS = [
  { maxWeightG: 500, priceMinor: 150 },
  { maxWeightG: 1000, priceMinor: 210 },
  { maxWeightG: 2000, priceMinor: 329 },
  { maxWeightG: 20000, priceMinor: 700 },
];

export function postageFor(weightGrams, bands = DEFAULT_POSTAGE_BANDS, overflowMinor = null) {
  if (!bands?.length) return { priceMinor: 0, band: null, overflow: false };
  const sorted = [...bands].sort((a, b) => a.maxWeightG - b.maxWeightG);
  if (weightGrams == null) return { priceMinor: sorted[0].priceMinor, band: sorted[0], overflow: false };
  const band = sorted.find((b) => weightGrams <= b.maxWeightG);
  if (band) return { priceMinor: band.priceMinor, band, overflow: false };
  const last = sorted[sorted.length - 1];
  return { priceMinor: overflowMinor ?? last.priceMinor, band: last, overflow: true };
}

/* ------------------------------- rates ------------------------------------ */
export const sumBps = (list = []) => list.reduce((s, x) => s + (x.bps ?? 0), 0);
const rate = (bps) => bps / 10_000;

/** Add tax on top of a net amount (exact, unrounded). */
export const addTaxExact = (netMinor, taxBps) => netMinor * (1 + rate(taxBps));

/** Strip tax out of a gross amount. */
export const removeTax = (grossMinor, taxBps) => Math.round(grossMinor / (1 + rate(taxBps)));

/** How much of a gross price is tax. */
export const taxPortion = (grossMinor, taxBps) => grossMinor - removeTax(grossMinor, taxBps);

/* ------------------------------- rounding --------------------------------- */
export function roundDisplay(exactMinor, mode = 'NONE') {
  const v = exactMinor;
  if (v <= 0) return 0;
  switch (mode) {
    case 'CHARM_99': { const p = Math.round(v); return Math.max(99, Math.round((p - 99) / 100) * 100 + 99); }
    case 'CHARM_95': { const p = Math.round(v); return Math.max(95, Math.round((p - 95) / 100) * 100 + 95); }
    case 'NEAREST_UNIT': return Math.round(v / 100) * 100;
    case 'TRUNCATE_PENNY': return Math.floor(v);   // the sheet shows 14.08 from 14.0875
    case 'ROUND_PENNY': return Math.round(v);
    case 'NONE':
    default: return Math.round(v);
  }
}

/* --------------------------- the price build-up --------------------------- */
/**
 * Build a shelf price and return every intermediate figure the merchant's boxes show.
 *
 * @param taxes  [{label:'VAT', bps:2000}]        added on top of net
 * @param fees   [{label:'eBay', bps:1290}]       deducted from your receipts
 * @param profitMode  FIXED_AMOUNT | MARGIN_PCT | MARKUP_PCT | NONE
 * @param sheetMode   true = reproduce the merchant's simple (cost+postage)×(1+all%) figure
 */
export function buildRetailPrice({
  costMinor,
  postageMinor = 0,
  weightGrams = null,
  postageBands = null,
  profitMode = 'FIXED_AMOUNT',
  profitValue = 0,
  taxes = [],
  fees = [],
  rounding = 'NONE',
  minProfitMinor = null,
  sheetMode = false,
}) {
  const steps = [];

  // 1) Postage — explicit, or looked up from the weight band.
  let postage = postageMinor;
  if (weightGrams != null && postageBands?.length) {
    const p = postageFor(weightGrams, postageBands);
    postage = p.priceMinor;
    steps.push(`postage band ${weightGrams}g → ${p.priceMinor}${p.overflow ? ' (over top band)' : ''}`);
  }

  const landed = costMinor + postage;
  steps.push(`cost ${costMinor} + postage ${postage} = landed ${landed}`);

  const taxBps = sumBps(taxes);
  const feeBps = sumBps(fees);
  const taxLabel = taxes.map((t) => `${t.label} ${t.bps / 100}%`).join(' + ') || 'no tax';
  const feeLabel = fees.map((f) => `${f.label} ${f.bps / 100}%`).join(' + ') || 'no fees';

  // 2) Target profit in pounds.
  let targetProfit = 0;
  switch (profitMode) {
    case 'FIXED_AMOUNT':
      targetProfit = profitValue;
      steps.push(`target profit ${targetProfit} (fixed)`);
      break;
    case 'MARKUP_PCT':
      targetProfit = Math.round(landed * rate(profitValue));
      steps.push(`target profit = ${profitValue / 100}% markup on landed = ${targetProfit}`);
      break;
    case 'MARGIN_PCT': {
      // Margin measured against the ex-VAT selling price.
      const m = Math.min(9900, Math.max(0, profitValue)) / 10_000;
      targetProfit = Math.round(landed / (1 - m)) - landed;
      steps.push(`target profit = ${profitValue / 100}% margin = ${targetProfit}`);
      break;
    }
    default:
      steps.push('no profit target (break-even)');
  }
  if (minProfitMinor != null && targetProfit < minProfitMinor) {
    targetProfit = minProfitMinor;
    steps.push(`profit raised to floor ${minProfitMinor}`);
  }

  // 3) Solve for the display price.
  let exact;
  if (sheetMode) {
    // The merchant's arithmetic: one combined multiplier, fees treated as add-ons.
    const combined = taxBps + feeBps;
    exact = (landed + targetProfit) * (1 + rate(combined));
    steps.push(`sheet mode: (landed + profit) ${landed + targetProfit} × (1 + ${combined / 100}%) = ${exact.toFixed(2)}`);
  } else {
    // Correct: you keep display/(1+vat) − display×feeRate. Solve that for the target profit.
    //   D × (1/(1+vat) − feeRate) = landed + profit
    const keepPerUnit = 1 / (1 + rate(taxBps)) - rate(feeBps);
    if (keepPerUnit <= 0) {
      steps.push(`IMPOSSIBLE: ${feeLabel} exceeds what remains after ${taxLabel}`);
      exact = 0;
    } else {
      exact = (landed + targetProfit) / keepPerUnit;
      steps.push(`solve: (landed ${landed} + profit ${targetProfit}) ÷ (1/(1+${taxBps / 100}% ${taxLabel}) − ${feeBps / 100}% ${feeLabel}) = ${exact.toFixed(2)}`);
    }
  }

  // 4) Retail rounding on the final shelf price.
  const beforeRounding = Math.round(exact);
  const display = roundDisplay(exact, rounding);
  if (display !== beforeRounding) steps.push(`rounding ${rounding}: ${exact.toFixed(2)} → ${display}`);

  // 5) The truth: what actually lands in the bank.
  const taxMinor = taxPortion(display, taxBps);
  const exVat = display - taxMinor;
  const feeMinor = Math.round(display * rate(feeBps));
  const netProceeds = exVat - feeMinor;
  const realisedProfit = netProceeds - landed;

  return {
    costMinor,
    postageMinor: postage,
    landedMinor: landed,
    targetProfitMinor: targetProfit,
    profitMinor: realisedProfit,
    displayMinor: display,
    displayBeforeRounding: beforeRounding,
    exVatMinor: exVat,
    taxMinor,
    taxBps,
    feeMinor,
    feeBps,
    netProceedsMinor: netProceeds,
    taxes: taxes.map((t) => ({ ...t, amountMinor: taxBps ? Math.round(taxMinor * (t.bps / taxBps)) : 0 })),
    fees: fees.map((f) => ({ ...f, amountMinor: Math.round(display * rate(f.bps)) })),
    marginPct: display > 0 ? +((realisedProfit / display) * 100).toFixed(2) : 0,
    profitable: realisedProfit > 0,
    sheetMode,
    steps,
  };
}

/** Reverse: "if I charge £12.99, what do I actually make?" */
export function profitFromDisplayPrice({ displayMinor, costMinor, postageMinor = 0, taxes = [], fees = [] }) {
  const taxBps = sumBps(taxes);
  const feeBps = sumBps(fees);
  const taxMinor = taxPortion(displayMinor, taxBps);
  const exVat = displayMinor - taxMinor;
  const feeMinor = Math.round(displayMinor * rate(feeBps));
  const netProceeds = exVat - feeMinor;
  const landed = costMinor + postageMinor;
  const profit = netProceeds - landed;
  return {
    displayMinor, taxMinor, feeMinor, exVatMinor: exVat, netProceedsMinor: netProceeds,
    landedMinor: landed, profitMinor: profit,
    marginPct: displayMinor > 0 ? +((profit / displayMinor) * 100).toFixed(2) : 0,
    profitable: profit > 0,
  };
}

export const UK_VAT = [{ label: 'VAT', bps: 2000 }];
export const WEB_FEE = [{ label: 'WEB', bps: 250 }];
