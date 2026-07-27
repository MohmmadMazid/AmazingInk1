import mongoose from 'mongoose';

const SavedSearchSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    name: { type: String, required: true },
    entity: { type: String, required: true },
    query: String,
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);
export const SavedSearch = mongoose.model('SavedSearch', SavedSearchSchema);
