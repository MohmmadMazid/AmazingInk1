import { z } from 'zod';
import * as service from './devplatform.service.js';
import { ok, created, paginated, pageParams } from '../../utils/envelope.js';

const keySchema = z.object({
  name: z.string().min(1), scopes: z.array(z.string()).optional(),
  environment: z.enum(['LIVE', 'SANDBOX']).optional(),
  rateTier: z.enum(['FREE', 'STANDARD', 'ENTERPRISE']).optional(),
  expiresAt: z.string().datetime().optional(),
});
const clientSchema = z.object({
  name: z.string().min(1),
  grantTypes: z.array(z.enum(['CLIENT_CREDENTIALS', 'AUTHORIZATION_CODE', 'REFRESH_TOKEN'])).optional(),
  redirectUris: z.array(z.string().url()).optional(),
  scopes: z.array(z.string()).optional(),
  environment: z.enum(['LIVE', 'SANDBOX']).optional(),
  rateTier: z.enum(['FREE', 'STANDARD', 'ENTERPRISE']).optional(),
});
const subSchema = z.object({
  endpointUrl: z.string().url(), eventTypes: z.array(z.string()).min(1),
  description: z.string().optional(), environment: z.enum(['LIVE', 'SANDBOX']).optional(),
});
const tokenSchema = z.object({
  grant_type: z.string(),
  client_id: z.string().optional(), client_secret: z.string().optional(),
  code: z.string().optional(), code_verifier: z.string().optional(),
  refresh_token: z.string().optional(), scope: z.array(z.string()).optional(),
});

export async function listKeys(req, res) { ok(res, await service.listKeys(req.user.orgId)); }
export async function createKey(req, res) { created(res, await service.createKey(req.user.orgId, keySchema.parse(req.body))); }
export async function revokeKey(req, res) { ok(res, await service.revokeKey(req.user.orgId, req.params.id)); }

export async function listClients(req, res) { ok(res, await service.listClients(req.user.orgId)); }
export async function createClient(req, res) { created(res, await service.createClient(req.user.orgId, clientSchema.parse(req.body))); }
export async function removeClient(req, res) { ok(res, await service.removeClient(req.user.orgId, req.params.id)); }

/** The OAuth token endpoint is PUBLIC — the client authenticates with its own credentials. */
export async function token(req, res) {
  const dto = tokenSchema.parse(req.body);
  if (dto.grant_type === 'client_credentials') return res.json(await service.clientCredentials(dto.client_id, dto.client_secret, dto.scope ?? []));
  if (dto.grant_type === 'authorization_code') return res.json(await service.exchangeCode(dto.client_id, dto.client_secret, dto.code, dto.code_verifier));
  if (dto.grant_type === 'refresh_token') return res.json(await service.refresh(dto.client_id, dto.client_secret, dto.refresh_token));
  res.status(400).json({ error: 'unsupported_grant_type' });
}
export async function authorize(req, res) {
  const b = z.object({ client_id: z.string(), redirect_uri: z.string(), scope: z.array(z.string()).optional(), code_challenge: z.string().optional() }).parse(req.body);
  res.json(await service.authorize(b.client_id, b.redirect_uri, b.scope ?? [], b.code_challenge));
}
export async function introspect(req, res) { ok(res, await service.introspect(req.user.orgId, req.body?.token)); }
export async function revokeToken(req, res) { ok(res, await service.revokeToken(req.user.orgId, req.body?.token)); }

export async function listSubscriptions(req, res) { ok(res, await service.listSubscriptions(req.user.orgId)); }
export async function createSubscription(req, res) { created(res, await service.createSubscription(req.user.orgId, subSchema.parse(req.body))); }
export async function removeSubscription(req, res) { ok(res, await service.removeSubscription(req.user.orgId, req.params.id)); }

export async function listDeliveries(req, res) {
  const { page, limit, skip } = pageParams(req.query);
  const { data, total } = await service.listDeliveries(req.user.orgId, { skip, limit, status: req.query.status, subscriptionId: req.query.subscriptionId });
  paginated(res, data, { total, page, limit });
}
export async function redeliver(req, res) { ok(res, await service.redeliver(req.user.orgId, req.params.id)); }
export async function drain(req, res) { ok(res, await service.drainDeliveries(req.user.orgId, {})); }

export async function testEvent(req, res) {
  const b = z.object({ eventType: z.string(), payload: z.record(z.any()).optional() }).parse(req.body);
  ok(res, await service.dispatch(req.user.orgId, b.eventType, b.payload ?? { test: true }));
}

export async function usageSummary(req, res) { ok(res, await service.usageSummary(req.user.orgId, Number(req.query.hours ?? 24))); }
export async function usageTimeseries(req, res) { ok(res, await service.usageTimeseries(req.user.orgId, Number(req.query.hours ?? 24))); }
export async function quota(req, res) { ok(res, await service.quota(req.user.orgId, String(req.query.tier ?? 'FREE'))); }

export async function listVersions(req, res) { ok(res, await service.listVersions()); }
export async function seedVersions(req, res) { ok(res, await service.seedVersions()); }
export async function upsertVersion(req, res) {
  const b = z.object({ version: z.string(), status: z.enum(['ACTIVE', 'DEPRECATED', 'SUNSET']).optional(), sunsetAt: z.string().datetime().optional(), notes: z.string().optional() }).parse(req.body);
  ok(res, await service.upsertVersion(b));
}

export async function openapi(req, res) { ok(res, service.openApiDocument(req.query.baseUrl)); }
export async function sdk(req, res) { ok(res, service.sdkPlan()); }
export async function events(req, res) { ok(res, service.eventCatalog()); }
