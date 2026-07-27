import mongoose from 'mongoose';

/** An OAuth 2.0 client: client_credentials and/or authorization_code with PKCE. */
const ApiClientSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    clientId: { type: String, required: true, unique: true },
    secretHash: { type: String, required: true },
    grantTypes: { type: [String], default: ['CLIENT_CREDENTIALS'] },
    redirectUris: { type: [String], default: [] },
    scopes: { type: [String], default: [] },
    environment: { type: String, enum: ['LIVE', 'SANDBOX'], default: 'SANDBOX' },
    rateTier: { type: String, enum: ['FREE', 'STANDARD', 'ENTERPRISE'], default: 'FREE' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const ApiClient = mongoose.model('ApiClient', ApiClientSchema);

/** Issued tokens — stored hashed, never in plaintext. */
const OAuthAccessTokenSchema = new mongoose.Schema(
  {
    organizationId: { type: String, required: true, index: true },
    clientId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    refreshHash: { type: String, default: null },
    scopes: { type: [String], default: [] },
    environment: { type: String, enum: ['LIVE', 'SANDBOX'], default: 'SANDBOX' },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
  },
  { timestamps: true },
);
export const OAuthAccessToken = mongoose.model('OAuthAccessToken', OAuthAccessTokenSchema);

/** Single-use authorization codes with an optional PKCE challenge. */
const OAuthAuthorizationCodeSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true },
    codeHash: { type: String, required: true, unique: true },
    redirectUri: { type: String, required: true },
    scopes: { type: [String], default: [] },
    codeChallenge: String,
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
  },
  { timestamps: true },
);
export const OAuthAuthorizationCode = mongoose.model('OAuthAuthorizationCode', OAuthAuthorizationCodeSchema);
