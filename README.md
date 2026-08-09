# QMail

QMail is a modern, self-hosted email dashboard built on Cloudflare Workers. It receives email through Cloudflare Email Routing, stores messages in Cloudflare D1, and sends transactional email through Brevo.

## Features

- Receive email on a custom domain
- Send email through the Brevo Transactional Email API
- Responsive Vue 3 interface with light and dark themes
- Inbox and sent-message search
- Unread and starred filters
- Multi-select and bulk delete
- Mark selected or all inbox messages as read
- Star inbox and sent messages
- Send and receive attachments
- Optional forwarding to a verified backup address
- PBKDF2 password hashing, token sessions, validation, security headers, and rate limiting
- Serverless deployment on Cloudflare Workers and D1

## Architecture

```text
Incoming mail
     |
     v
Cloudflare Email Routing
     |
     v
QMail Worker (Hono) <----> Cloudflare D1
     |
     +----> Vue 3 dashboard

Vue 3 dashboard ----> QMail Worker ----> Brevo API ----> Outgoing mail
```

## Requirements

Before starting, you need:

1. A Cloudflare account
2. A domain added to and active on Cloudflare
3. A Brevo account
4. Node.js 18 or newer
5. pnpm

Enable pnpm with Corepack if necessary:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Check your installed versions:

```bash
node --version
pnpm --version
```

## Quick Start: Local Development

### 1. Clone the repository

```bash
git clone https://github.com/DevURANIUM/qmail.git
cd qmail
pnpm install
```

### 2. Create the local Wrangler configuration

PowerShell:

```powershell
Copy-Item packages\worker\wrangler.toml.example packages\worker\wrangler.toml
```

Windows Command Prompt:

```bat
copy packages\worker\wrangler.toml.example packages\worker\wrangler.toml
```

macOS or Linux:

```bash
cp packages/worker/wrangler.toml.example packages/worker/wrangler.toml
```

The example contains a zero UUID that is safe for local development.

### 3. Initialize the local database

```bash
pnpm db:migrate
```

### 4. Start QMail

```bash
pnpm dev
```

Open:

```text
http://localhost:8787
```

For Vue hot reload, keep the Worker running and use another terminal:

```bash
pnpm dev:frontend
```

Then open `http://localhost:5173`. Vite proxies API requests to the Worker on port `8787`.

## Production Deployment

### 1. Log in to Cloudflare with Wrangler

From the project root:

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

Wrangler login is used only for creating Cloudflare resources and deploying the Worker. It is separate from the restricted API token entered later in the QMail setup screen.

### 2. Create a D1 database

```bash
pnpm exec wrangler d1 create qmail-db
```

The command returns a D1 `database_id`. Do not publish this ID with your repository.

### 3. Create the production configuration

Copy the example configuration:

```powershell
Copy-Item packages\worker\wrangler.toml.example packages\worker\wrangler.toml
```

Open `packages/worker/wrangler.toml` and replace the zero UUID with the ID returned by the previous command:

```toml
name = "qmail"
main = "src/index.ts"
compatibility_date = "2026-08-01"

[[d1_databases]]
binding = "DB"
database_name = "qmail-db"
database_id = "YOUR_D1_DATABASE_ID"

[assets]
directory = "../../frontend/dist"

[vars]
APP_NAME = "QMail"
```

`wrangler.toml` is ignored by Git. Keep the Worker name as `qmail`, because the Email Routing setup connects its catch-all rule to a Worker with that name.

### 4. Create the production database tables

```bash
pnpm db:migrate:prod
```

This command writes the QMail schema to the remote `qmail-db` database.

### 5. Build and deploy

```bash
pnpm run deploy
```

The deploy script builds the internal packages and Vue frontend before deploying the Worker. Wrangler prints a URL similar to:

```text
https://qmail.YOUR_SUBDOMAIN.workers.dev
```

Open the URL and create a strong administrator password.

## Cloudflare Email Routing

### Enable Email Routing

1. Open your domain in the Cloudflare Dashboard.
2. Open **Email Routing**.
3. Select **Enable Email Routing** or **Get started**.
4. Allow Cloudflare to create the required DNS records.
5. Wait until Email Routing reports that the domain is ready.

