import mongoose from 'mongoose';

const WarehouseSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    address: String,
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

WarehouseSchema.index({ organizationId: 1, code: 1 }, { unique: true });
export const Warehouse = mongoose.model('Warehouse', WarehouseSchema);
