import { Hono } from 'hono';
import { DatabaseQueries } from '../db/queries';
import { CloudflareEmailAPI } from '@qmail/cloudflare-email-api';
import { BrevoAPI } from '@qmail/brevo-api';
import { generateId } from '../lib/utils';

export interface Env {
  DB: D1Database;
}

const setup = new Hono<{ Bindings: Env }>();

/**
 * Get setup status
 */
setup.get('/status', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const settings = await db.getAllSettings();

    const hasCloudflare = !!(
      settings.cloudflare_api_key &&
      settings.cloudflare_account_id &&
      settings.cloudflare_zone_id
    );

    const hasBrevo = !!settings.brevo_api_key;

    return c.json({
      setupCompleted: settings.setup_completed === 'true',
      domain: settings.domain || null,
      destinationEmail: settings.destination_email || null,
      cloudflare: {
        configured: hasCloudflare,
        zoneId: settings.cloudflare_zone_id || null,
      },
      brevo: {
        configured: hasBrevo,
      },
    });
  } catch (error) {
    console.error('Get setup status error:', error);
    return c.json({ error: 'Failed to get setup status' }, 500);
  }
});

/**
 * Setup Cloudflare Email Routing
 */
setup.post('/cloudflare', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const {
      apiKey,
      accountId,
      domain,
      destinationEmail,
    } = await c.req.json<{
      apiKey: string;
      accountId: string;
      domain: string;
      destinationEmail?: string;
    }>();

    if (!apiKey || !accountId || !domain) {
      return c.json({
        error: 'apiKey, accountId, and domain are required',
      }, 400);
    }

    // Initialize Cloudflare API
    const cfApi = new CloudflareEmailAPI({
      apiKey,
      accountId,
    });

    // Ensure destination address is registered (if provided)
    if (destinationEmail) {
      await cfApi.ensureDestinationAddress(destinationEmail);
    }

    // Get or create zone
    const zone = await cfApi.domains.ensureZone(domain);

    // Enable email routing
    const routingSettings = await cfApi.routing.enable(zone.id);

    // Get required DNS records
    const dnsRecords = await cfApi.routing.getDNSRecords(zone.id);

    // Setup catch-all to route emails to the worker
    // The worker will store emails and forward them to the destination
    const catchAllRule = await cfApi.routing.setupCatchAllWorker(
      zone.id,
      'qmail'  // Worker name from wrangler.toml
    );

    // Save settings
    await db.setSetting('cloudflare_api_key', apiKey);
    await db.setSetting('cloudflare_account_id', accountId);
    await db.setSetting('cloudflare_zone_id', zone.id);
    await db.setSetting('domain', domain);
    if (destinationEmail) {
      await db.setSetting('destination_email', destinationEmail);
    }

    return c.json({
      success: true,
      zone: {
        id: zone.id,
        name: zone.name,
        status: zone.status,
        nameServers: zone.name_servers,
      },
      routing: {
        enabled: routingSettings.enabled,
        status: routingSettings.status,
      },
      catchAllRule: {
        id: catchAllRule.id,
        enabled: catchAllRule.enabled,
      },
      dnsRecords,
      message: zone.status === 'active'
        ? 'Cloudflare Email Routing configured successfully'
        : 'Zone added. Please update your domain nameservers to complete setup.',
    });
  } catch (error) {
    console.error('Cloudflare setup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    return c.json({
      error: 'Failed to setup Cloudflare',
      details: errorMessage,
      debug: errorStack,
    }, 500);
  }
});

/**
 * Setup Cloudflare to forward emails to this worker
 * Call this to fix routing if emails aren't being received by the worker
 */
