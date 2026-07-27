/**
 * Security domain logic — pure, ported from the original platform's encryption, rate-limit,
 * ip-access, account-security, session, security-event, upload-security, retention, gdpr,
 * and compliance cores. Deterministic given their inputs.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/* ------------------------------- encryption ------------------------------ */
/** Derive a 32-byte AES key from a secret. Production: use a KMS data key instead. */
export const deriveKey = (secret, salt = 'mccms.security.v1') => scryptSync(secret, salt, 32);

/** AES-256-GCM field encryption. Returns iv:tag:ciphertext (base64, colon-joined). */
export function encryptField(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

/** Decrypt; the GCM auth tag makes tampering throw rather than return garbage. */
export function decryptField(payload, key) {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const generateSecret = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a, b) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/* ------------------------------- rate limit ------------------------------ */
/** Fixed-window limiter. Owns the math; the store persists `state`. */
export function checkRateLimit(state, cfg, now) {
  const windowMs = cfg.windowSec * 1000;
  let s = state && now - state.windowStart < windowMs ? { ...state } : { count: 0, windowStart: now };
  const resetAtMs = s.windowStart + windowMs;
  if (s.count >= cfg.maxRequests) {
    return { allowed: false, remaining: 0, resetAtMs, retryAfterSec: Math.max(1, Math.ceil((resetAtMs - now) / 1000)), state: s };
  }
  s = { ...s, count: s.count + 1 };
  return { allowed: true, remaining: Math.max(0, cfg.maxRequests - s.count), resetAtMs, retryAfterSec: 0, state: s };
}

/** Sliding-window log limiter — smoother than fixed windows at boundaries. */
export function checkSlidingWindow(timestamps, cfg, now) {
  const cutoff = now - cfg.windowSec * 1000;
  const recent = timestamps.filter((t) => t > cutoff);
  if (recent.length >= cfg.maxRequests) return { allowed: false, remaining: 0, timestamps: recent };
  recent.push(now);
  return { allowed: true, remaining: Math.max(0, cfg.maxRequests - recent.length), timestamps: recent };
}

/* -------------------------------- ip access ------------------------------ */
function ipToInt(ip) {
  const parts = String(ip).trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

export function parseCidr(cidr) {
  const [ip, bitsStr] = String(cidr).trim().split('/');
  const base = ipToInt(ip);
  if (base == null) return null;
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (base & mask) >>> 0, mask };
}

export function ipInCidr(ip, cidr) {
  const addr = ipToInt(ip), parsed = parseCidr(cidr);
  if (addr == null || !parsed) return false;
  return ((addr & parsed.mask) >>> 0) === parsed.base;
}

/** An empty allowlist means "allow all". */
export const ipAllowed = (ip, cidrs) => (!cidrs.length ? true : cidrs.some((c) => ipInCidr(ip, c)));

/* ----------------------------- account security -------------------------- */
export const DEFAULT_LOCKOUT = { maxFailures: 5, windowSec: 900, lockoutSec: 900 };

/** Lock out after N *consecutive recent* failures — a success resets the streak. */
export function evaluateLockout(attempts, now, policy = DEFAULT_LOCKOUT) {
  const cutoff = now - policy.windowSec * 1000;
  const recent = attempts.filter((a) => a.at > cutoff);
  let failedCount = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].success) break;
    failedCount++;
  }
  if (failedCount >= policy.maxFailures) return { locked: true, failedCount, lockedUntilMs: now + policy.lockoutSec * 1000 };
  return { locked: false, failedCount };
}

export const isLocked = (lockedUntilMs, now) => lockedUntilMs != null && lockedUntilMs > now;

export function isPasswordExpired(lastChangedMs, maxAgeDays, now) {
  if (maxAgeDays <= 0) return false;
  return now - lastChangedMs > maxAgeDays * 86_400_000;
}

export const passwordReused = (newHash, history) => history.includes(newHash);

export function shouldRequireMfa(ctx) {
  if (!ctx.mfaEnabled) return false;
  return Boolean(ctx.newDevice || ctx.elevatedRole || ctx.sensitiveAction);
}

/* --------------------------------- session ------------------------------- */
export const isExpired = (expiresAtMs, now) => now >= expiresAtMs;
export const isIdleTimedOut = (lastSeenMs, idleTimeoutSec, now) => idleTimeoutSec > 0 && now - lastSeenMs > idleTimeoutSec * 1000;

/** Rotate a token past half its lifetime (mitigates session fixation). */
export function shouldRotate(createdAtMs, expiresAtMs, now) {
  const life = expiresAtMs - createdAtMs;
  return life > 0 && now - createdAtMs > life / 2;
}

