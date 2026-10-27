import { DatabaseQueries } from '../db/queries';
import { generateId, uint8ToBase64Url } from './utils';

/**
 * Web Push with VAPID (RFC 8292), implemented on WebCrypto.
 * Pushes are sent WITHOUT a payload — the service worker shows a generic
 * "new mail" notification — so no message content ever transits the
 * browser vendor's push service, and no payload encryption is needed.
 */

const VAPID_PRIVATE_KEY_SETTING = 'vapid_private_jwk';
const VAPID_PUBLIC_KEY_SETTING = 'vapid_public_key';

function base64UrlEncode(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return uint8ToBase64Url(bytes);
}

/**
 * Get (or lazily create) the server's VAPID key pair.
 * Public key is stored as base64url of the raw uncompressed P-256 point.
 */
export async function getVapidPublicKey(db: DatabaseQueries): Promise<string> {
  const existing = await db.getSetting(VAPID_PUBLIC_KEY_SETTING);
  if (existing) return existing;

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  ) as CryptoKeyPair;

  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey) as ArrayBuffer);
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  const publicKey = uint8ToBase64Url(publicRaw);
  await db.setSetting(VAPID_PRIVATE_KEY_SETTING, JSON.stringify(privateJwk));
  await db.setSetting(VAPID_PUBLIC_KEY_SETTING, publicKey);

  return publicKey;
}

async function getVapidPrivateKey(db: DatabaseQueries): Promise<CryptoKey | null> {
  const jwk = await db.getSetting(VAPID_PRIVATE_KEY_SETTING);
  if (!jwk) return null;
  return crypto.subtle.importKey(
    'jwk',
    JSON.parse(jwk),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

/**
 * Build the VAPID JWT for a push service origin.
 */
async function buildVapidJwt(db: DatabaseQueries, audience: string, subject: string): Promise<string | null> {
  const privateKey = await getVapidPrivateKey(db);
  if (!privateKey) return null;

  const header = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = base64UrlEncode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  }));

  const signingInput = new TextEncoder().encode(`${header}.${claims}`);
  // WebCrypto ECDSA returns raw r||s — exactly the JWS ES256 format
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, signingInput)
  );

  return `${header}.${claims}.${uint8ToBase64Url(signature)}`;
}

/**
 * Notify every registered subscription. Dead subscriptions (404/410)
 * are pruned. Failures are logged, never thrown.
 */
export async function notifyAllSubscriptions(db: DatabaseQueries): Promise<void> {
  try {
    const subscriptions = await db.listPushSubscriptions();
    if (subscriptions.length === 0) return;

    const publicKey = await db.getSetting(VAPID_PUBLIC_KEY_SETTING);
    if (!publicKey) return;

    const domain = await db.getSetting('domain');
    const subject = domain ? `mailto:admin@${domain}` : 'mailto:admin@example.com';

    await Promise.all(subscriptions.map(async (sub) => {
      try {
        const audience = new URL(sub.endpoint).origin;
        const jwt = await buildVapidJwt(db, audience, subject);
        if (!jwt) return;

        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'TTL': '86400',
            'Urgency': 'normal',
            'Authorization': `vapid t=${jwt}, k=${publicKey}`,
          },
        });

        if (response.status === 404 || response.status === 410) {
          await db.deletePushSubscription(sub.endpoint);
        }
      } catch (error) {
        console.error('Push delivery error:', error);
      }
    }));
  } catch (error) {
    console.error('Push notify error:', error);
  }
}

export async function savePushSubscription(
  db: DatabaseQueries,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  await db.createPushSubscription({
    id: generateId(),
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  });
}
