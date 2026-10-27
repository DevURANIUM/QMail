import { Hono } from 'hono';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { DatabaseQueries } from '../db/queries';
import { authMiddleware, createAdminSession } from './auth';
import {
  generateId,
  uint8ToBase64Url,
  base64UrlToUint8,
  sqliteDateTime,
} from '../lib/utils';
import { sanitizeString } from '../lib/validation';

export interface Env {
  DB: D1Database;
  APP_NAME?: string;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const webauthn = new Hono<{ Bindings: Env }>();

// Managing passkeys requires an authenticated session.
// Login ceremony endpoints stay public (they ARE the login).
webauthn.use('/register/*', authMiddleware);
webauthn.use('/credentials', authMiddleware);
webauthn.use('/credentials/*', authMiddleware);

/**
 * Relying-party identity, derived from the request host.
 * Passkeys bind to the hostname the app is served from.
 */
function getRpContext(c: { req: { url: string; header: (name: string) => string | undefined } }) {
  const url = new URL(c.req.url);
  const rpID = url.hostname;
  const expectedOrigin: string[] = [url.origin];

  // In dev the SPA runs on a different port (Vite) than the worker;
  // accept the browser origin only when it points at the same host or localhost.
  const originHeader = c.req.header('Origin');
  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      const isSameHost = originUrl.hostname === rpID;
      const isLocalDev = ['localhost', '127.0.0.1'].includes(originUrl.hostname);
      if ((isSameHost || isLocalDev) && !expectedOrigin.includes(originUrl.origin)) {
        expectedOrigin.push(originUrl.origin);
      }
    } catch {
      // Ignore malformed Origin headers
    }
  }

  return { rpID, expectedOrigin };
}

/**
 * Stable random user handle for the single admin user.
 */
async function getUserId(db: DatabaseQueries): Promise<Uint8Array<ArrayBuffer>> {
  let stored = await db.getSetting('webauthn_user_id');
  if (!stored) {
    stored = uint8ToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    await db.setSetting('webauthn_user_id', stored);
  }
  return base64UrlToUint8(stored);
}

async function storeChallenge(
  db: DatabaseQueries,
  type: 'registration' | 'authentication',
  challenge: string
): Promise<void> {
  await db.createChallenge({
    id: generateId(),
    type,
    challenge,
    expires_at: sqliteDateTime(new Date(Date.now() + CHALLENGE_TTL_MS)),
  });
}

function parseTransports(value: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * List registered passkeys (never exposes public keys)
 */
webauthn.get('/credentials', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const credentials = await db.listCredentials();
    return c.json({
      credentials: credentials.map(cred => ({
        id: cred.id,
        deviceName: cred.device_name,
        createdAt: cred.created_at,
        lastUsedAt: cred.last_used_at,
      })),
    });
  } catch (error) {
    console.error('List credentials error:', error);
    return c.json({ error: 'Failed to list passkeys' }, 500);
  }
});

/**
 * Remove a passkey
 */
webauthn.delete('/credentials/:id', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    await db.deleteCredential(c.req.param('id'));
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete credential error:', error);
    return c.json({ error: 'Failed to delete passkey' }, 500);
  }
});

/**
 * Begin passkey registration (authenticated)
 */
webauthn.post('/register/options', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const { rpID } = getRpContext(c);
    const domain = await db.getSetting('domain');
    const existing = await db.listCredentials();

    const options = await generateRegistrationOptions({
      rpName: c.env.APP_NAME || 'Qmail',
      rpID,
      userID: await getUserId(db),
      userName: domain ? `admin@${domain}` : 'admin',
      userDisplayName: `${c.env.APP_NAME || 'Qmail'} Admin`,
      attestationType: 'none',
      excludeCredentials: existing.map(cred => ({
        id: cred.credential_id,
        transports: parseTransports(cred.transports),
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await storeChallenge(db, 'registration', options.challenge);

    return c.json(options);
  } catch (error) {
    console.error('Registration options error:', error);
    return c.json({ error: 'Failed to start passkey registration' }, 500);
  }
});

/**
 * Complete passkey registration (authenticated)
 */
webauthn.post('/register/verify', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const { response, deviceName } = await c.req.json<{
      response: RegistrationResponseJSON;
      deviceName?: string;
    }>();

    if (!response) {
      return c.json({ error: 'Missing registration response' }, 400);
    }

    const { rpID, expectedOrigin } = getRpContext(c);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: (challenge) => db.consumeChallenge('registration', challenge),
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return c.json({ error: 'Passkey verification failed' }, 400);
    }

    const { credential } = verification.registrationInfo;

    await db.createCredential({
      id: generateId(),
      credential_id: credential.id,
      public_key: uint8ToBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      device_name: deviceName ? sanitizeString(deviceName, 64) : null,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('Registration verify error:', error);
    return c.json({ error: 'Failed to register passkey' }, 400);
  }
});

/**
 * Begin passkey login (public)
 */
webauthn.post('/login/options', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const credentials = await db.listCredentials();

    if (credentials.length === 0) {
      return c.json({ error: 'No passkeys registered' }, 400);
    }

    const { rpID } = getRpContext(c);

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map(cred => ({
        id: cred.credential_id,
        transports: parseTransports(cred.transports),
      })),
      userVerification: 'preferred',
    });

    await storeChallenge(db, 'authentication', options.challenge);

    return c.json(options);
  } catch (error) {
    console.error('Authentication options error:', error);
    return c.json({ error: 'Failed to start passkey login' }, 500);
  }
});

/**
 * Complete passkey login (public, rate limited alongside password login)
 */
webauthn.post('/login/verify', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const { response } = await c.req.json<{ response: AuthenticationResponseJSON }>();

    if (!response?.id) {
      return c.json({ error: 'Missing authentication response' }, 400);
    }

    const credential = await db.getCredentialByCredentialId(response.id);

    if (!credential) {
      return c.json({ error: 'Unknown passkey' }, 401);
    }

    const { rpID, expectedOrigin } = getRpContext(c);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (challenge) => db.consumeChallenge('authentication', challenge),
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: credential.credential_id,
        publicKey: base64UrlToUint8(credential.public_key),
        counter: credential.counter,
        transports: parseTransports(credential.transports),
      },
    });

    if (!verification.verified) {
      return c.json({ error: 'Passkey verification failed' }, 401);
    }

    await db.updateCredentialCounter(
      credential.credential_id,
      verification.authenticationInfo.newCounter
    );

    const { token, expiresAt } = await createAdminSession(db);

    return c.json({
      success: true,
      token,
      expiresAt,
    });
  } catch (error) {
    console.error('Authentication verify error:', error);
    return c.json({ error: 'Passkey login failed' }, 401);
  }
});

export default webauthn;
