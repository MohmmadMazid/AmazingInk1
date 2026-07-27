import mongoose from 'mongoose';
import { DEFAULT_CURRENCY } from '../core/money.js';

const AddressSchema = new mongoose.Schema(
  { name: String, line1: String, city: String, state: String, postalCode: String, country: { type: String, default: 'US' } },
  { _id: false },
);

const TrackingEventSchema = new mongoose.Schema(
  { status: String, rawStatus: String, message: String, occurredAt: { type: Date, default: Date.now } },
  { _id: false },
);

/** A shipment for an order: the chosen rate, purchased label, and tracking history. */
const ShipmentSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    from: AddressSchema,
    to: AddressSchema,
    parcel: { lengthMm: Number, widthMm: Number, heightMm: Number, weightG: Number, _id: false },
    carrier: String,
    service: String,
    serviceCode: String,
    amount: Number,           // minor units
    currency: { type: String, default: DEFAULT_CURRENCY },
    estDeliveryDays: Number,
    trackingNumber: { type: String, index: true },
    labelUrl: String,
    status: { type: String, enum: ['PENDING', 'LABEL_PURCHASED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'CANCELLED', 'EXCEPTION'], default: 'PENDING', index: true },
    trackingEvents: { type: [TrackingEventSchema], default: [] },
    ruleApplied: String,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ShipmentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
export const Shipment = mongoose.model('Shipment', ShipmentSchema);