/** Enforce a concurrent-session cap: returns the sessions to revoke (oldest first). */
export function sessionsToEvict(sessions, cap) {
  if (sessions.length <= cap) return [];
  return [...sessions].sort((a, b) => a.lastSeenAt - b.lastSeenAt).slice(0, sessions.length - cap);
}

export function deviceLabel(userAgent) {
  const ua = (userAgent ?? '').toLowerCase();
  const os = ua.includes('windows') ? 'Windows' : ua.includes('mac') ? 'macOS' : ua.includes('android') ? 'Android'
    : ua.includes('iphone') || ua.includes('ipad') ? 'iOS' : ua.includes('linux') ? 'Linux' : 'Unknown OS';
  const browser = ua.includes('edg') ? 'Edge' : ua.includes('chrome') ? 'Chrome' : ua.includes('firefox') ? 'Firefox'
    : ua.includes('safari') ? 'Safari' : 'Unknown';
  return `${browser} on ${os}`;
}

/* ----------------------------- security events --------------------------- */
const SEVERITY_MAP = {
  LOGIN_SUCCESS: 'INFO', SESSION_REVOKED: 'LOW', MFA_CHALLENGE: 'LOW', PASSWORD_CHANGED: 'LOW',
  LOGIN_FAILURE: 'MEDIUM', RATE_LIMITED: 'MEDIUM', UPLOAD_REJECTED: 'MEDIUM', DATA_EXPORT: 'MEDIUM',
  PERMISSION_DENIED: 'HIGH', IP_BLOCKED: 'HIGH', SECRET_ACCESS: 'HIGH', DATA_DELETION: 'HIGH',
  LOCKOUT: 'CRITICAL',
};
export const classifyEvent = (type) => SEVERITY_MAP[type] ?? 'INFO';

/** Brute-force: total failures in a rolling window, across all IPs. */
export function detectBruteForce(attempts, now, windowSec = 300, threshold = 10) {
  const cutoff = now - windowSec * 1000;
  return attempts.filter((a) => a.at > cutoff && !a.success).length >= threshold;
}

export function distinctIpsInWindow(attempts, now, windowSec = 600) {
  const cutoff = now - windowSec * 1000;
  return new Set(attempts.filter((a) => a.at > cutoff && a.ip).map((a) => a.ip)).size;
}

/** Composite 0-100 risk score from recent signals. */
export function riskScore(signals) {
  let score = 0;
  score += Math.min(40, signals.failures * 8);
  score += Math.min(30, Math.max(0, signals.distinctIps - 1) * 15);
  if (signals.newDevice) score += 15;
  if (signals.offHours) score += 15;
  return Math.min(100, score);
}

/* ----------------------------- upload security --------------------------- */
const SIGNATURES = {
  'image/jpeg': ['ffd8ff'], 'image/png': ['89504e47'], 'image/gif': ['47494638'],
  'image/webp': ['52494646'], 'application/pdf': ['25504446'], 'application/zip': ['504b0304'],
};
const DANGEROUS_EXT = ['exe', 'sh', 'bat', 'cmd', 'com', 'js', 'jar', 'php', 'phtml', 'py', 'rb', 'dll', 'so', 'htaccess'];

export const extensionOf = (name) => String(name).toLowerCase().split('.').pop() ?? '';

