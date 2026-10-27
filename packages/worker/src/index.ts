import { Hono } from 'hono';
import api from './api/routes';
import { handleEmail } from './email-handler';
import { DatabaseQueries } from './db/queries';
import { deliverStoredEmail, recordRecipientsAsContacts } from './lib/mailer';

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ASSETS?: Fetcher;
  ATTACHMENTS?: R2Bucket;
}

/**
 * Cron: deliver due scheduled emails and clean up expired rows.
 */
async function runScheduledTasks(env: Env): Promise<void> {
  const db = new DatabaseQueries(env.DB);

  // Send due scheduled emails
  const due = await db.listDueScheduledEmails();
  for (const email of due) {
    try {
      const messageId = await deliverStoredEmail(db, env.ATTACHMENTS, email);
      await db.markEmailSent(email.id, messageId || null);
      await recordRecipientsAsContacts(db, email);
      console.log(`Scheduled email sent: ${email.id}`);
    } catch (error) {
      console.error(`Scheduled email failed: ${email.id}`, error);
      await db.markScheduledFailed(email.id);
    }
  }

  // Housekeeping
  await db.cleanExpiredSessions();
}

const app = new Hono<{ Bindings: Env }>();

// API routes
app.route('/api', api);

/**
 * Security headers for the SPA and static assets.
 * img-src allows https so remote images in received emails can render.
 */
const SPA_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set('Content-Security-Policy', SPA_CSP);
  secured.headers.set('X-Frame-Options', 'DENY');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  secured.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return secured;
}

// SPA fallback - serve index.html for all non-API routes
app.get('*', async (c) => {
  // Try to serve the static file first
  if (c.env.ASSETS) {
    try {
      const url = new URL(c.req.url);
      const response = await c.env.ASSETS.fetch(url.href);
      if (response.status === 200) {
        const secured = withSecurityHeaders(response);
        if (['/sw.js', '/manifest.webmanifest', '/theme.js'].includes(url.pathname) ||
            response.headers.get('Content-Type')?.includes('text/html')) {
          secured.headers.set('Cache-Control', 'no-cache');
        }
        return secured;
      }
    } catch {
      // Fall through to index.html
    }
  }

  // Return index.html for SPA routing
  if (c.env.ASSETS) {
    try {
      const url = new URL(c.req.url);
      url.pathname = '/index.html';
      return withSecurityHeaders(await c.env.ASSETS.fetch(url.href));
    } catch {
      return c.text('Not found', 404);
    }
  }

  // Fallback HTML for when assets aren't available
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Qmail</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          h1 { color: #333; margin-bottom: 0.5rem; }
          p { color: #666; }
          a { color: #3b82f6; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Qmail</h1>
          <p>Frontend assets not found.</p>
          <p>Build the frontend and deploy to see the full application.</p>
          <p><a href="/api/health">Check API Health</a></p>
        </div>
      </body>
    </html>
  `);
});

// Export the worker
export default {
  fetch: app.fetch,

  // Email handler for receiving emails
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env);
  },

  // Cron: scheduled send + cleanup
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledTasks(env));
  },
};
