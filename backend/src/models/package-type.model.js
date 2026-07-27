import mongoose from 'mongoose';

/** A box/envelope the warehouse can pack into. Feeds selectPackage() in the shipping core. */
const PackageTypeSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ['BOX', 'ENVELOPE', 'SOFT_PACK', 'TUBE', 'CUSTOM'], default: 'BOX' },
    lengthMm: { type: Number, required: true, min: 1 },
    widthMm: { type: Number, required: true, min: 1 },
    heightMm: { type: Number, required: true, min: 1 },
    emptyWeightG: { type: Number, default: 0, min: 0 },
    maxWeightG: { type: Number, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const PackageType = mongoose.model('PackageType', PackageTypeSchema);
