# QMail

A modern, self-hosted email management system built on Cloudflare Workers. Receive email on your custom domain, store messages in Cloudflare D1, and send email through Brevo — all from a responsive Vue 3 dashboard.

## Features

- **Receive email:** Process incoming messages with Cloudflare Email Routing
- **Send email:** Deliver outgoing messages through the Brevo Transactional Email API
- **Bulk actions:** Select multiple messages, delete them, or mark them as read/unread
- **Mark all as read:** Clear the unread inbox in one action
- **Attachments:** Send, receive, and securely download attachments (up to 5 MB per incoming file)
- **Modern interface:** Responsive Vue 3 UI with polished light and dark themes
- **Message tools:** Search, star, filter, inspect sender details, and view HTML email
- **Optional forwarding:** Forward a backup copy to a verified destination address
- **Secure authentication:** PBKDF2 password hashing, token sessions, input validation, security headers, and rate limiting
- **Serverless:** Runs on Cloudflare Workers with D1 storage and static assets

## Architecture

```text
Incoming email
      │
      ▼
┌──────────────────────── Cloudflare ────────────────────────┐
│                                                           │
│  Email Routing ──▶ QMail Worker (Hono) ◀────▶ D1 Database │
│                         │                                 │
│                         ▼                                 │
│                   Vue 3 Dashboard                         │
│                                                           │
└─────────────────────────┬─────────────────────────────────┘
                          │
                          ▼
                     Brevo API
                    Outgoing email
```

## Prerequisites

Before you begin, make sure you have:

1. A **Cloudflare account** with an active domain
2. A **Brevo account** for outgoing email
3. **Node.js 18+**
4. **pnpm**

Enable pnpm through Corepack if it is not installed:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Confirm the installation:

```bash
node --version
pnpm --version
```

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/qmail.git
cd qmail
pnpm install
```

Replace `YOUR_USERNAME` with your GitHub username.

### 2. Create the local configuration

Windows Command Prompt (`cmd.exe`):

```bat
copy packages\worker\wrangler.toml.example packages\worker\wrangler.toml
```

Windows PowerShell:

```powershell
Copy-Item packages\worker\wrangler.toml.example packages\worker\wrangler.toml
```

macOS/Linux:

```bash
cp packages/worker/wrangler.toml.example packages/worker/wrangler.toml
```

### 3. Build and run locally

```bash
pnpm run build
pnpm db:migrate
pnpm dev
```

Open `http://localhost:8787`.

`pnpm db:migrate` creates a local Wrangler D1 database. It does not change your production database.

### Frontend hot reload

Keep `pnpm dev` running, then start a second terminal:

```bash
pnpm dev:frontend
```

Open `http://localhost:5173`. Vite proxies `/api` requests to the Worker on port `8787`.

## Production Deployment

### 1. Add your domain to Cloudflare

1. Sign in to the Cloudflare Dashboard.
2. Select **Add a domain**.
3. Add your domain and choose a plan.
4. Replace the domain's name servers at your registrar with the values Cloudflare provides.
5. Wait until the zone status becomes **Active**.

Adding the domain manually first allows you to create a least-privilege API token limited to that single zone.

### 2. Authenticate Wrangler

Wrangler authentication is used to create D1 resources and deploy the Worker. It is separate from the API token entered in QMail.

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

### 3. Create the D1 database

From the project root:

```bash
pnpm exec wrangler d1 create qmail-db
```

Copy the example configuration if you have not already done so. In Command Prompt use `copy`; in PowerShell use `Copy-Item`. Then open `packages/worker/wrangler.toml` and replace the zero UUID with the real `database_id` returned by Cloudflare:

```toml
name = "qmail"
main = "src/index.ts"
compatibility_date = "2026-08-01"

[[d1_databases]]
binding = "DB"
database_name = "qmail-db"
database_id = "YOUR_REAL_D1_DATABASE_ID"

[assets]
directory = "../../frontend/dist"

[vars]
APP_NAME = "QMail"
```

