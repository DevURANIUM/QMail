/**
 * Simple in-memory rate limiter for Cloudflare Workers
 * Uses a sliding window approach with D1 for persistence
 */

export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix: string;     // Prefix for rate limit keys
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Rate limiter using D1 database for persistence
 */
export class RateLimiter {
  private config: RateLimitConfig;
  private db: D1Database;

  constructor(db: D1Database, config: Partial<RateLimitConfig> = {}) {
    this.db = db;
    this.config = {
      windowMs: config.windowMs || 15 * 60 * 1000, // 15 minutes
      maxRequests: config.maxRequests || 5,         // 5 attempts
      keyPrefix: config.keyPrefix || 'ratelimit',
    };
  }

  /**
   * Check if request should be allowed
   */
  async check(identifier: string): Promise<RateLimitResult> {
    const key = `${this.config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      // Clean up old entries and count recent requests
      await this.db
        .prepare('DELETE FROM rate_limits WHERE key = ? AND timestamp < ?')
        .bind(key, windowStart)
        .run();

      const countResult = await this.db
        .prepare('SELECT COUNT(*) as count FROM rate_limits WHERE key = ? AND timestamp >= ?')
        .bind(key, windowStart)
        .first<{ count: number }>();

      const currentCount = countResult?.count || 0;
      const remaining = Math.max(0, this.config.maxRequests - currentCount);
      const allowed = currentCount < this.config.maxRequests;

      if (allowed) {
        // Record this request
        await this.db
          .prepare('INSERT INTO rate_limits (key, timestamp) VALUES (?, ?)')
          .bind(key, now)
          .run();
      }

      // Get oldest entry to calculate reset time
      const oldestResult = await this.db
        .prepare('SELECT MIN(timestamp) as oldest FROM rate_limits WHERE key = ? AND timestamp >= ?')
        .bind(key, windowStart)
        .first<{ oldest: number }>();

      const resetTime = oldestResult?.oldest
        ? oldestResult.oldest + this.config.windowMs
        : now + this.config.windowMs;

      return {
        allowed,
        remaining: allowed ? remaining - 1 : 0,
        resetTime,
      };
    } catch (error) {
      // If rate limiting fails, allow the request but log the error
      console.error('Rate limiting error:', error);
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: now + this.config.windowMs,
      };
    }
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    const key = `${this.config.keyPrefix}:${identifier}`;
    await this.db
      .prepare('DELETE FROM rate_limits WHERE key = ?')
      .bind(key)
      .run();
  }
}

/**
 * Get client IP from request headers
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
