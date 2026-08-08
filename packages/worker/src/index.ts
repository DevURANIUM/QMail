import { Hono } from 'hono';
import api from './api/routes';
import { handleEmail } from './email-handler';

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ASSETS?: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

// API routes
app.route('/api', api);

// SPA fallback - serve index.html for all non-API routes
app.get('*', async (c) => {
  // Try to serve the static file first
  if (c.env.ASSETS) {
    try {
      const url = new URL(c.req.url);
      const response = await c.env.ASSETS.fetch(url.href);
      if (response.status === 200) {
        return response;
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
      return c.env.ASSETS.fetch(url.href);
    } catch {
      return c.text('Not found', 404);
    }
  }

  // Fallback HTML for when assets aren't available
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>QMail</title>
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
          <h1>QMail</h1>
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
};
