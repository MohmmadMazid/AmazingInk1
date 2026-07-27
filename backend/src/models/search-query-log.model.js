import mongoose from 'mongoose';

/** Append-only log of what people searched for — powers zero-result and top-query reports. */
const SearchQueryLogSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    userId: String,
    entity: String,
    query: { type: String, required: true },
    resultCount: { type: Number, default: 0 },
    tookMs: Number,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

SearchQueryLogSchema.index({ organizationId: 1, query: 1 });
export const SearchQueryLog = mongoose.model('SearchQueryLog', SearchQueryLogSchema);
