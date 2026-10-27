# Qmail

Qmail is the project name throughout the app, workspace packages, notifications and exports.
Repository: https://github.com/DevURANIUM/QMail.
The production Worker is `qmail`; deployment preserves its existing D1 binding.

Self-hosted email on your own domain, running entirely on Cloudflare's edge.

Receive mail through **Cloudflare Email Routing**, store it in a **D1** database
(attachments optionally in **R2**), send through **Brevo**, and manage
everything from a **Vue 3** web app served by the same Worker. One deploy, no
servers, free-tier friendly.

> 🤖 Installing with an AI agent (Claude Code, etc.)? Point it at
> [`agent-install.md`](./agent-install.md) — a step-by-step install guide written for agents.

## Features

**Mail**

- Catch-all receiving on your domain — every address at your domain lands in one inbox
- Sending via Brevo's transactional API, with delivery tracking (delivered / opened / bounced) reported back by webhook
- Conversation threading via `Message-ID` / `In-Reply-To` headers
- Drafts, reply-with-quote, forwarding (original attachments included), and scheduled send (cron-delivered)
- Archive, labels, starring, and full-text search (SQLite FTS5 over subjects, bodies, and addresses)
- Attachments up to 5MB/file in D1, or 25MB/file with an optional R2 bucket
- Contacts with autocomplete in Compose — people you write to are captured automatically
- Per-message `.eml` download and whole-mailbox **mbox export**
- Optional forwarding of received mail to a personal inbox as backup
- Telegram forwarding through your own bot to a private numeric user ID, with a test message and delivery status

**App**

- Vue 3 SPA with full light / dark / system theming
- Dashboard: daily send/receive activity chart, recent messages, system status, storage usage
- Installable PWA with payload-free push notifications on new mail
- Remote-image blocking (tracking-pixel protection) with per-email reveal

**Security**

- Passkey sign-in (FIDO2/WebAuthn) — Touch ID, Windows Hello, security keys — plus a password fallback
- PBKDF2 password hashing (100k iterations), session tokens stored as SHA-256 hashes
- Received HTML sanitized with DOMPurify before rendering
- Strict Content-Security-Policy and security headers on every response
- Shared rate limit for password and passkey login attempts
- Server-side attachment validation, safe download headers, sanitized filenames

## Architecture

```
                        Cloudflare Edge
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  Email Routing ──▶ Email Worker ──┬─▶ D1 (mail, contacts,      │
│   (catch-all)                     │      settings, sessions,   │
│                                   │      FTS index)            │
│  Cron (*/5) ──▶ scheduled send ───┤                            │
│                                   ├─▶ R2 (attachments,         │
│  HTTPS ──▶ Worker (Hono API) ─────┘      optional)             │
│              │                                                 │
│              └─▶ Vue 3 SPA (static assets)                     │
│                                                                │
└──────────────┬─────────────────────────────┬───────────────────┘
               │ send                        │ delivery webhooks
               ▼                             │
             Brevo ◀─────────────────────────┘

  Browser ◀── Web Push (VAPID, no payload) ── Email Worker
```

## Quick start