Do not copy MX values from a random tutorial. Use the exact DNS records Cloudflare generates for your domain. Existing MX records can conflict with Email Routing.

### Create the QMail API token

QMail needs a restricted Cloudflare API token to find your zone and manage Email Routing. This token is not the same as Wrangler login.

1. Open **Cloudflare Dashboard > My Profile > API Tokens**.
2. Select **Create Token**.
3. Select **Create Custom Token**.
4. Name it `QMail Email Routing`.
5. Add these permissions:

| Scope | Permission | Access | Purpose |
|---|---|---:|---|
| Zone | Zone | Read | Find the domain and Zone ID |
| Zone | Zone Settings | Edit | Enable Email Routing |
| Zone | Email Routing Rules | Edit | Create or repair the Worker catch-all rule |
| Account | Email Routing Addresses | Edit | Register an optional forwarding address |

Restrict the resources to your own account and domain:

```text
Zone Resources:    Include -> Specific zone -> your domain
Account Resources: Include -> your Cloudflare account
```

QMail does not require your Global API Key. Avoid giving the token unrelated permissions such as Workers Scripts Edit or D1 Edit.

Copy the token when Cloudflare displays it. It will not be shown again.

### Find your Account ID

Open the overview page for your domain in Cloudflare. The Account ID is shown in the account or API section of the dashboard.

### Complete Cloudflare setup in QMail

Enter these values in the QMail setup screen:

| Field | Description |
|---|---|
| API Token | Restricted token created above |
| Account ID | Cloudflare Account ID |
| Domain | Bare domain such as `example.com` |
| Forwarding Email | Optional backup destination |

If you enter a forwarding destination, Cloudflare sends a verification email to that address. Approve it before relying on forwarding.

QMail creates a catch-all routing rule that targets the `qmail` Worker. You can verify the rule in **Cloudflare > Email Routing > Routing Rules**.

## Brevo Setup

Cloudflare handles incoming mail. Brevo handles outgoing mail.

### 1. Authenticate your sending domain

