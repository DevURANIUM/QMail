import { Hono } from 'hono';
import { DatabaseQueries } from '../db/queries';
import { hashPassword, verifyPassword, generateToken, generateId } from '../lib/utils';

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
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

    // Create session
    const token = generateToken(48);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    await db.createSession({
      id: generateId(),
      token,
      expires_at: expiresAt,
    });

    // Clean up expired sessions
    await db.cleanExpiredSessions();

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
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token) {
      await db.deleteSession(token);
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

    if (!password || password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400);
    }

    // Hash and store password
    const hash = await hashPassword(password);
    await db.setSetting('admin_password_hash', hash);

    // Create initial session
    const token = generateToken(48);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await db.createSession({
      id: generateId(),
      token,
      expires_at: expiresAt,
    });

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
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      const hasPassword = await db.getSetting('admin_password_hash');
      return c.json({
        authenticated: false,
        needsSetup: !hasPassword,
      });
    }

    const session = await db.getSessionByToken(token);

    if (!session) {
      const hasPassword = await db.getSetting('admin_password_hash');
      return c.json({
        authenticated: false,
        needsSetup: !hasPassword,
      });
    }

    return c.json({
      authenticated: true,
      needsSetup: false,
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
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = await db.getSessionByToken(token);
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

    if (!newPassword || newPassword.length < 8) {
      return c.json({ error: 'New password must be at least 8 characters' }, 400);
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

  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return c.json({ error: 'Not authenticated' }, 401);
  }

  const session = await db.getSessionByToken(token);

  if (!session) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  return next();
}
