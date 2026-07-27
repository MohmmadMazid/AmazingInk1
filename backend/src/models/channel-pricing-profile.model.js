import mongoose from 'mongoose';

/**
 * How to price on one channel. The admin sets a TARGET MARGIN (not a markup) plus that
 * channel's fee schedule; the engine solves for the list price that nets that margin.
 *
 * A profile with `productId: null` is the channel-wide default. A profile WITH a productId
 * overrides it for that one product — so you can hold a loss-leader on eBay without
 * changing the whole channel.
 */
const FeeSchema = new mongoose.Schema(
  {
    referralBps: { type: Number, default: 0 },     // marketplace commission (eBay ~1290)
    paymentBps: { type: Number, default: 0 },      // payment processor % (Shopify ~290)
    paymentFixed: { type: Number, default: 0 },    // per-order fixed, minor units
    fixedFee: { type: Number, default: 0 },
    otherFee: { type: Number, default: 0 },
  },
  { _id: false },
);

const ChannelPricingProfileSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChannelConnection', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },  // null = channel default

    priceMode: { type: String, enum: ['MARGIN', 'MARKUP', 'FIXED', 'PASSTHROUGH', 'RETAIL_BUILDUP'], default: 'MARGIN' },

    /* --- RETAIL_BUILDUP: the merchant's sheet (cost + postage + profit + VAT) --------
       Taxes are ADDED to the shelf price (the customer pays VAT).
       Fees are DEDUCTED from receipts (eBay/card take a cut of the gross).
       Modelling them separately is what stops a 12.9% commission being under-priced. */
    profitMode: { type: String, enum: ['FIXED_AMOUNT', 'MARGIN_PCT', 'MARKUP_PCT', 'NONE'], default: 'FIXED_AMOUNT' },
    fixedProfitMinor: { type: Number, default: 100 },        // £1.00 per unit
    minProfitMinor: { type: Number, default: null },         // never sell below this profit
    taxes: {
      type: [{ label: String, bps: Number, _id: false }],
      default: () => [{ label: 'VAT', bps: 2000 }],
    },
    postageBands: {
      type: [{ maxWeightG: Number, priceMinor: Number, _id: false }],
      default: () => [
        { maxWeightG: 500, priceMinor: 150 },
        { maxWeightG: 1000, priceMinor: 210 },
        { maxWeightG: 2000, priceMinor: 329 },
        { maxWeightG: 20000, priceMinor: 700 },
      ],
    },
    /** Reproduce the merchant's simpler (cost+postage)×(1+all%) arithmetic for continuity. */
    sheetMode: { type: Boolean, default: false },
    targetMarginBps: { type: Number, default: 3000 },   // 30.00%
    floorMarginBps: { type: Number, default: 1000 },    // never publish below 10% margin
    markupBps: { type: Number, default: 0 },
    fixedPriceMinor: { type: Number, default: null },

    fees: { type: FeeSchema, default: () => ({}) },
    handlingFeeMinor: { type: Number, default: 0 },
    shippingCostMinor: { type: Number, default: 0 },    // shipping you absorb (free-shipping offers)

    rounding: { type: String, enum: ['NONE', 'CHARM_99', 'CHARM_95', 'NEAREST_UNIT', 'NEAREST_10'], default: 'CHARM_99' },
    minPriceMinor: { type: Number, default: null },
    maxPriceMinor: { type: Number, default: null },

    autoPropagate: { type: Boolean, default: true },    // push automatically on cost/price change
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ChannelPricingProfileSchema.index({ organizationId: 1, connectionId: 1, productId: 1 }, { unique: true });
export const ChannelPricingProfile = mongoose.model('ChannelPricingProfile', ChannelPricingProfileSchema);
