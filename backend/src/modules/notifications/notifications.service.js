import { Notification } from '../../models/notification.model.js';
import { NotificationTemplate } from '../../models/notification-template.model.js';
import { NotificationSetting } from '../../models/notification-preference.model.js';
import { User } from '../../models/user.model.js';
import { ApiError } from '../../utils/asyncHandler.js';
import { getChannel, __outbox } from '../../adapters/notification.registry.js';
import {
  applyQuietHours, buildDigest, dedupeKey, nextDigestAt, renderTemplate, resolveChannels, shouldSuppress,
} from '../../core/notifications.js';

const DEDUPE_WINDOW_MINUTES = 30;

/* ------------------------------- settings -------------------------------- */
/** Get-or-create a user's notification settings. */
export async function getSettings(orgId, userId) {
  return NotificationSetting.findOneAndUpdate(
    { organizationId: orgId, userId },
    { $setOnInsert: { organizationId: orgId, userId } },
    { new: true, upsert: true },
  );
}

export async function updateSettings(orgId, userId, body) {
  return NotificationSetting.findOneAndUpdate(
    { organizationId: orgId, userId },
    { $set: body },
    { new: true, upsert: true, runValidators: true },
  );
}

/* ------------------------------- templates ------------------------------- */
export const listTemplates = (orgId) => NotificationTemplate.find({ organizationId: orgId }).sort({ key: 1 });
export const createTemplate = (orgId, body) =>
  NotificationTemplate.findOneAndUpdate({ organizationId: orgId, key: body.key }, { $set: { ...body, organizationId: orgId } }, { new: true, upsert: true });

/** Preview a template render without sending anything (shows missing variables). */
export async function previewTemplate(orgId, key, vars) {
  const tpl = await NotificationTemplate.findOne({ organizationId: orgId, key });
  if (!tpl) throw new ApiError(404, `Template ${key} not found`, 'not_found');
  return renderTemplate(tpl, vars ?? {});
}

/* --------------------------------- emit ---------------------------------- */
/**
 * THE EMIT PIPELINE. Other modules call this on a domain event.
 *
 *   1. Dedupe   — collapse repeat alerts about the same entity inside a time window.
 *   2. Render   — resolve the template (or use the literal title/body).
 *   3. Resolve  — which channels, given the user's prefs. URGENT and ERROR/SYNC_FAILURE
 *                 can never be silently suppressed.
 *   4. Quiet    — hold non-urgent EMAIL/SMS/PUSH during quiet hours; IN_APP always lands.
 *   5. Deliver  — send on each channel through its adapter, recording per-channel status.
 */
export async function emit(orgId, { userId, category, priority = 'NORMAL', templateKey, vars, title, body, entityType, entityId }) {
  const key = dedupeKey(category, entityType, entityId);

  // 1) Dedupe.
  const last = await Notification.findOne({ organizationId: orgId, userId, dedupeKey: key }).sort({ createdAt: -1 }).select('createdAt');
  if (shouldSuppress(last?.createdAt ?? null, new Date(), DEDUPE_WINDOW_MINUTES)) {
    return { suppressed: true, reason: 'duplicate_within_window', dedupeKey: key };
  }

  // 2) Render.
  let message = { subject: title, text: body ?? '' };
  let missing = [];
  if (templateKey) {
    const tpl = await NotificationTemplate.findOne({ organizationId: orgId, key: templateKey, active: true });
    if (!tpl) throw new ApiError(404, `Template ${templateKey} not found`, 'not_found');
    const rendered = renderTemplate(tpl, vars ?? {});
    message = rendered.message;
    missing = rendered.missing;
    category = category ?? tpl.category;
  }

  // 3) Resolve channels against the user's preferences.
  const settings = await getSettings(orgId, userId);
  const channels = resolveChannels(category, priority, settings.preferences ?? [], settings);

  // 4) Quiet hours (URGENT breaks through).
  const nowMinutes = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  const { deliver, deferred } = applyQuietHours(channels, priority, nowMinutes, settings);

  // 5) Persist the notification (this IS the in-app delivery), then fan out.
  const notification = await Notification.create({
    organizationId: orgId, userId, category, priority,
    title: message.subject ?? title ?? category,
    body: message.text, entityType, entityId, dedupeKey: key,
    deferred: deferred.length > 0,
    deliveries: [
      ...deliver.map((c) => ({ channel: c, status: 'PENDING' })),
      ...deferred.map((c) => ({ channel: c, status: 'SKIPPED', error: 'deferred: quiet hours' })),
    ],
  });

  const user = await User.findById(userId).select('email phone');
  const recipient = { userId, email: user?.email, phone: user?.phone };

  for (const ch of deliver) {
    const adapter = getChannel(ch);
    const d = notification.deliveries.find((x) => x.channel === ch);
    if (!adapter) { d.status = 'FAILED'; d.error = 'no adapter'; continue; }
    const res = await adapter.send(recipient, message).catch((e) => ({ statusCode: 0, error: e.message }));
    if (res.statusCode >= 200 && res.statusCode < 300) { d.status = 'SENT'; d.providerId = res.providerId; d.sentAt = new Date(); }
    else { d.status = 'FAILED'; d.error = res.error ?? `HTTP ${res.statusCode}`; }
  }
  await notification.save();

  return { notification, channels: deliver, deferred, missingVars: missing };
}

