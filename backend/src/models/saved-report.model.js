import mongoose from 'mongoose';

/** A saved report definition users can re-run. */
const SavedReportSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['SALES', 'PRODUCTS', 'CUSTOMERS', 'INVENTORY', 'FINANCE', 'CHANNELS'], required: true },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },   // { preset, grain, compare... }
    createdBy: String,
  },
  { timestamps: true },
);
export const SavedReport = mongoose.model('SavedReport', SavedReportSchema);
