import mongoose from 'mongoose';

const CouponSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: ['PERCENT', 'AMOUNT', 'FREE_SHIPPING'], required: true },
    value: { type: Number, default: 0, min: 0 }, // bps for PERCENT, minor units for AMOUNT
    minSubtotal: { type: Number, default: null },
    maxRedemptions: { type: Number, default: null },
    redeemedCount: { type: Number, default: 0 },
    startsAt: Date,
    endsAt: Date,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

CouponSchema.index({ organizationId: 1, code: 1 }, { unique: true });
export const Coupon = mongoose.model('Coupon', CouponSchema);
