/**
 * Currency-aware money formatting for the whole console.
 *
 * The backend stores money as an integer count of MINOR UNITS. How many minor units a
 * major unit has depends on the currency — GBP/USD/EUR have 100, JPY has 1. Dividing by
 * 100 unconditionally is a 100x bug in yen, so we look the exponent up.
 *
 * The org's currency is fetched once at login (`GET /api/settings/bootstrap`) and cached
 * here, so every screen renders the same symbol without prop-drilling.
 */
let config = { currency: 'GBP', symbol: '£', minorUnits: 2, locale: 'en-GB' };

export const setCurrencyConfig = (cfg) => { if (cfg?.currency) config = { ...config, ...cfg }; };
export const getCurrencyConfig = () => config;

const factor = () => 10 ** config.minorUnits;

/** Minor units -> "£12.99". Pass `null` and you get an em dash, not "£NaN". */
export function money(amountMinor, opts = {}) {
  if (amountMinor == null || Number.isNaN(Number(amountMinor))) return opts.empty ?? '—';
  try {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency,
      minimumFractionDigits: config.minorUnits,
      maximumFractionDigits: opts.maxFractionDigits ?? config.minorUnits,
    }).format(amountMinor / factor());
  } catch {
    return `${config.symbol}${(amountMinor / factor()).toFixed(config.minorUnits)}`;
  }
}

/** For AI/usage costs that need sub-penny precision. */
export const moneyPrecise = (amountMinor) => money(amountMinor, { maxFractionDigits: 4 });

/** "12.99" (a form input) -> 1299 minor units. Returns null when it isn't a number. */
export function toMinor(input) {
  if (input == null || input === '') return null;
  const cleaned = String(input).replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * factor()) : null;
}

/** 1299 -> "12.99", for pre-filling a form input. */
export const toMajor = (amountMinor) =>
  amountMinor == null ? '' : (amountMinor / factor()).toFixed(config.minorUnits);

export const currencySymbol = () => config.symbol;
export const currencyCode = () => config.currency;
