import mongoose from 'mongoose';

/** Namespaced org settings, e.g. namespace 'security', key 'passwordPolicy'. */
const OrgSettingSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    namespace: { type: String, required: true },
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

OrgSettingSchema.index({ organizationId: 1, namespace: 1, key: 1 }, { unique: true });
export const OrgSetting = mongoose.model('OrgSetting', OrgSettingSchema);