Keep the Worker name as `qmail`. The setup flow connects the Email Routing catch-all rule to a Worker with that name.

> `wrangler.toml` is gitignored. Never commit your real database ID or private configuration.

### 4. Initialize and deploy

```bash
pnpm install
pnpm run build
pnpm db:migrate:prod
pnpm run deploy
```

Wrangler returns a URL similar to:

```text
https://qmail.YOUR_SUBDOMAIN.workers.dev
```

Open the URL and create your QMail administrator password.

## Cloudflare Email Routing Setup

### Enable Email Routing and create DNS records

Open your domain in Cloudflare and navigate to **Email Routing**. In the latest dashboard this may appear under **Compute & AI → Email Service → Email Routing**.

1. Select **Enable Email Routing** or **Get started**.
2. Allow Cloudflare to add the required DNS records.
3. Confirm that Email Routing is enabled.
4. Open **Routing Rules** and verify that the service is ready.

You can inspect the required records with Wrangler:

```bash
pnpm exec wrangler email routing dns get example.com
```

Replace `example.com` with your domain.

> Do not copy MX priorities or values from a tutorial. Use the exact records generated by Cloudflare for your domain. Existing MX records may conflict with Email Routing.

## Cloudflare API Token

QMail uses a restricted Cloudflare API token to find your zone, enable Email Routing, manage routing rules, and optionally register a forwarding destination. This token does not deploy the Worker.

### Create the token

1. Open the Cloudflare Dashboard.
2. Go to **My Profile → API Tokens**.
3. Select **Create Token**.
4. Select **Create Custom Token**.
5. Name it `QMail Email Routing`.
6. Add the permissions below.

### Required permissions

| Scope | Permission | Access | Used for |
|---|---|---:|---|
| Zone | Zone | Read | Finding the zone and Zone ID |
| Zone | Zone Settings | Edit | Enabling Email Routing |
| Zone | Email Routing Rules | Edit | Creating and repairing the catch-all Worker rule |
| Account | Email Routing Addresses | Edit | Registering an optional forwarding destination |

Set the token resources to:

```text
Zone Resources:    Include → Specific zone → your domain
Account Resources: Include → your Cloudflare account
```

QMail does **not** need the following permissions for this token:

- Workers Scripts Edit
- D1 Edit
- Account Settings Edit
- DNS Edit
- Global API Key access

DNS records are created through the Cloudflare Email Routing onboarding screen, not through QMail.

If you want QMail to add a completely new zone that does not exist in Cloudflare, broader zone-creation permission is required. The safer option is to add the domain manually and restrict the token to that zone.

Copy the token immediately after it is generated. Cloudflare does not display it again.

### Find the Account ID

Open the domain overview in Cloudflare. The **Account ID** is usually displayed in the sidebar or API section of the overview page.

### Enter Cloudflare settings in QMail

Open the QMail setup screen and enter:

| Field | Value |
|---|---|
| API Token | The restricted token created above |
| Account ID | Your Cloudflare Account ID |
| Domain | The bare domain, for example `example.com` |
| Forwarding Email | Optional backup destination |

If you provide a forwarding address, Cloudflare sends a verification message to it. Open the verification link before using that destination.

QMail creates a catch-all action that sends inbound email to the Worker named `qmail`. You can verify it under **Email Routing → Routing Rules**.

## Brevo Setup

Cloudflare Email Routing handles incoming email. QMail uses Brevo for outgoing transactional email.

### 1. Add and authenticate the sending domain

