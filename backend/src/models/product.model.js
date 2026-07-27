import mongoose from 'mongoose';
import { MoneySchema } from './money.schema.js';

/** A product/listing. organizationId is denormalized on every document for tenant scoping;
 *  soft delete via deletedAt; Mongoose `__v` provides optimistic concurrency. */
const ProductSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    sku: { type: String, required: true, uppercase: true, trim: true },
    title: { type: String, required: true },
    description: String,
    price: { type: MoneySchema, required: true },
    status: { type: String, enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'DRAFT', index: true },
    barcode: String,
    weightGrams: Number,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

ProductSchema.index({ organizationId: 1, sku: 1 }, { unique: true });
ProductSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

export const Product = mongoose.model('Product', ProductSchema);
