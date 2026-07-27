import mongoose from 'mongoose';

/** Order line items are EMBEDDED (a natural document-model choice in MongoDB — lines are always
 *  read/written with their order). Totals are integer minor units, kept internally consistent by
 *  the order service. */
const OrderLineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: String,
    quantity: { type: Number, required: true, min: 1 },
    unitPriceMinor: { type: Number, required: true, min: 0 },
    lineTotalMinor: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const OrderSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    status: { type: String, enum: ['PENDING', 'PAID', 'FULFILLED', 'CANCELLED'], default: 'PENDING', index: true },
    channel: { type: String, enum: ['web', 'amazon', 'ebay', 'pos'], default: 'web' },
    currency: { type: String, required: true, uppercase: true },
    lines: { type: [OrderLineSchema], default: [] },
    subtotalMinor: { type: Number, required: true, default: 0 },
    taxMinor: { type: Number, required: true, default: 0 },
    totalMinor: { type: Number, required: true, default: 0 },
    placedAt: { type: Date, default: Date.now },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

OrderSchema.index({ organizationId: 1, orderNumber: 1 }, { unique: true });
OrderSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const Order = mongoose.model('Order', OrderSchema);