1. Sign in to [Brevo](https://www.brevo.com/).
2. Open **Senders & IP > Domains** or **Senders, Domains & Dedicated IPs**.
3. Add your domain.
4. Copy every DNS record generated by Brevo into Cloudflare DNS.
5. Return to Brevo and select **Authenticate** or **Verify**.

Brevo may provide domain verification, DKIM, DMARC, and sender-authentication records. Always use the exact names and values shown in your Brevo account.

Important DNS rules:

- Keep email authentication records set to **DNS only**.
- Copy TXT and DKIM values exactly.
- Do not create multiple DMARC records for the same host.
- Do not publish multiple separate SPF records for the same host.

### 2. Create a sender

Open **Senders** in Brevo and add an address on your authenticated domain, for example:

```text
QMail <hello@example.com>
```

Complete any verification Brevo requests.

### 3. Create a Brevo API key

1. Open your Brevo account menu.
2. Go to **SMTP & API**.
3. Open the **API Keys** tab.
4. Select **Generate a new API key**.
5. Name it `QMail Production`.
6. Copy the key immediately and store it securely.

Brevo shows the complete key only once. If it is lost or exposed, delete it and generate a replacement.

### 4. Connect Brevo to QMail

Enter the API key during the Brevo step of the QMail setup wizard. After setup, open **Settings > Addresses** and add sender addresses that Brevo allows.

## Recommended Setup Order

1. Add and activate your domain in Cloudflare.
2. Install dependencies with `pnpm install`.
3. Authenticate Wrangler.
4. Create D1 and place its ID in the local `wrangler.toml`.
5. Apply the production database schema.
6. Build and deploy QMail.
7. Enable Cloudflare Email Routing.
8. Create the restricted Cloudflare API token.
9. Authenticate the domain and sender in Brevo.
10. Create the Brevo API key.
11. Complete the QMail setup wizard.
12. Test one incoming and one outgoing message.

## Available Commands

Run all commands from the project root.

```bash
# Install dependencies
pnpm install

# Build internal API libraries and the Vue frontend
pnpm run build

# Run the Worker locally
pnpm dev

# Run the Vue development server with hot reload
pnpm dev:frontend

# Initialize local D1
pnpm db:migrate

# Initialize production D1
pnpm db:migrate:prod

# Build and deploy to Cloudflare
pnpm run deploy

# View production Worker logs
pnpm --filter @qmail/worker tail
```

## Updating QMail

After pulling a new version:

```bash
pnpm install
pnpm run build
pnpm run deploy
```

If the database schema changed, run this before deployment:

```bash
pnpm db:migrate:prod
```

## Usage

### Receive email

With the catch-all rule enabled, incoming mail is received by Cloudflare, delivered to the Worker, parsed, and stored in D1. A copy can optionally be forwarded to a verified address.

### Send email

1. Select **Compose**.
2. Choose an authorized From address.
3. Enter the recipient, subject, and message.
4. Add attachments if needed.
5. Select **Send**.

The UI allows attachments up to 5 MB per file and 10 MB in total for an outgoing message.

### Manage messages

- Search inbox and sent messages
- Filter unread or starred messages
- Select individual or multiple messages
- Mark inbox messages read or unread
- Mark all inbox messages as read
- Star or unstar messages
- Delete selected messages
- Switch between light and dark themes

## Project Structure

```text
qmail/
|-- frontend/
|   |-- public/
|   `-- src/
|       |-- api/
|       |-- router/
|       |-- stores/
|       `-- views/
|-- packages/
|   |-- worker/
|   |   `-- src/
|   |       |-- api/
|   |       |-- db/
|   |       |-- lib/
|   |       `-- email-handler.ts
|   |-- cloudflare-email-api/
|   `-- brevo-api/
|-- package.json
|-- pnpm-workspace.yaml
`-- README.md
```

## Security

- Never commit `wrangler.toml`, `.dev.vars`, `.env`, `.wrangler`, API keys, database exports, or credentials.
- Use a strong, unique QMail administrator password.
- Enable two-factor authentication on Cloudflare, Brevo, and GitHub.
- Restrict the Cloudflare token to the required account and zone.
- Rotate Cloudflare and Brevo credentials immediately if they are exposed.
- Review `git status` before every push.
- Regularly update dependencies and export D1 backups.

QMail stores setup credentials in its D1 database. Protect access to the Worker and Cloudflare account, and do not publish D1 exports.

## Troubleshooting

### `wrangler` is not found

Run Wrangler through the project dependency:

```bash
pnpm exec wrangler --version
```

If dependencies are missing:

```bash
pnpm install
```

### Email is not received

1. Confirm the domain is active in Cloudflare.
2. Confirm Email Routing is enabled.
3. Verify the DNS records shown by Cloudflare.
4. Confirm the catch-all rule targets the `qmail` Worker.
5. Confirm the remote D1 schema was applied.
6. Inspect logs:

```bash
pnpm --filter @qmail/worker tail
```

### Email cannot be sent

1. Verify the Brevo API key.
2. Confirm the domain is authenticated in Brevo.
3. Confirm the From address is an authorized sender.
4. Check Brevo transactional logs and account limits.
5. Check SPF, DKIM, and DMARC for conflicts.

### D1 reports `no such table`

Local database:

```bash
pnpm db:migrate
```

Production database:

```bash
pnpm db:migrate:prod
```

### Login is rate limited

Wait 15 minutes after five failed login attempts. Initial password setup is limited to three attempts per hour.

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Worker health check |
| `GET` | `/api/auth/status` | Authentication status |
| `POST` | `/api/auth/setup` | Create administrator password |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/emails` | List messages |
| `GET` | `/api/emails/stats` | Message statistics |
| `POST` | `/api/emails/bulk` | Bulk message action |
| `POST` | `/api/emails/send` | Send through Brevo |
| `GET` | `/api/emails/:id` | Read one message |
| `DELETE` | `/api/emails/:id` | Delete one message |
| `GET` | `/api/setup/status` | Setup status |
| `POST` | `/api/setup/cloudflare` | Configure Email Routing |
| `POST` | `/api/setup/brevo` | Validate and save Brevo key |

## Official Documentation

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/)
- [Cloudflare API Tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Brevo API key authentication](https://developers.brevo.com/docs/api-key-authentication)
- [Brevo senders and domains](https://developers.brevo.com/docs/getting-started-with-senders-and-domains)
