import mongoose from 'mongoose';

/** A physical storage location, e.g. "A-12-3". sortKey caches the serpentine pick order. */
const BinLocationSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    zoneType: { type: String, enum: ['RECEIVING', 'STORAGE', 'PICKING', 'PACKING', 'SHIPPING', 'STAGING', 'QUARANTINE'], default: 'STORAGE' },
    binType: { type: String, enum: ['SHELF', 'PALLET', 'FLOOR', 'BULK', 'BIN'], default: 'SHELF' },
    aisle: String,
    bay: Number,
    level: Number,
    sortKey: { type: Number, index: true },   // serpentine order, computed on save
    maxUnits: { type: Number, default: null },
    isPickable: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

BinLocationSchema.index({ organizationId: 1, warehouseId: 1, code: 1 }, { unique: true });
export const BinLocation = mongoose.model('BinLocation', BinLocationSchema);