setup.post('/cloudflare/worker-routing', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const body: { workerName?: string } = await c.req.json<{ workerName?: string }>().catch(() => ({}));
    const workerName = body.workerName || 'qmail';

    const apiKey = await db.getSetting('cloudflare_api_key');
    const accountId = await db.getSetting('cloudflare_account_id');
    const zoneId = await db.getSetting('cloudflare_zone_id');

    if (!apiKey || !accountId || !zoneId) {
      return c.json({ error: 'Cloudflare not configured' }, 400);
    }

    const cfApi = new CloudflareEmailAPI({ apiKey, accountId });

    // Update catch-all to forward to worker
    const catchAllRule = await cfApi.routing.setupCatchAllWorker(zoneId, workerName);

    return c.json({
      success: true,
      catchAllRule: {
        id: catchAllRule.id,
        enabled: catchAllRule.enabled,
      },
      message: 'Email routing updated to forward to worker',
    });
  } catch (error) {
    console.error('Worker routing setup error:', error);
    return c.json({
      error: 'Failed to setup worker routing',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Setup Brevo for sending
 */
setup.post('/brevo', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const { apiKey } = await c.req.json<{
      apiKey: string;
    }>();

    if (!apiKey) {
      return c.json({ error: 'apiKey is required' }, 400);
    }

    // Initialize Brevo API and verify the key works
    const brevo = new BrevoAPI({
      apiKey,
    });

    // Test the API key by getting account info
    const account = await brevo.getAccount();

    // Save settings
    await db.setSetting('brevo_api_key', apiKey);

    return c.json({
      success: true,
      account: {
        email: account.email,
        companyName: account.companyName,
      },
      message: 'Brevo configured successfully. Add your sending domain in Brevo dashboard.',
    });
  } catch (error) {
    console.error('Brevo setup error:', error);
    return c.json({
      error: 'Failed to setup Brevo',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Get Brevo senders
 */
setup.get('/brevo/senders', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const apiKey = await db.getSetting('brevo_api_key');

    if (!apiKey) {
      return c.json({ error: 'Brevo not configured' }, 400);
    }

    const brevo = new BrevoAPI({ apiKey });
    const senders = await brevo.senders.list();

    return c.json({
      success: true,
      senders,
    });
  } catch (error) {
    console.error('Brevo list senders error:', error);
    return c.json({
      error: 'Failed to list Brevo senders',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Add a managed email address
 */
setup.post('/addresses', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const { address, displayName, isDefault } = await c.req.json<{
      address: string;
      displayName?: string;
      isDefault?: boolean;
    }>();

    if (!address) {
      return c.json({ error: 'address is required' }, 400);
    }

    const id = generateId();

    await db.createAddress({
      id,
      address,
      display_name: displayName || null,
      is_default: isDefault ? 1 : 0,
    });

    if (isDefault) {
      await db.setDefaultAddress(id);
    }

    return c.json({ success: true, id });
  } catch (error) {
    console.error('Add address error:', error);
    return c.json({ error: 'Failed to add address' }, 500);
  }
});

/**
 * List managed addresses
 */
setup.get('/addresses', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const addresses = await db.listAddresses();
    return c.json(addresses);
  } catch (error) {
    console.error('List addresses error:', error);
    return c.json({ error: 'Failed to list addresses' }, 500);
  }
});

/**
 * Delete a managed address
 */
setup.delete('/addresses/:id', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const id = c.req.param('id');
    await db.deleteAddress(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete address error:', error);
    return c.json({ error: 'Failed to delete address' }, 500);
  }
});

/**
 * Complete setup
 */
setup.post('/complete', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    // Verify all required settings are configured
    const settings = await db.getAllSettings();

    const missing: string[] = [];

    if (!settings.cloudflare_api_key) missing.push('Cloudflare API Key');
    if (!settings.cloudflare_account_id) missing.push('Cloudflare Account ID');
    if (!settings.cloudflare_zone_id) missing.push('Cloudflare Zone ID');
    if (!settings.brevo_api_key) missing.push('Brevo API Key');
    if (!settings.domain) missing.push('Domain');
    // destination_email is now optional

    if (missing.length > 0) {
      return c.json({
        error: 'Setup incomplete',
        missing,
      }, 400);
    }

    await db.setSetting('setup_completed', 'true');

    return c.json({
      success: true,
      message: 'Setup completed successfully',
    });
  } catch (error) {
    console.error('Complete setup error:', error);
    return c.json({ error: 'Failed to complete setup' }, 500);
  }
});

export default setup;
