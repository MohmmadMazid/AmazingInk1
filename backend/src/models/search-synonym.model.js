import mongoose from 'mongoose';

/** A synonym group: any term in the group expands to all the others at query time. */
const SearchSynonymSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    terms: { type: [String], required: true },   // ['mouse','mice','pointer']
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const SearchSynonym = mongoose.model('SearchSynonym', SearchSynonymSchema);