/** Strip path separators, traversal dots, and unsafe characters. */
export function sanitizeFilename(name) {
  return (name ?? '')
    .replace(/[/\\]/g, '_')
    .replace(/\.\.+/g, '.')
    .replace(/[^\w.\-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 200) || 'file';
}

/** Does the file's leading bytes match its declared MIME type? */
export function magicMatches(mime, hexPrefix) {
  const sigs = SIGNATURES[mime];
  if (!sigs) return true;   // unknown type: not asserted
  return sigs.some((s) => String(hexPrefix).toLowerCase().startsWith(s));
}

/**
 * Validate an upload: path traversal, extension, double-extension, MIME allowlist, size,
 * magic bytes.
 *
 * NOTE: the original implementation sanitized the filename but did NOT raise an issue for
 * path separators or traversal sequences, so `../../etc/passwd` returned ok:true. A caller
 * that trusted `ok` and then used the ORIGINAL name would be exploitable. We now flag it.
 */
export function validateUpload(meta, opts) {
  const issues = [];
  if (/[/\\]/.test(meta.filename) || /\.\./.test(meta.filename)) issues.push('path traversal in filename');
  const ext = extensionOf(meta.filename);
  if (DANGEROUS_EXT.includes(ext)) issues.push(`disallowed extension: .${ext}`);
  const parts = meta.filename.toLowerCase().split('.');
  if (parts.length > 2 && DANGEROUS_EXT.includes(parts.slice(-2, -1)[0])) issues.push('suspicious double extension');
  if (opts.allowedMime?.length && !opts.allowedMime.includes(meta.mime)) issues.push(`MIME not allowed: ${meta.mime}`);
  if (meta.sizeBytes > opts.maxBytes) issues.push(`file too large: ${meta.sizeBytes} > ${opts.maxBytes}`);
  if (opts.hexPrefix && !magicMatches(meta.mime, opts.hexPrefix)) issues.push('content does not match declared type');
  return { ok: issues.length === 0, issues, safeName: sanitizeFilename(meta.filename) };
}

/* -------------------------------- retention ------------------------------ */
export function dueForDeletion(records, ttlDays, now) {
  const cutoff = now - ttlDays * 86_400_000;
  return records.filter((r) => r.createdAt < cutoff).map((r) => r.id);
}

export function anonymize(record, piiFields) {
  const out = { ...record };
  for (const f of piiFields) if (f in out) out[f] = out[f] == null ? null : 'REDACTED';
  return out;
}

export const nextRetentionRunHint = (ttlDays) => (ttlDays <= 7 ? 'daily' : ttlDays <= 90 ? 'weekly' : 'monthly');

/* ---------------------------------- GDPR --------------------------------- */
export const PII_KEYS = ['email', 'phone', 'name', 'firstname', 'lastname', 'address', 'ip', 'ssn', 'taxid', 'dob'];

/** Redact PII anywhere in a nested structure (exports, logs). */
export function redactPii(value, extraKeys = []) {
  const keys = new Set([...PII_KEYS, ...extraKeys].map((k) => k.toLowerCase()));
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = keys.has(k.toLowerCase()) ? 'REDACTED' : walk(val);
      return out;
    }
    return v;
  };
  return walk(value);
}

/** Data-subject access / portability manifest. */
export function buildExportManifest(subjectEmail, sections, generatedAt = new Date()) {
  const enriched = sections.map((s) => ({ source: s.source, count: s.records.length, records: s.records }));
  return { subject: subjectEmail, generatedAt: generatedAt.toISOString(), sections: enriched, totalRecords: enriched.reduce((a, s) => a + s.count, 0) };
}

/** An erasure plan: which sources to delete vs anonymize. */
export const buildErasurePlan = (sections) => ({
  total: sections.reduce((a, s) => a + s.ids.length, 0),
  steps: sections.filter((s) => s.ids.length),
});

/* -------------------------------- compliance ----------------------------- */
const WEIGHT = { IMPLEMENTED: 1, IN_PROGRESS: 0.5, NOT_STARTED: 0, NOT_APPLICABLE: -1 };

/** Readiness score (0..1), excluding N/A controls from the denominator. */
export function scoreControls(controls) {
  let applicable = 0, sum = 0, implemented = 0, inProgress = 0, notStarted = 0;
  for (const c of controls) {
    const w = WEIGHT[c.status] ?? 0;
    if (w < 0) continue;
    applicable++; sum += w;
    if (c.status === 'IMPLEMENTED') implemented++;
    else if (c.status === 'IN_PROGRESS') inProgress++;
    else notStarted++;
  }
  return { score: applicable ? +(sum / applicable).toFixed(3) : 0, implemented, inProgress, notStarted, applicable };
}

export const readinessLabel = (score) =>
  (score >= 0.95 ? 'audit-ready' : score >= 0.75 ? 'nearly-ready' : score >= 0.4 ? 'in-progress' : 'not-ready');

/** Gaps in priority order: not-started before in-progress. */
export const complianceGaps = (controls) =>
  controls.filter((c) => c.status === 'NOT_STARTED' || c.status === 'IN_PROGRESS')
    .sort((a, b) => (a.status === 'NOT_STARTED' ? 0 : 1) - (b.status === 'NOT_STARTED' ? 0 : 1));

/** Starter control checklists per framework. */
export const STARTER_CONTROLS = {
  SOC2: [
    { controlId: 'CC6.1', title: 'Logical access controls restrict unauthorized access' },
    { controlId: 'CC6.6', title: 'Encryption of data in transit and at rest' },
    { controlId: 'CC7.2', title: 'Security event monitoring and alerting' },
    { controlId: 'CC7.3', title: 'Incident response procedures' },
    { controlId: 'CC8.1', title: 'Change management process' },
  ],
  GDPR: [
    { controlId: 'ART-15', title: 'Right of access by the data subject' },
    { controlId: 'ART-17', title: 'Right to erasure (right to be forgotten)' },
    { controlId: 'ART-20', title: 'Right to data portability' },
    { controlId: 'ART-30', title: 'Records of processing activities' },
    { controlId: 'ART-32', title: 'Security of processing' },
    { controlId: 'ART-33', title: 'Breach notification within 72 hours' },
  ],
};