/* ------------------------------- inbox ----------------------------------- */
export async function inbox(orgId, userId, { skip, limit, unreadOnly }) {
  const where = { organizationId: orgId, userId };
  if (unreadOnly) where.readAt = null;
  const [data, total, unread] = await Promise.all([
    Notification.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(where),
    Notification.countDocuments({ organizationId: orgId, userId, readAt: null }),
  ]);
  return { data, total, unread };
}

export async function markRead(orgId, userId, id) {
  const n = await Notification.findOneAndUpdate({ _id: id, organizationId: orgId, userId }, { $set: { readAt: new Date() } }, { new: true });
  if (!n) throw new ApiError(404, 'Notification not found', 'not_found');
  return n;
}

export async function markAllRead(orgId, userId) {
  const r = await Notification.updateMany({ organizationId: orgId, userId, readAt: null }, { $set: { readAt: new Date() } });
  return { updated: r.modifiedCount };
}

/* -------------------------------- digest --------------------------------- */
/**
 * Build the pending digest for a user: everything deferred by quiet hours and not yet
 * digested, grouped by category. In production a scheduled job sends and stamps these.
 */
export async function pendingDigest(orgId, userId) {
  const settings = await getSettings(orgId, userId);
  const items = await Notification.find({ organizationId: orgId, userId, deferred: true, digestedAt: null })
    .select('category title createdAt').sort({ createdAt: -1 }).lean();
  return { nextDigestAt: nextDigestAt(settings), cadence: settings.digest, ...buildDigest(items) };
}

/** Send the digest (marks the items digested). */
export async function sendDigest(orgId, userId) {
  const digest = await pendingDigest(orgId, userId);
  if (!digest.total) return { sent: false, reason: 'nothing_pending' };

  const user = await User.findById(userId).select('email');
  const summary = digest.byCategory.map((c) => `${c.count} ${c.category}`).join(', ');
  const adapter = getChannel('EMAIL');
  const res = await adapter.send({ userId, email: user?.email }, { subject: `Your digest: ${digest.total} notifications`, text: summary });

  await Notification.updateMany({ organizationId: orgId, userId, deferred: true, digestedAt: null }, { $set: { digestedAt: new Date() } });
  return { sent: res.statusCode === 200, total: digest.total, summary };
}

/* ------------------------------- broadcast ------------------------------- */
/** Emit the same notification to every active user in the org (respecting each one's prefs). */
export async function broadcast(orgId, { category, priority, title, body, templateKey, vars }) {
  const users = await User.find({ organizationId: orgId, active: true, deletedAt: null }).select('_id');
  const results = [];
  for (const u of users) {
    try { results.push(await emit(orgId, { userId: u._id.toString(), category, priority, title, body, templateKey, vars })); }
    catch (e) { results.push({ userId: u._id, error: e.message }); }
  }
  return { recipients: users.length, delivered: results.filter((r) => r.notification).length, suppressed: results.filter((r) => r.suppressed).length };
}

/** What the simulated providers "sent" — useful for demoing the flow without credentials. */
export const providerOutbox = () => __outbox();
