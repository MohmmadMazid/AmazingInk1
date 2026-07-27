import { z } from 'zod';
import * as service from './auth.service.js';
import { ok, created } from '../../utils/envelope.js';

const registerSchema = z.object({
  organizationId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function register(req, res) {
  const body = registerSchema.parse(req.body);
  const { user, token } = await service.register(body);
  created(res, { user, token });
}
export async function login(req, res) {
  const body = loginSchema.parse(req.body);
  const { user, token } = await service.login({ ...body, ip: req.ip, userAgent: req.get('user-agent') });
  ok(res, { user, token });
}
export async function me(req, res) {
  ok(res, await service.me(req.user.id));
}
