/**
 * Notification channel adapters — the seam between the notification engine and real
 * delivery providers (SendGrid/SES, Twilio, FCM/APNs, WebSocket).
 *
 * Each adapter exposes: send(recipient, message) -> { statusCode, providerId? }.
 * The defaults are RUNNABLE SIMULATIONS that log and record what would have been sent,
 * so the full preference/quiet-hours/digest flow works with no credentials.
 *
 * IN_APP is genuinely real: it persists to the notifications collection (handled by the
 * service), so the bell menu works out of the box. To go live on EMAIL/SMS/PUSH, replace
 * one adapter's `send` with a provider call. Nothing else changes.
 */

const sent = []; // in-memory sink for the simulated providers (inspect via __outbox)

function simulatedChannel(channel) {
  return {
    channel,
    async send(recipient, message) {
      const to = channel === 'EMAIL' ? recipient.email : channel === 'SMS' ? recipient.phone : recipient.userId;
      if (!to) return { statusCode: 400, error: `no ${channel.toLowerCase()} address for recipient` };
      const record = { channel, to, subject: message.subject, text: message.text, at: new Date() };
      sent.push(record);
      if (sent.length > 500) sent.shift();
      return { statusCode: 200, providerId: `${channel.toLowerCase()}_${Date.now().toString(36)}` };
    },
  };
}

/** IN_APP is persisted by the service itself; this adapter is a no-op success. */
const inApp = { channel: 'IN_APP', async send() { return { statusCode: 200 }; } };

export const CHANNEL_REGISTRY = {
  IN_APP: inApp,
  EMAIL: simulatedChannel('EMAIL'),
  SMS: simulatedChannel('SMS'),
  PUSH: simulatedChannel('PUSH'),
};

export const getChannel = (code) => CHANNEL_REGISTRY[String(code).toUpperCase()] ?? null;

/** Inspection hook: what the simulated providers "sent". Useful in the UI and tests. */
export const __outbox = () => [...sent].reverse();
