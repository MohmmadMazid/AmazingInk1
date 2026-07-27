import { z } from 'zod';
import * as service from './ai.service.js';
import { ok, created } from '../../utils/envelope.js';

const promptSchema = z.object({
  key: z.string().min(1), description: z.string().optional(),
  systemPrompt: z.string().min(1), userTemplate: z.string().min(1),
  json: z.boolean().optional(), active: z.boolean().optional(),
});
const imageSchema = z.object({
  widthPx: z.number().int().positive(), heightPx: z.number().int().positive(),
  sizeBytes: z.number().int().positive(), format: z.string(),
});

export async function providers(req, res) { ok(res, service.availableProviders()); }
export async function usageReport(req, res) { ok(res, await service.usageReport(req.user.orgId, { days: Number(req.query.days ?? 30) })); }
export async function recentCalls(req, res) { ok(res, await service.recentCalls(req.user.orgId)); }

export async function listPrompts(req, res) { ok(res, await service.listPrompts(req.user.orgId)); }
export async function upsertPrompt(req, res) { ok(res, await service.upsertPrompt(req.user.orgId, promptSchema.parse(req.body))); }
export async function runPrompt(req, res) { ok(res, await service.runPrompt(req.user.orgId, req.params.key, req.body?.vars, req.user.id)); }

export async function generateDescription(req, res) { ok(res, await service.generateDescription(req.user.orgId, req.params.productId, req.user.id)); }
export async function generateKeywords(req, res) { ok(res, await service.generateKeywords(req.user.orgId, req.params.productId, req.user.id)); }
export async function findDuplicates(req, res) { ok(res, await service.findDuplicates(req.user.orgId, req.params.productId, Number(req.query.threshold ?? 0.4))); }

export async function forecast(req, res) {
  ok(res, await service.forecastProduct(req.user.orgId, req.params.productId, {
    horizon: Number(req.query.horizon ?? 7), leadTimeDays: Number(req.query.leadTimeDays ?? 7),
    explain: req.query.explain !== 'false', userId: req.user.id,
  }));
}

export async function suggestPrice(req, res) {
  ok(res, await service.suggestProductPrice(req.user.orgId, req.params.productId, {
    elasticity: Number(req.query.elasticity ?? -1.5), floorMarginPct: Number(req.query.floorMarginPct ?? 30),
    explain: req.query.explain !== 'false', userId: req.user.id,
  }));
}

export async function insights(req, res) { ok(res, await service.businessInsights(req.user.orgId, { days: Number(req.query.days ?? 30), userId: req.user.id })); }
export async function checkImage(req, res) { ok(res, service.checkImage(imageSchema.parse(req.body))); }
