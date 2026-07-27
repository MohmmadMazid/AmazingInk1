/**
 * Money formatting and parsing — pure, deterministic, no I/O.
 *
 * Everything in this platform stores money as an INTEGER COUNT OF MINOR UNITS plus an ISO
 * currency code. That is why £12.99 is 1299, not 12.99 — floats cannot represent money.
 *
 * The number of minor units is NOT always 2. JPY has none (¥100 is 100 minor units),
 * KWD has three. Assuming "÷ 100" is a real bug in most currencies, so we look it up.
 */

/** ISO 4217 minor-unit exponents for the currencies we support. */
export const CURRENCIES = {
  GBP: { symbol: '£', minorUnits: 2, label: 'British Pound', locale: 'en-GB' },
  USD: { symbol: '$', minorUnits: 2, label: 'US Dollar', locale: 'en-US' },
  EUR: { symbol: '€', minorUnits: 2, label: 'Euro', locale: 'en-IE' },
  JPY: { symbol: '¥', minorUnits: 0, label: 'Japanese Yen', locale: 'ja-JP' },
  AUD: { symbol: 'A$', minorUnits: 2, label: 'Australian Dollar', locale: 'en-AU' },
  CAD: { symbol: 'C$', minorUnits: 2, label: 'Canadian Dollar', locale: 'en-CA' },
  INR: { symbol: '₹', minorUnits: 2, label: 'Indian Rupee', locale: 'en-IN' },
};

export const DEFAULT_CURRENCY = 'GBP';
export const currencyCodes = () => Object.keys(CURRENCIES);
export const currencyInfo = (code) => CURRENCIES[String(code).toUpperCase()] ?? CURRENCIES[DEFAULT_CURRENCY];
export const minorUnits = (code) => currencyInfo(code).minorUnits;
export const minorFactor = (code) => 10 ** minorUnits(code);

/** Minor units -> a display string. `1299, 'GBP'` -> "£12.99". */
export function formatMoney(amountMinor, code = DEFAULT_CURRENCY, opts = {}) {
  if (amountMinor == null || Number.isNaN(amountMinor)) return opts.emptyText ?? '—';
  const info = currencyInfo(code);
  const major = amountMinor / minorFactor(code);
  try {
    return new Intl.NumberFormat(opts.locale ?? info.locale, {
      style: 'currency',
      currency: String(code).toUpperCase(),
      minimumFractionDigits: info.minorUnits,
      maximumFractionDigits: opts.maxFractionDigits ?? info.minorUnits,
    }).format(major);
  } catch {
    // Unknown ISO code: fall back to a plain symbol render rather than throwing.
    return `${info.symbol}${major.toFixed(info.minorUnits)}`;
  }
}

/**
 * A human string -> minor units. Tolerates the mess a CSV actually contains:
 *   "£12.99"  "12.99"  "1,299.00"  " 12.99 GBP "  "(4.50)" [negative]  "12"
 * Returns null when it is not a number at all — the caller reports it, never guesses.
 */
export function parseMoney(input, code = DEFAULT_CURRENCY) {
  if (input == null || input === '') return null;
  if (typeof input === 'number') return Math.round(input * minorFactor(code));

  let s = String(input).trim();

  // Accounting negatives: (4.50) means -4.50
  const parenNegative = /^\(.*\)$/.test(s);
  if (parenNegative) s = s.slice(1, -1);

  // Strip currency symbols, ISO codes, spaces, and thousands separators.
  s = s.replace(/[£$€¥₹]|A\$|C\$/g, '')
    .replace(/\b[A-Z]{3}\b/gi, '')
    .replace(/[\s,_]/g, '')
    .trim();

  if (s === '' || !/^-?\d*\.?\d+$/.test(s)) return null;

  const major = Number(s);
  if (!Number.isFinite(major)) return null;

  const minor = Math.round(major * minorFactor(code));
  return parenNegative ? -minor : minor;
}

/** Minor units -> a plain decimal string, for CSV export. `1299, 'GBP'` -> "12.99". */
export function toMajorString(amountMinor, code = DEFAULT_CURRENCY) {
  if (amountMinor == null) return '';
  return (amountMinor / minorFactor(code)).toFixed(minorUnits(code));
}

/** Guard: money must be a whole number of minor units. */
export const isValidMinor = (n) => Number.isInteger(n) && Number.isFinite(n);
