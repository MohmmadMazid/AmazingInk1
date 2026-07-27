import mongoose from 'mongoose';

/** Money is always an integer count of minor units plus an ISO currency — never a float.
 *  Reusable sub-schema mirroring the original platform's money convention. */
export const MoneySchema = new mongoose.Schema(
  {
    amountMinor: { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: 'amountMinor must be an integer' } },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  },
  { _id: false },
);