1. Sign in to [Brevo](https://www.brevo.com/).
2. Open **Senders & IP → Domains** or **Senders, Domains & Dedicated IPs**.
3. Select **Add a domain**.
4. Enter the domain you will send from.
5. Copy the DNS records generated by Brevo into **Cloudflare → DNS → Records**.

Depending on your account, Brevo may show records for:

- Brevo domain verification
- DKIM
- DMARC
- Additional sender authentication records

Always use the exact names and values displayed in your Brevo account.

Important DNS rules:

- Email-related records must be **DNS only**.
- Copy TXT values exactly.
- Do not create two DMARC records for the same host.
- Do not publish two separate SPF records for the same host; merge authorized senders into one valid SPF policy.
- Preserve the exact DKIM selector and value generated by Brevo.

Return to Brevo and select **Authenticate this email domain** or **Verify**. DNS propagation can take some time.

### 2. Create a sender

Open **Senders** in Brevo and add an address on the authenticated domain, for example:

```text
QMail <hello@example.com>
```

Complete any sender verification requested by Brevo.

### 3. Create a Brevo API key

1. Click your account name in Brevo.
2. Open **SMTP & API**.
3. Select the **API Keys** tab.
4. Select **Generate a new API key**.
5. Name it `QMail Production`.
6. Copy and securely store the key immediately.

Brevo displays the full API key only once. If it is lost, delete it and create a replacement.

### 4. Connect Brevo to QMail

Enter the API key in the Brevo step of the QMail setup flow. QMail validates it against the Brevo account endpoint.

After setup, open **Settings → Addresses** and add the sender addresses that are authorized in Brevo.

## Recommended Setup Order

1. Add and activate the domain in Cloudflare.
2. Authenticate Wrangler.
3. Create D1 and place its ID in `wrangler.toml`.
4. Apply the remote database schema.
5. Build and deploy the Worker as `qmail`.
6. Enable Cloudflare Email Routing and add its DNS records.
7. Create the restricted Cloudflare API token.
8. Authenticate the domain and sender in Brevo.
9. Create the Brevo API key.
10. Open QMail and complete the setup wizard.
11. Test one real incoming and one real outgoing message.

## Usage

### Receiving email

With the catch-all rule enabled, email sent to addresses on your domain is:

1. Received by Cloudflare Email Routing
2. Delivered to the QMail Worker
3. Parsed with `postal-mime`
4. Stored in D1
5. Optionally forwarded to a verified backup address

### Sending email

1. Select **Compose**.
2. Choose an authorized From address.
3. Enter the recipient, subject, and message.
4. Add attachments if needed.
5. Select **Send**.

### Managing messages

- Search the inbox or sent messages
- Filter all, unread, or starred email
- Select one or multiple messages
- Mark selected messages read or unread
- Mark the full inbox as read
- Delete selected messages
- Star important messages
- Switch between light and dark themes

## Development

### Commands

```bash
# Worker development server
pnpm dev

# Vue development server
pnpm dev:frontend

# Build the internal API libraries and frontend
pnpm build

# Build only the frontend (not enough by itself for deployment)
pnpm build:frontend

# Initialize local D1
pnpm db:migrate

# Initialize production D1
pnpm db:migrate:prod

# Build everything and deploy to Cloudflare
pnpm run deploy
```

### Project structure

```text
qmail/
├── frontend/
│   ├── public/
│   └── src/
│       ├── api/             API client and shared types
│       ├── router/          Vue Router
│       ├── stores/          Pinia stores
│       └── views/           Application pages
│
├── packages/
│   ├── worker/
│   │   └── src/
│   │       ├── api/         Hono API routes
│   │       ├── db/          D1 schema and queries
│   │       ├── lib/         Validation, hashing and rate limiting
│   │       └── email-handler.ts
│   ├── cloudflare-email-api/
│   └── brevo-api/
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Security

### Implemented protections

- PBKDF2-SHA256 password hashing with 100,000 iterations and a random salt
- Authentication tokens stored as hashes in D1
- Login rate limit: 5 attempts per 15 minutes per client IP
- Initial password setup rate limit: 3 attempts per hour per client IP
- Protected email, settings, and setup endpoints
- Security headers including frame denial and MIME sniffing protection
- Email, domain, password, UUID, file-size, and content-type validation
- Sanitized attachment filenames and authenticated attachment downloads
- Escaped user text when composing HTML email

### Production recommendations

1. Use a strong, unique administrator password.
2. Enable two-factor authentication on Cloudflare, Brevo, and GitHub.
3. Use a Cloudflare API token restricted to the required account and zone.
4. Never commit `wrangler.toml`, `.dev.vars`, `.env`, `.wrangler`, API keys, or D1 exports.
5. Rotate Cloudflare and Brevo credentials immediately if they are exposed.
6. Regularly update dependencies and export D1 backups.
7. Review `git status` before every push.

## Troubleshooting

### Email is not received

1. Confirm that the domain is Active in Cloudflare.
2. Check the MX/TXT records shown by Email Routing.
3. Confirm that Email Routing is enabled.
4. Confirm that the catch-all rule targets the `qmail` Worker.
5. Confirm that the remote D1 schema has been applied.
6. Inspect live Worker logs:

```bash
pnpm --filter @qmail/worker tail
```

### Cloudflare setup fails

- Make sure the token includes Zone Read, Zone Settings Edit, Email Routing Rules Edit, and Email Routing Addresses Edit.
- Confirm that the token includes the correct account and zone resources.
- Confirm that the Account ID belongs to the account containing the domain.
- Wait for the domain zone to become Active.

### Email cannot be sent

- Verify the Brevo API key.
- Confirm that the domain is authenticated in Brevo.
- Confirm that the From address is an authorized sender.
- Check Brevo transactional logs, account limits, and available sending credit.
- Recheck DKIM, DMARC, and SPF for conflicts.

### `no such table` or D1 errors

Local database:

```bash
pnpm db:migrate
```

Production database:

```bash
pnpm db:migrate:prod
```

### Login is rate limited

Wait 15 minutes after five failed login attempts. Setup is limited to three attempts per hour.

## API Reference

All email, settings, and setup modification endpoints require an authenticated Bearer token.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/status` | Check setup and authentication status |
| `POST` | `/api/auth/setup` | Create the initial administrator password |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Sign out and revoke the current session |
| `POST` | `/api/auth/change-password` | Change the administrator password |

### Email

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/emails` | List and paginate messages |
| `GET` | `/api/emails/stats` | Return inbox statistics |
| `POST` | `/api/emails/bulk` | Read, unread, delete, or mark all read |
| `POST` | `/api/emails/send` | Send a message through Brevo |
| `GET` | `/api/emails/:id` | Return a message and attachment metadata |
| `POST` | `/api/emails/:id/read` | Mark a message as read |
| `POST` | `/api/emails/:id/unread` | Mark a message as unread |
| `POST` | `/api/emails/:id/star` | Toggle the starred state |
| `DELETE` | `/api/emails/:id` | Delete a message |
| `GET` | `/api/emails/:emailId/attachments/:attachmentId` | Download an attachment |

### Setup

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/setup/status` | Return setup status |
| `POST` | `/api/setup/cloudflare` | Configure Cloudflare Email Routing |
| `POST` | `/api/setup/cloudflare/worker-routing` | Repair the Worker catch-all rule |
| `POST` | `/api/setup/brevo` | Validate and store the Brevo API key |
| `GET` | `/api/setup/brevo/senders` | List Brevo senders |
| `GET` | `/api/setup/addresses` | List managed From addresses |
| `POST` | `/api/setup/addresses` | Add a managed From address |
| `DELETE` | `/api/setup/addresses/:id` | Delete a managed From address |
| `POST` | `/api/setup/complete` | Complete the setup wizard |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Return Worker health and current timestamp |

## Updating QMail

After pulling changes:

```bash
pnpm install
pnpm run deploy
```

If the database schema changed, apply the production migration before deploying.

## Official Documentation

- [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/)
- [Cloudflare Email Routing API](https://developers.cloudflare.com/api/resources/email_routing/)
- [Cloudflare API Tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Brevo API key authentication](https://developers.brevo.com/docs/api-key-authentication)
- [Brevo senders and domains](https://developers.brevo.com/docs/getting-started-with-senders-and-domains)
- [Brevo domain authentication](https://developers.brevo.com/docs/domain-authentication-and-verification)
