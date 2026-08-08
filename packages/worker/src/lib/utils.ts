/**
 * Generate a random token
 */
export function generateToken(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a UUID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Hash a password using PBKDF2 with SHA-256
 * Uses 100,000 iterations for security against brute force
 */
export async function hashPassword(password: string, salt?: string): Promise<string> {
  const encoder = new TextEncoder();
  const actualSalt = salt || generateToken(16);
  const saltBytes = encoder.encode(actualSalt);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive key using PBKDF2 with 100,000 iterations
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:100000:${actualSalt}:${hashHex}`;
}

/**
 * Verify a password against a hash
 * Supports both legacy SHA-256 and new PBKDF2 format
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Check if it's the new PBKDF2 format
  if (hash.startsWith('pbkdf2:')) {
    const parts = hash.split(':');
    if (parts.length !== 4) return false;
    const [, , salt] = parts;
    const newHash = await hashPassword(password, salt);
    return timingSafeEqual(newHash, hash);
  }

  // Legacy SHA-256 format (for backward compatibility during migration)
  const [salt] = hash.split(':');
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const legacyHash = `${salt}:${hashHex}`;
  return timingSafeEqual(legacyHash, hash);
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Create a simple JWT-like token
 */
export async function createToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresIn = 7 * 24 * 60 * 60 * 1000 // 7 days in ms
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Date.now();
  const exp = now + expiresIn;

  const fullPayload = { ...payload, iat: now, exp };

  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(fullPayload));

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureData = encoder.encode(`${encodedHeader}.${encodedPayload}`);
  const signature = await crypto.subtle.sign('HMAC', key, signatureData);
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Verify and decode a token
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureData = encoder.encode(`${encodedHeader}.${encodedPayload}`);
    const signature = Uint8Array.from(atob(encodedSignature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, signature, signatureData);

    if (!valid) return null;

    // Decode payload
    const payload = JSON.parse(atob(encodedPayload));

    // Check expiration
    if (payload.exp && payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHtml(html: string): string {
  // Basic sanitization - in production use a proper library like DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '');
}
