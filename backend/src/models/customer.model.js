import mongoose from 'mongoose';

/** A short internal note attached to a customer (embedded — always read with the customer). */
const NoteSchema = new mongoose.Schema(
  {
    body: { type: String, required: true },
    authorId: String,
    kind: { type: String, enum: ['NOTE', 'INTERNAL'], default: 'NOTE' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const CustomerSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    firstName: String,
    lastName: String,
    phone: String,
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'], default: 'ACTIVE', index: true },
    tags: { type: [String], default: [] },
    notes: { type: [NoteSchema], default: [] },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

CustomerSchema.index({ organizationId: 1, email: 1 }, { unique: true });
CustomerSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const Customer = mongoose.model('Customer', CustomerSchema);
