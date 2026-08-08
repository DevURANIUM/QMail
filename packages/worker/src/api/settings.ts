import { Hono } from 'hono';
import { DatabaseQueries } from '../db/queries';

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
];

// Sensitive settings that should be masked when reading
const SENSITIVE_SETTINGS = [
  'cloudflare_api_key',
  'brevo_api_key',
  'admin_password_hash',
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

    return c.json(maskedSettings);
  } catch (error) {
    console.error('Get settings error:', error);
    return c.json({ error: 'Failed to get settings' }, 500);
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

    // Validate keys
    for (const key of Object.keys(updates)) {
      if (!ALLOWED_SETTINGS.includes(key)) {
        return c.json({ error: `Invalid setting key: ${key}` }, 400);
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