**Prerequisites**: a Cloudflare account with a domain, a [Brevo](https://www.brevo.com)
account (free tier is fine), Node.js 18+, and pnpm.

```bash
# 1. Clone and install
git clone https://github.com/DevURANIUM/QMail.git Qmail
cd Qmail
pnpm install

# 2. Authenticate wrangler
npx wrangler login

# 3. Create the database
cd packages/worker
npx wrangler d1 create qmail-db          # note the database_id in the output

# 4. Configure
cp wrangler.toml.example wrangler.toml     # then paste your database_id into it

# 5. Initialize the schema (fresh installs only — see Upgrading otherwise)
npx wrangler d1 execute qmail-db --remote --file=./src/db/schema.sql

# 6. Build and deploy
cd ../..
pnpm -r build
cd packages/worker
npx wrangler deploy
```

Your app is now live at `https://qmail.<your-subdomain>.workers.dev`.

### First-run configuration (in the app)

1. **Open the URL** and create your admin password. Add a **passkey** under
   Settings → Security for passwordless sign-in.
2. **Settings → Cloudflare** — create an API token
   ([dash.cloudflare.com → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   → Create Custom Token) with these permissions, then enter it with your
   Account ID and domain:

   | Scope | Permission | Access |
   |---|---|---|
   | Account | Email Routing Addresses | Edit |
   | Zone | Zone | Read |
   | Zone | DNS | Edit |
   | Zone | Email Routing Rules | Edit |
   | Zone | Zone Settings | Edit |

   Saving enables Email Routing on your zone and points the catch-all rule at
   the worker. If inbound mail ever stops, the **Fix Email Routing** button
   re-applies the rule.
3. **Settings → Brevo** — paste your Brevo API key
   ([app.brevo.com → SMTP & API](https://app.brevo.com/settings/keys/api)).
   Saving also auto-registers the delivery-status webhook.
4. **Verify your sending domain in Brevo**
   ([Senders & Domains](https://app.brevo.com/senders/domain/list)) — add the
   SPF / DKIM / DMARC records it gives you, or outbound mail will be rejected
   or spam-foldered.
5. **Settings → Addresses** — add at least one From address.
6. Click **Complete Setup**, then test both directions: mail an external
   message to `anything@yourdomain.com` and send one out via Compose.

## Configuration reference

`wrangler.toml` (gitignored; copy from `wrangler.toml.example`):

```toml
name = "qmail"                 # worker name — also the catch-all rule target
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "qmail-db"
database_id = "YOUR_DATABASE_ID_HERE"

[assets]
directory = "../../frontend/dist"
binding = "ASSETS"               # SPA deep links (/inbox, /login, …)
run_worker_first = true          # security headers on every response

# Optional — see "R2 attachments" below
# [[r2_buckets]]
# binding = "ATTACHMENTS"
# bucket_name = "qmail-attachments"

[triggers]
crons = ["*/5 * * * *"]          # scheduled send + session cleanup

[vars]
APP_NAME = "Qmail"
```

Secrets (Cloudflare token, Brevo key) are **never** placed in config files —
they're entered through the app UI and stored in D1.

### Custom folders

Use **Folders** in the sidebar to create, rename or delete folders. Select Inbox
or Sent as a source, select messages individually or with **Select page**, choose
a destination and use **Move selected**. Pages contain 50 messages; API batches
are capped at 100. A message belongs to one custom folder; its labels remain intact.
Moving back to Original mailbox restores the message to Inbox or Sent. Deleting
a folder preserves its messages. Drafts and scheduled messages cannot be moved.

Existing installations must apply this additive migration **before deploying**:

```bash
cd packages/worker
npx wrangler d1 execute qmail-db --remote --file=./src/db/migrations/003-folders.sql
```

Fresh installs include these tables in `schema.sql`. No remote migration is
performed automatically.

### Install Qmail as an app (PWA)

Open Qmail over HTTPS in Chrome or Edge and use **Install Qmail** in the
sidebar (also in the mobile menu). When the browser offers native installation,
the button opens its prompt. Otherwise it shows browser-menu instructions.
On iPhone/iPad, use Safari → Share → Add to Home Screen → Add.
The install button is hidden when running in standalone mode.

An offline launch shows a reconnect page. Only that public offline document is
cached: messages, API responses, attachments and login sessions are never added
to the service worker cache. Reading and sending email requires connectivity.
Localhost can be used for development; production installation requires HTTPS.
Browser support and installation prompts vary, including in embedded browsers.

PWA regression checks: `node --test frontend/pwa.test.mjs`.

### Telegram forwarding

Open **Settings → Telegram**. Create a bot with `@BotFather`, enter its token
and the recipient's positive numeric Telegram user ID, enable forwarding and
save. The recipient must first open the bot and press **Start**. Use **Send test
message** after saving to verify delivery. Leave the token blank when editing to
keep the saved token; disable forwarding and save to pause.

The token is stored server-side in D1 like the existing provider credentials and
is masked in API responses. Incoming sender, recipient, subject and plain-text
body are sent to Telegram; HTML-only messages receive a notice to open Qmail.
Attachments remain in Qmail. Long bodies are limited to 24,000 UTF-16 units and
split into messages below Telegram's size limit. Delivery is best-effort (no
queue/retry); Telegram failures never reject a stored email. Last delivery and
last error appear in Settings. Email content is shared with Telegram when enabled.
No database migration is needed for this integration.

Regression tests: `node --test packages/worker/telegram.test.mjs`.

### R2 attachments (optional)

Without R2, attachments live base64-inline in D1 (5MB per file). To raise the
cap to 25MB and keep the database lean:

1. Enable R2 once in the Cloudflare dashboard (the API errors with code `10042`
   until you do).
2. `npx wrangler r2 bucket create qmail-attachments`
3. Uncomment the `[[r2_buckets]]` block in `wrangler.toml` and redeploy.

Existing inline attachments keep working — reads fall back to D1 automatically.

## Upgrading

Fresh installs use `schema.sql` only. Existing databases apply what they're
missing, **each file exactly once**:

```bash
cd packages/worker
# pre-passkey installs first bring the base schema up to date:
npx wrangler d1 execute qmail-db --remote --file=./src/db/schema.sql
# then the structural migration (adds threading/drafts/FTS/etc. — run ONCE):
npx wrangler d1 execute qmail-db --remote --file=./src/db/migrations/002-features.sql
```

Unsure which generation you're on? `agent-install.md` has a decision table keyed off
which tables exist. After migrating: `pnpm -r build` and `npx wrangler deploy`.

Upgrading from a pre-passkey version signs everyone out once (session tokens
are now stored hashed) — just log in again.

## Development

```bash
# Terminal 1 — worker + local D1 on :8787
cd packages/worker
npx wrangler d1 execute qmail-db --local --file=./src/db/schema.sql
npx wrangler dev

# Terminal 2 — Vite dev server with HMR on :5173 (proxies /api to :8787)
cd frontend
pnpm run dev
```

Test the cron locally: start with `npx wrangler dev --test-scheduled`, then
`curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"`.

### Project structure

```
Qmail/
├── frontend/                  # Vue 3 SPA (Vite, Tailwind, Pinia)
│   ├── public/                # PWA manifest, service worker, theme bootstrap
│   └── src/
│       ├── api/               # typed API client
│       ├── components/        # EmailList, ActivityChart
│       ├── stores/            # auth, emails, theme
│       ├── utils/             # avatar helpers
│       └── views/             # Dashboard, Inbox, EmailView, Compose,
│                              # Drafts, Archive, Contacts, Settings, …
├── packages/
│   ├── worker/                # Cloudflare Worker (Hono)
│   │   └── src/
│   │       ├── api/           # routes: auth, webauthn, emails, contacts,
│   │       │                  # push, webhooks, settings, setup
│   │       ├── db/            # schema.sql, migrations/, queries.ts
│   │       ├── lib/           # mailer, attachments (R2/D1), push (VAPID),
│   │       │                  # eml builder, rate limiting, validation
│   │       ├── email-handler.ts   # inbound mail: parse, thread, store, notify
│   │       └── index.ts           # fetch + email + scheduled entrypoints
│   ├── brevo-api/             # Brevo REST wrapper (send, senders, webhooks)
│   └── cloudflare-email-api/  # Cloudflare REST wrapper (zones, routing, DNS)
└── agent-install.md           # agent-oriented install guide
```

## API reference

All endpoints are under `/api`. Everything except login/setup ceremonies and
the Brevo webhook requires `Authorization: Bearer <token>`.

### Auth

| Endpoint | Method | Description |
|---|---|---|
| `/auth/status` | GET | Auth state, `needsSetup`, `hasPasskeys` |
| `/auth/setup` | POST | Create the admin password (first run) |
| `/auth/login` | POST | Password login (rate limited: 5 / 15 min) |
| `/auth/logout` | POST | Invalidate the session |
| `/auth/change-password` | POST | Change password |
| `/auth/webauthn/register/options` · `/verify` | POST | Passkey registration ceremony |
| `/auth/webauthn/login/options` · `/verify` | POST | Passkey login ceremony (shares the login rate limit) |
| `/auth/webauthn/credentials` | GET | List passkeys |
| `/auth/webauthn/credentials/:id` | DELETE | Remove a passkey |

### Mail

| Endpoint | Method | Description |
|---|---|---|
| `/emails` | GET | List (`type=received\|sent\|draft\|scheduled`, `archived`, `label`, `unread`, `starred`, `limit`, `offset`) |
| `/emails/search` | GET | Full-text search (`?q=`) |
| `/emails/labels` | GET | All labels in use |
| `/emails/stats` | GET | Counts + storage usage |
| `/emails/activity` | GET | Daily send/receive counts (`?days=14`) |
| `/emails/export/mbox` | GET | Whole-mailbox mbox download |
| `/emails/drafts` | POST | Create or update a draft |
| `/emails/send` | POST | Send — supports `draftId`, `scheduleAt`, `replyToEmailId`, `forwardOfEmailId`, attachments |
| `/emails/:id` | GET | Single email with attachments + conversation thread |
| `/emails/:id/eml` | GET | Download as `.eml` |
| `/emails/:id/read` · `/unread` · `/star` | POST | Flags |
| `/emails/:id/archive` · `/unarchive` | POST | Archive state |
| `/emails/:id/labels` | PUT | Replace labels |
| `/emails/:id` | DELETE | Delete email + attachments (D1 and R2) |
| `/emails/:id/attachments/:attachmentId` | GET | Download an attachment |

### Contacts, push, setup

| Endpoint | Method | Description |
|---|---|---|
| `/contacts` | GET / POST | List / create (upserts by email) |
| `/contacts/:id` | PUT / DELETE | Update / delete |
| `/push/vapid-key` | GET | VAPID public key |
| `/push/subscribe` · `/unsubscribe` | POST | Manage push subscriptions |
| `/webhooks/brevo/:secret` | POST | Brevo delivery events (auto-registered; secret-guarded) |
| `/setup/status` | GET | Configuration state |
| `/setup/cloudflare` | POST | Connect Cloudflare + enable routing |
| `/setup/cloudflare/worker-routing` | POST | Re-point the catch-all at the worker |
| `/setup/brevo` | POST | Connect Brevo + register webhook |
| `/setup/addresses` | GET / POST / DELETE | Manage From addresses |
| `/setup/complete` | POST | Finish onboarding |

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Frontend assets not found" | Build before deploying: `pnpm -r build`, then redeploy |
| Inbound mail not arriving | Settings → Cloudflare → **Fix Email Routing**; verify MX records and that the zone is active; `npx wrangler tail` to watch the worker |
| Outbound rejected / in spam | Verify the sending domain (SPF/DKIM/DMARC) in Brevo |
| No delivery badges on sent mail | Re-save the Brevo API key in Settings to (re)register the webhook |
| 429 on login | Rate limit — wait 15 minutes (setup: 3/hour) |
| Signed out after upgrading | Expected once (hashed session tokens) — sign in again |
| Passkey missing on a new domain | Passkeys bind to the hostname; add one on the new host |
| Scheduled email shows "failed" | Fix the Brevo config; the message is preserved under Drafts — edit and resend |

## License

MIT — see LICENSE.

## Support

Issues and feature requests: [GitHub Issues](https://github.com/DevURANIUM/QMail/issues).
