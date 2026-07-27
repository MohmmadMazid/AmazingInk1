import mongoose from 'mongoose';

const PickListItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    binId: { type: mongoose.Schema.Types.ObjectId, ref: 'BinLocation', default: null },
    binCode: String,
    quantity: { type: Number, required: true, min: 1 },
    pickedQuantity: { type: Number, default: 0, min: 0 },
    sortKey: { type: Number, default: 0 },   // serpentine walk order
  },
  { _id: true },
);

/** A picker's work order: items sequenced along an optimal serpentine path. */
const PickListSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    orderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    reference: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'ASSIGNED', 'PICKING', 'PICKED', 'PACKING', 'PACKED', 'SHIPPED', 'CANCELLED'], default: 'PENDING', index: true },
    assignedTo: String,
    items: { type: [PickListItemSchema], default: [] },
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

PickListSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
export const PickList = mongoose.model('PickList', PickListSchema);
