import { OrgSetting } from '../../models/org-setting.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';
import { CURRENCIES, currencyCodes, currencyInfo } from '../../core/money.js';

const NS = 'commerce';

/**
 * The org's currency. Falls back to the platform default (env.CURRENCY, GBP) so a fresh
 * install is never currency-less. Every money value in the DB is minor units of THIS.
 */
export async function getCurrency(orgId) {
  const row = await OrgSetting.findOne({ organizationId: orgId, namespace: NS, key: 'currency' }).lean();
  const code = row?.value ?? env.currency;
  return { currency: code, ...currencyInfo(code) };
}

export async function setCurrency(orgId, code) {
  const upper = String(code).toUpperCase();
  if (!currencyCodes().includes(upper)) {
    throw new ApiError(400, `Unsupported currency ${upper}. Supported: ${currencyCodes().join(', ')}`, 'validation');
  }
  await OrgSetting.findOneAndUpdate(
    { organizationId: orgId, namespace: NS, key: 'currency' },
    { $set: { organizationId: orgId, namespace: NS, key: 'currency', value: upper } },
    { upsert: true },
  );
  return getCurrency(orgId);
}

/**
 * NOTE for the operator: changing the currency does NOT convert stored amounts. Money is
 * stored as minor units with no exchange rate applied — 1299 means £12.99 or $12.99
 * depending on this setting. Switch currency only on a fresh dataset, or run a conversion.
 */
export const supportedCurrencies = () =>
  currencyCodes().map((code) => ({ code, ...CURRENCIES[code] }));

/** Everything the frontend needs at boot, in one call. */
export async function bootstrapConfig(orgId) {
  const { currency, symbol, minorUnits, locale, label } = await getCurrency(orgId);
  return { currency, symbol, minorUnits, locale, label, supported: supportedCurrencies() };
}
