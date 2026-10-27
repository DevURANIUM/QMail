import { Hono } from 'hono';
import { DatabaseQueries } from '../db/queries';
import { getVapidPublicKey, savePushSubscription } from '../lib/push';

export interface Env {
  DB: D1Database;
}

const push = new Hono<{ Bindings: Env }>();

/**
 * Public VAPID key for PushManager.subscribe (auth required upstream)
 */
push.get('/vapid-key', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const key = await getVapidPublicKey(db);
    return c.json({ key });
  } catch (error) {
    console.error('VAPID key error:', error);
    return c.json({ error: 'Failed to get push key' }, 500);
  }
});

/**
 * Register a browser push subscription
 */
push.post('/subscribe', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const subscription = await c.req.json<{
      endpoint: string;
      keys: { p256dh: string; auth: string };
    }>();

    if (!subscription?.endpoint?.startsWith('https://') || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return c.json({ error: 'Invalid subscription' }, 400);
    }

    await savePushSubscription(db, subscription);
    return c.json({ success: true });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return c.json({ error: 'Failed to subscribe' }, 500);
  }
});

/**
 * Remove a subscription
 */
push.post('/unsubscribe', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const { endpoint } = await c.req.json<{ endpoint: string }>();
    if (endpoint) {
      await db.deletePushSubscription(endpoint);
    }
    return c.json({ success: true });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return c.json({ error: 'Failed to unsubscribe' }, 500);
  }
});

export default push;
