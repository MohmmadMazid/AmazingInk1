/**
 * Store adapters — the seam between this platform and a real eBay account, Shopify store,
 * WooCommerce site, or your own website.
 *
 * Each adapter implements six methods:
 *   testConnection(creds)              -> { ok, accountId?, error? }
 *   publish(creds, product, price, qty)-> { statusCode, externalListingId }
 *   pushPrice(creds, listing, priceMinor, idempotencyKey) -> { statusCode }
 *   pushQuantity(creds, listing, qty, idempotencyKey)     -> { statusCode }
 *   fetchRemote(creds, listing)        -> { statusCode, priceMinor, quantity }
 *   endListing(creds, listing)         -> { statusCode }
 *
 * The SIMULATED adapters below are fully functional: they keep an in-memory remote store,
 * honour idempotency keys, and let you exercise the entire connect -> publish -> reprice
 * flow with no API credentials. Each carries the REAL request shape it would send, in a
 * comment, so going live is a matter of replacing the body — not redesigning the module.
 */

function simulatedStore(platform, { requiredCreds, idFormat }) {
  const remote = new Map();      // externalId -> { priceMinor, quantity }
  const seenKeys = new Map();    // idempotencyKey -> result

  const dedupe = (key, fn) => {
    if (key && seenKeys.has(key)) return seenKeys.get(key);
    const result = fn();
    if (key) seenKeys.set(key, result);
    return result;
  };

  return {
    platform,

    async testConnection(creds) {
      const missing = requiredCreds.filter((f) => !creds?.[f]);
      if (missing.length) return { ok: false, error: `missing credentials: ${missing.join(', ')}` };
      // LIVE eBay: POST https://api.ebay.com/identity/v1/oauth2/token (refresh_token grant)
      // LIVE Shopify: GET https://{shop}/admin/api/2024-10/shop.json  (X-Shopify-Access-Token)
      return { ok: true, accountId: `${platform.toLowerCase()}_${String(creds[requiredCreds[0]]).slice(0, 8)}` };
    },

    async publish(_creds, product, priceMinor, quantity) {
      const externalListingId = idFormat(product);
      remote.set(externalListingId, { priceMinor, quantity });
      // LIVE eBay: POST /sell/inventory/v1/offer  then  /offer/{offerId}/publish
      // LIVE Shopify: POST /admin/api/2024-10/products.json
      return { statusCode: 201, externalListingId };
    },

    async pushPrice(_creds, listing, priceMinor, idempotencyKey) {
      return dedupe(idempotencyKey, () => {
        const row = remote.get(listing.externalListingId) ?? { priceMinor: 0, quantity: 0 };
        row.priceMinor = priceMinor;
        remote.set(listing.externalListingId, row);
        // LIVE eBay: POST /sell/inventory/v1/offer/{offerId}  { pricingSummary: { price: {...} } }
        // LIVE Shopify: PUT /admin/api/2024-10/variants/{id}.json  { variant: { price } }
        return { statusCode: 200, priceMinor };
      });
    },

    async pushQuantity(_creds, listing, quantity, idempotencyKey) {
      return dedupe(idempotencyKey, () => {
        const row = remote.get(listing.externalListingId) ?? { priceMinor: 0, quantity: 0 };
        row.quantity = quantity;
        remote.set(listing.externalListingId, row);
        // LIVE eBay: PUT /sell/inventory/v1/inventory_item/{sku}  { availability: {...} }
        return { statusCode: 200, quantity };
      });
    },

    async fetchRemote(_creds, listing) {
      const row = remote.get(listing.externalListingId);
      return row ? { statusCode: 200, ...row } : { statusCode: 404 };
    },

    async endListing(_creds, listing) {
      remote.delete(listing.externalListingId);
      return { statusCode: 200 };
    },

    /** Test hook: simulate someone editing the price directly in the marketplace UI. */
    async __simulateRemoteEdit(externalId, patch) {
      const row = remote.get(externalId) ?? { priceMinor: 0, quantity: 0 };
      remote.set(externalId, { ...row, ...patch });
    },
  };
}

export const STORE_REGISTRY = {
  EBAY: simulatedStore('EBAY', {
    requiredCreds: ['clientId', 'clientSecret', 'refreshToken', 'siteId'],
    idFormat: (p) => `ebay_${p.sku}_${Date.now().toString(36)}`,
  }),
  AMAZON: simulatedStore('AMAZON', {
    requiredCreds: ['sellerId', 'refreshToken', 'marketplaceId'],
    idFormat: (p) => `amzn_${p.sku}`,
  }),
  SHOPIFY: simulatedStore('SHOPIFY', {
    requiredCreds: ['shopDomain', 'accessToken'],
    idFormat: (p) => `shopify_${p.sku}_${Date.now().toString(36)}`,
  }),
  WOOCOMMERCE: simulatedStore('WOOCOMMERCE', {
    requiredCreds: ['storeUrl', 'consumerKey', 'consumerSecret'],
    idFormat: (p) => `woo_${p.sku}`,
  }),
  CUSTOM_WEBSITE: simulatedStore('CUSTOM_WEBSITE', {
    requiredCreds: ['endpointUrl', 'apiKey'],
    idFormat: (p) => `site_${p.sku}`,
  }),
};

export const getStore = (platform) => STORE_REGISTRY[String(platform).toUpperCase()] ?? null;
export const storePlatforms = () => Object.keys(STORE_REGISTRY);
