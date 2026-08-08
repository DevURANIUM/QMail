/**
 * Input validation utilities for security
 */

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate domain format
 */
export function isValidDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') return false;
  // Domain validation regex
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain) && domain.length <= 253;
}

/**
 * Sanitize string input - remove potentially dangerous characters
 */
export function sanitizeString(input: string, maxLength = 1000): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .slice(0, maxLength)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must be less than 128 characters' };
  }
  return { valid: true };
}

/**
 * Validate API key format (basic check)
 */
export function isValidApiKey(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') return false;
  // API keys should be non-empty alphanumeric strings with some special chars
  return apiKey.length >= 10 && apiKey.length <= 256 && /^[a-zA-Z0-9_\-\.]+$/.test(apiKey);
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate file size
 */
export function isValidFileSize(size: number, maxSize: number): boolean {
  return typeof size === 'number' && size > 0 && size <= maxSize;
}

/**
 * Validate content type for attachments
 */
export function isAllowedContentType(contentType: string): boolean {
  if (!contentType || typeof contentType !== 'string') return false;

  // Block potentially dangerous content types
  const blockedTypes = [
    'application/x-executable',
    'application/x-msdownload',
    'application/x-msdos-program',
    'application/javascript',
    'text/javascript',
    'application/x-shellscript',
  ];

  const normalizedType = contentType.toLowerCase().split(';')[0].trim();
  return !blockedTypes.includes(normalizedType);
}

/**
 * Escape HTML to prevent XSS when displaying user input
 */
export function escapeHtml(unsafe: string): string {
  if (!unsafe || typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
