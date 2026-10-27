import { Hono } from 'hono';
import { DatabaseQueries } from '../db/queries';
import { sendTelegramMessage, validateTelegramConfig } from '../lib/telegram';

export interface Env {
  DB: D1Database;
}

const settings = new Hono<{ Bindings: Env }>();

// Settings keys that can be read/written
const ALLOWED_SETTINGS = [
  'domain',
  'destination_email',
  'cloudflare_api_key',
  'cloudflare_account_id',
  'cloudflare_zone_id',
  'brevo_api_key',
  'setup_completed',
  'block_remote_images',
];

// Sensitive settings that should be masked when reading
const SENSITIVE_SETTINGS = [
  'cloudflare_api_key',
  'brevo_api_key',
  'admin_password_hash',
  'brevo_webhook_secret',
  'vapid_private_jwk',
  'telegram_bot_token',
];

/**
 * Get all settings
 */
settings.get('/', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const allSettings = await db.getAllSettings();

    // Mask sensitive values
    const maskedSettings: Record<string, string> = {};
    for (const [key, value] of Object.entries(allSettings)) {
      if (SENSITIVE_SETTINGS.includes(key) && value) {
        maskedSettings[key] = '********';
      } else {
        maskedSettings[key] = value;
      }
    }

    c.header('Cache-Control', 'no-store');
    return c.json(maskedSettings);
  } catch (error) {
    console.error('Get settings error:', error);
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

// Dedicated endpoints keep Telegram validation atomic and secrets write-only.
settings.put('/telegram', async (c) => {
  const db = new DatabaseQueries(c.env.DB);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.enabled !== 'boolean' || typeof body.chatId !== 'string' ||
      (body.botToken !== undefined && typeof body.botToken !== 'string')) {
    return c.json({ error: 'Invalid Telegram settings' }, 400);
  }
  const token = body.botToken?.trim() || await db.getSetting('telegram_bot_token') || '';
  const chatId = body.chatId.trim();
  const invalid = validateTelegramConfig(token, chatId);
  if (invalid && (body.enabled || token || chatId)) return c.json({ error: invalid }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').bind('telegram_bot_token', token),
    c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').bind('telegram_chat_id', chatId),
    c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').bind('telegram_enabled', String(body.enabled)),
  ]);
  c.header('Cache-Control', 'no-store');
  return c.json({ success: true });
});

settings.post('/telegram/test', async (c) => {
  const db = new DatabaseQueries(c.env.DB);
  try {
    await sendTelegramMessage(await db.getSetting('telegram_bot_token') || '', await db.getSetting('telegram_chat_id') || '',
      'Qmail is connected. New incoming emails will be delivered here when Telegram forwarding is enabled.');
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Telegram test failed' }, 400);
  }
});

/**
 * Get a specific setting
 */
settings.get('/:key', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const key = c.req.param('key');

    if (!ALLOWED_SETTINGS.includes(key)) {
      return c.json({ error: 'Invalid setting key' }, 400);
    }

    const value = await db.getSetting(key);

    // Mask sensitive values
    if (SENSITIVE_SETTINGS.includes(key) && value) {
      return c.json({ key, value: '********', masked: true });
    }

    return c.json({ key, value });
  } catch (error) {
    console.error('Get setting error:', error);
    return c.json({ error: 'Failed to get setting' }, 500);
  }
});

/**
 * Update settings
 */
settings.put('/', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const updates = await c.req.json<Record<string, string>>();

    // Validate keys and value types
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_SETTINGS.includes(key)) {
        return c.json({ error: `Invalid setting key: ${key}` }, 400);
      }
      if (typeof value !== 'string') {
        return c.json({ error: `Setting ${key} must be a string` }, 400);
      }
    }

    // Update each setting
    for (const [key, value] of Object.entries(updates)) {
      // Don't update if value is masked
      if (value !== '********') {
        await db.setSetting(key, value);
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Update settings error:', error);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});

/**
 * Update a specific setting
 */
settings.put('/:key', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const key = c.req.param('key');

    if (!ALLOWED_SETTINGS.includes(key)) {
      return c.json({ error: 'Invalid setting key' }, 400);
    }

    const { value } = await c.req.json<{ value: string }>();

    if (typeof value !== 'string') {
      return c.json({ error: 'Setting value must be a string' }, 400);
    }

    // Don't update if value is masked
    if (value === '********') {
      return c.json({ success: true, message: 'No change (masked value)' });
    }

    await db.setSetting(key, value);

    return c.json({ success: true });
  } catch (error) {
    console.error('Update setting error:', error);
    return c.json({ error: 'Failed to update setting' }, 500);
  }
});

export default settings;
