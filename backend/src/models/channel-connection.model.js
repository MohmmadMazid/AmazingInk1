import mongoose from 'mongoose';

/**
 * A connected store. THIS is what "attach my eBay account / my brand website" means.
 *
 * One organization can attach MANY connections — several eBay accounts, a Shopify site,
 * a WooCommerce site — each with its own credentials, its own fees, and its own margin.
 * Credentials are stored ENCRYPTED (AES-256-GCM, via the security core); the plaintext
 * never leaves the service layer and is never returned by the API.
 */
const ChannelConnectionSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },                 // "eBay US — main store"
    platform: { type: String, enum: ['EBAY', 'AMAZON', 'SHOPIFY', 'WOOCOMMERCE', 'CUSTOM_WEBSITE'], required: true },
    kind: { type: String, enum: ['MARKETPLACE', 'OWNED_STORE'], required: true },
    externalAccountId: String,                              // eBay user id, shop domain...
    siteId: String,                                         // eBay site / marketplace id

    /** Encrypted blob: `iv:tag:ciphertext`. Never selected by default. */
    credentialsEnc: { type: String, select: false },

    status: { type: String, enum: ['DISCONNECTED', 'CONNECTED', 'ERROR'], default: 'DISCONNECTED', index: true },
    lastSyncAt: Date,
    lastError: String,
    consecutiveFailures: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ChannelConnectionSchema.index({ organizationId: 1, platform: 1, name: 1 }, { unique: true });
export const ChannelConnection = mongoose.model('ChannelConnection', ChannelConnectionSchema);
