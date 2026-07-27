import { z } from 'zod';
import * as service from './settings.service.js';
import { ok } from '../../utils/envelope.js';

export async function bootstrap(req, res) { ok(res, await service.bootstrapConfig(req.user.orgId)); }
export async function getCurrency(req, res) { ok(res, await service.getCurrency(req.user.orgId)); }
export async function setCurrency(req, res) {
  const { currency } = z.object({ currency: z.string().length(3) }).parse(req.body);
  ok(res, await service.setCurrency(req.user.orgId, currency));
}
export async function supported(req, res) { ok(res, service.supportedCurrencies()); }
