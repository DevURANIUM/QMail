import { Hono } from 'hono';
import { DatabaseQueries } from '../db/queries';

export interface Env {
  DB: D1Database;
}

/**
 * Brevo transactional webhook → delivery status on sent emails.
 * The endpoint is unauthenticated but guarded by a random secret in the
 * path, generated when the webhook is registered.
 */

const STATUS_MAP: Record<string, string> = {
  request: 'queued',
  delivered: 'delivered',
  opened: 'opened',
  uniqueOpened: 'opened',
  click: 'opened',
  hardBounce: 'bounced',
  blocked: 'bounced',
  invalid_email: 'bounced',
  softBounce: 'deferred',
  deferred: 'deferred',
  error: 'failed',
};

// Later statuses must not be downgraded by out-of-order webhook delivery
const STATUS_RANK: Record<string, number> = {
  queued: 0,
  deferred: 1,
  delivered: 2,
  opened: 3,
  bounced: 4,
  failed: 4,
};

const webhooks = new Hono<{ Bindings: Env }>();

webhooks.post('/brevo/:secret', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const expected = await db.getSetting('brevo_webhook_secret');
    if (!expected || c.req.param('secret') !== expected) {
      return c.json({ error: 'Not found' }, 404);
    }

    const payload = await c.req.json<{ event?: string; 'message-id'?: string }>();
    const event = payload.event;
    const messageId = payload['message-id'];

    if (!event || !messageId) {
      return c.json({ success: true, ignored: true });
    }

    const status = STATUS_MAP[event];
    if (!status) {
      return c.json({ success: true, ignored: true });
    }

    // Only move status forward
    const email = await db.getEmailByBrevoMessageId(messageId);
    if (email) {
      const currentRank = STATUS_RANK[email.delivery_status || 'queued'] ?? 0;
      if ((STATUS_RANK[status] ?? 0) >= currentRank) {
        await db.updateDeliveryStatus(messageId, status);
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Brevo webhook error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

export default webhooks;
