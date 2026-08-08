import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import auth, { authMiddleware } from './auth';
import emails from './emails';
import settings from './settings';
import setup from './setup';
import { RateLimiter, getClientIP } from '../lib/rate-limit';

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
}

const api = new Hono<{ Bindings: Env }>();

// Security headers
api.use('/*', secureHeaders({
  xFrameOptions: 'DENY',
  xContentTypeOptions: 'nosniff',
  referrerPolicy: 'strict-origin-when-cross-origin',
  crossOriginEmbedderPolicy: false, // Disable for compatibility
}));

// CORS middleware - restrict to same origin in production
api.use('/*', cors({
  origin: (origin) => {
    // Allow same-origin requests (when origin header is not set)
    if (!origin) return '*';
    // In production, you should set this to your actual domain
    // For now, allow the workers.dev domain and localhost
    const allowedOrigins = [
      /^https:\/\/.*\.workers\.dev$/,
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ];
    return allowedOrigins.some(pattern => pattern.test(origin)) ? origin : null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours
}));

// Rate limiting for auth endpoints (5 attempts per 15 minutes)
api.use('/auth/login', async (c, next) => {
  const rateLimiter = new RateLimiter(c.env.DB, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyPrefix: 'login',
  });

  const ip = getClientIP(c.req.raw);
  const result = await rateLimiter.check(ip);

  if (!result.allowed) {
    return c.json(
      {
        error: 'Too many login attempts. Please try again later.',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      },
      429
    );
  }

  // Add rate limit headers
  c.header('X-RateLimit-Remaining', String(result.remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)));

  return next();
});

// Rate limiting for setup endpoint (3 attempts per hour)
api.use('/auth/setup', async (c, next) => {
  const rateLimiter = new RateLimiter(c.env.DB, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    keyPrefix: 'setup',
  });

  const ip = getClientIP(c.req.raw);
  const result = await rateLimiter.check(ip);

  if (!result.allowed) {
    return c.json(
      {
        error: 'Too many setup attempts. Please try again later.',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
      },
      429
    );
  }

  return next();
});

// Public routes
api.route('/auth', auth);

// Health check
api.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes - require authentication
api.use('/emails/*', async (c, next) => {
  return authMiddleware(c, next);
});

api.use('/settings/*', async (c, next) => {
  return authMiddleware(c, next);
});

api.use('/setup/*', async (c, next) => {
  // Allow setup/status to be accessed without auth for initial setup check
  if (c.req.path === '/api/setup/status' && c.req.method === 'GET') {
    return next();
  }
  return authMiddleware(c, next);
});

api.route('/emails', emails);
api.route('/settings', settings);
api.route('/setup', setup);

// 404 handler
api.all('*', (c) => {
  return c.json({ error: 'Not found' }, 404);
});

export default api;
