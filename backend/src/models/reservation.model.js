import mongoose from 'mongoose';

/** A hold on stock for an order. Released, fulfilled, or expired. */
const ReservationSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    quantity: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['ACTIVE', 'RELEASED', 'FULFILLED', 'EXPIRED'], default: 'ACTIVE', index: true },
    expiresAt: Date,
  },
  { timestamps: true },
);

ReservationSchema.index({ organizationId: 1, orderId: 1 });
export const Reservation = mongoose.model('Reservation', ReservationSchema);
