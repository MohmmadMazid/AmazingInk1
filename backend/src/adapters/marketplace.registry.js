/**
 * Marketplace adapters — the seam between our sync engine and real marketplace APIs.
 *
 * Each adapter exposes: publish(listing), pushQuantity(listing, qty, idempotencyKey),
 * pushPrice(listing, price, idempotencyKey), and fetchRemote(listing).
 *
 * The defaults are RUNNABLE SIMULATIONS with an in-memory remote store, so the full
 * delta-sync / drift / outbox flow works with no credentials. `pushQuantity` honours the
 * idempotency key: replaying the same key is a no-op that returns the original result.
 *
 * To go live, replace an adapter's methods with real API calls (Amazon SP-API, eBay, Shopify).
 * Nothing else in the codebase changes.
 */

function simulatedMarketplace(code) {
  const remote = new Map();          // externalId -> { quantity, price }
  const seenKeys = new Map();        // idempotencyKey -> result (dedupe replays)

  return {
    code,
    async publish(listing) {
      const externalId = `${code.toLowerCase()}_${Date.now().toString(36)}`;
      remote.set(externalId, { quantity: 0, price: listing.price ?? 0 });
      return { statusCode: 201, externalId };
    },

    async pushQuantity(listing, quantity, idempotencyKey) {
      if (idempotencyKey && seenKeys.has(idempotencyKey)) return seenKeys.get(idempotencyKey); // replay
      const row = remote.get(listing.externalId) ?? { quantity: 0, price: 0 };
      row.quantity = quantity;
      remote.set(listing.externalId, row);
      const result = { statusCode: 200, quantity };
      if (idempotencyKey) seenKeys.set(idempotencyKey, result);
      return result;
    },

    async pushPrice(listing, price, idempotencyKey) {
      if (idempotencyKey && seenKeys.has(idempotencyKey)) return seenKeys.get(idempotencyKey);
      const row = remote.get(listing.externalId) ?? { quantity: 0, price: 0 };
      row.price = price;
      remote.set(listing.externalId, row);
      const result = { statusCode: 200, price };
      if (idempotencyKey) seenKeys.set(idempotencyKey, result);
      return result;
    },

    async fetchRemote(listing) {
      const row = remote.get(listing.externalId);
      return row ? { statusCode: 200, ...row } : { statusCode: 404 };
    },

    /** Test hook: simulate an external sale / marketplace-side edit to create drift. */
    async __simulateExternalChange(externalId, quantity) {
      const row = remote.get(externalId) ?? { quantity: 0, price: 0 };
      row.quantity = quantity;
      remote.set(externalId, row);
    },
  };
}

export const MARKETPLACE_REGISTRY = {
  AMAZON: simulatedMarketplace('AMAZON'),
  EBAY: simulatedMarketplace('EBAY'),
  SHOPIFY: simulatedMarketplace('SHOPIFY'),
};

export const getMarketplace = (code) => MARKETPLACE_REGISTRY[String(code).toUpperCase()] ?? null;
export const enabledMarketplaces = () => Object.keys(MARKETPLACE_REGISTRY);
