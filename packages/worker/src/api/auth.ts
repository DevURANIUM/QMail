import { Hono } from 'hono';
import { DatabaseQueries } from '../db/queries';
import { hashPassword, verifyPassword, generateToken, generateId, sha256Hex, sqliteDateTime } from '../lib/utils';
import { isValidPassword } from '../lib/validation';

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Create a session for the (single) admin user and return the raw token.
 * Only the SHA-256 hash of the token is persisted.
 */
export async function createAdminSession(db: DatabaseQueries): Promise<{ token: string; expiresAt: string }> {
  const token = generateToken(48);
  const expires = new Date(Date.now() + SESSION_TTL_MS);

  await db.createSession({
    id: generateId(),
    token: await sha256Hex(token),
    expires_at: sqliteDateTime(expires),
  });

  await db.cleanExpiredSessions();

  return { token, expiresAt: expires.toISOString() };
}

const auth = new Hono<{ Bindings: Env }>();

/**
 * Login endpoint
 */
auth.post('/login', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const { password } = await c.req.json<{ password: string }>();

    if (!password) {
      return c.json({ error: 'Password is required' }, 400);
    }

    // Get stored password hash
    const storedHash = await db.getSetting('admin_password_hash');

    if (!storedHash) {
      // First time setup - no password set yet
      return c.json({ error: 'Setup not completed', needsSetup: true }, 401);
    }

    // Verify password
    const valid = await verifyPassword(password, storedHash);

    if (!valid) {
      return c.json({ error: 'Invalid password' }, 401);
    }

    const { token, expiresAt } = await createAdminSession(db);

    return c.json({
      success: true,
      token,
      expiresAt,
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Login failed' }, 500);
  }
});

/**
 * Logout endpoint
 */
auth.post('/logout', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const token = extractBearerToken(c.req.header('Authorization'));

    if (token) {
      await db.deleteSession(await sha256Hex(token));
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ error: 'Logout failed' }, 500);
  }
});

/**
 * Setup endpoint - set initial password
 */
auth.post('/setup', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    // Check if already setup
    const existingHash = await db.getSetting('admin_password_hash');
    if (existingHash) {
      return c.json({ error: 'Already setup' }, 400);
    }

    const { password } = await c.req.json<{ password: string }>();

    const passwordCheck = isValidPassword(password);
    if (!passwordCheck.valid) {
      return c.json({ error: passwordCheck.error }, 400);
    }

    // Hash and store password
    const hash = await hashPassword(password);
    await db.setSetting('admin_password_hash', hash);

    const { token, expiresAt } = await createAdminSession(db);

    return c.json({
      success: true,
      token,
      expiresAt,
    });
  } catch (error) {
    console.error('Setup error:', error);
    return c.json({ error: 'Setup failed' }, 500);
  }
});

/**
 * Check auth status
 */
auth.get('/status', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const token = extractBearerToken(c.req.header('Authorization'));
    const hasPasskeys = (await db.countCredentials()) > 0;

    if (!token) {
      const hasPassword = await db.getSetting('admin_password_hash');
      return c.json({
        authenticated: false,
        needsSetup: !hasPassword,
        hasPasskeys,
      });
    }

    const session = await db.getSessionByToken(await sha256Hex(token));

    if (!session) {
      const hasPassword = await db.getSetting('admin_password_hash');
      return c.json({
        authenticated: false,
        needsSetup: !hasPassword,
        hasPasskeys,
      });
    }

    return c.json({
      authenticated: true,
      needsSetup: false,
      hasPasskeys,
    });
  } catch (error) {
    console.error('Auth status error:', error);
    return c.json({ error: 'Failed to check auth status' }, 500);
  }
});

/**
 * Change password
 */
auth.post('/change-password', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const token = extractBearerToken(c.req.header('Authorization'));

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = await db.getSessionByToken(await sha256Hex(token));
    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const { currentPassword, newPassword } = await c.req.json<{
      currentPassword: string;
      newPassword: string;
    }>();

    // Verify current password
    const storedHash = await db.getSetting('admin_password_hash');
    if (!storedHash) {
      return c.json({ error: 'No password set' }, 400);
    }

    const valid = await verifyPassword(currentPassword, storedHash);
    if (!valid) {
      return c.json({ error: 'Current password is incorrect' }, 401);
    }

    const passwordCheck = isValidPassword(newPassword);
    if (!passwordCheck.valid) {
      return c.json({ error: passwordCheck.error }, 400);
    }

    // Update password
    const newHash = await hashPassword(newPassword);
    await db.setSetting('admin_password_hash', newHash);

    return c.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return c.json({ error: 'Failed to change password' }, 500);
  }
});

export default auth;

/**
 * Auth middleware for protecting routes
 */
export async function authMiddleware(
  c: { req: { header: (name: string) => string | undefined }; env: Env; json: (data: unknown, status?: number) => Response },
  next: () => Promise<void>
): Promise<Response | void> {
  const db = new DatabaseQueries(c.env.DB);

  const token = extractBearerToken(c.req.header('Authorization'));

  if (!token) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const session = await db.getSessionByToken(await sha256Hex(token));

  if (!session) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  return next();
}
