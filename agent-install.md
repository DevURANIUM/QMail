---
name: install-qmail
description: >
  Install, deploy, or upgrade Qmail — a self-hosted email system on Cloudflare
  Workers (D1 + Email Routing + Brevo, Vue 3 SPA). Use this skill when a user asks
  to install Qmail, deploy it to their Cloudflare account, upgrade an existing
  deployment, or troubleshoot a broken install. Covers prerequisites, database
  migration order, wrangler configuration, optional R2 attachments, and
  post-deploy configuration through the app UI.
---

# Installing Qmail (agent guide)

You are deploying a **single-admin, self-hosted email system** that runs entirely
on the user's Cloudflare account. Receiving works through Cloudflare Email
Routing (a catch-all rule routes mail into an Email Worker), storage is a D1
SQLite database (attachments optionally in R2), and sending goes through the
Brevo transactional API. The frontend is a Vue 3 SPA served as static assets by
the same Worker.

Read this whole file before running commands. The steps are ordered; the
migration section especially must not be improvised.

## What the user must have (verify before starting)

| Requirement | How to verify | If missing |
|---|---|---|
| Cloudflare account | `npx wrangler whoami` after login | User creates one at dash.cloudflare.com (free tier works) |
| A domain usable for email | Ask the user | Domain must be (or become) a Cloudflare zone |
| Brevo account + API key | Ask the user | Free tier at brevo.com is enough; key entered later in the app UI, not during install |
| Node.js ≥ 18 | `node --version` | Install via their preferred method |
| pnpm | `pnpm --version` | `npm install -g pnpm` |

Notes for the agent:

- **wrangler does NOT need a global install** — the repo pins it and every
  command below uses `npx wrangler`.
- `wrangler login` opens a browser OAuth flow. You cannot complete it for the
  user; ask them to run it themselves in a terminal, then verify with
  `npx wrangler whoami`.
- The **Cloudflare API token and Brevo API key are configured inside the app
  after deployment**, not during install. Do not ask the user to paste them into
  config files or into the chat; the app stores them in D1 through its Settings
  UI.
- **Never commit `wrangler.toml`** — it is gitignored on purpose because it
  contains the account-specific database id.

## Fresh install

Run from the repository root unless stated otherwise. Several `wrangler d1`
commands are directory-sensitive — **always run them from `packages/worker/`**.

### 1. Install dependencies

```bash
git clone https://github.com/DevURANIUM/QMail.git Qmail
cd Qmail
pnpm install
```

### 2. Create the D1 database

```bash
cd packages/worker
npx wrangler d1 create qmail-db
```

Capture the `database_id` UUID from the output. If the command says the database
already exists, get the id with `npx wrangler d1 list` instead — do not create a
second one.

### 3. Configure wrangler.toml

```bash
cp wrangler.toml.example wrangler.toml
```

Then edit `wrangler.toml` and replace `YOUR_DATABASE_ID_HERE` with the UUID from
step 2. Leave everything else as-is. The file already includes:

- `[assets]` with `binding = "ASSETS"` and `run_worker_first = true` — required
  for SPA deep links and security headers; do not remove them.
- `[triggers] crons = ["*/5 * * * *"]` — delivers scheduled emails; keep it.
- A commented-out `[[r2_buckets]]` block — see "Optional: R2" below. Leave it
  commented unless the user has R2 enabled.

### 4. Initialize the database schema

Fresh installs use `schema.sql` and **nothing else**:

```bash
npx wrangler d1 execute qmail-db --remote --file=./src/db/schema.sql
```

Do **not** run anything in `src/db/migrations/` on a fresh database — those are
upgrade deltas for pre-existing databases and will fail (or worse, no-op
misleadingly) on a fresh one.

Sanity check — this must list `emails`, `attachments`, `contacts`, `credentials`,
`challenges`, `push_subscriptions`, `emails_fts`, among others:

```bash
npx wrangler d1 execute qmail-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

### 5. Build everything

From the repository root (this builds the two API wrapper packages AND the
frontend — the worker will not deploy correctly without them):

```bash
cd ../..
pnpm -r build
```

Expected: tsup output for `@qmail/brevo-api` and
`@qmail/cloudflare-email-api`, then a Vite build ending in `✓ built`.

### 6. Deploy

```bash
cd packages/worker
npx wrangler deploy
```

Expected output includes the workers.dev URL (e.g.
`https://qmail.<subdomain>.workers.dev`), bindings for `env.DB` and
`env.ASSETS`, and `schedule: */5 * * * *`.

### 7. Verify the deployment

Run these; all must pass before telling the user it works:

```bash
BASE="https://qmail.<their-subdomain>.workers.dev"
curl -s  $BASE/api/health                          # → {"status":"ok",...}
curl -s  $BASE/api/auth/status                     # → {"authenticated":false,"needsSetup":true,...}
curl -so /dev/null -w "%{http_code}" $BASE/login   # → 200 (SPA deep link)
curl -sI $BASE/ | grep -i content-security-policy  # → CSP header present
```

If `/login` returns the "Frontend assets not found" page, the frontend was not
built before deploy — redo steps 5–6.

### 8. In-app configuration (the user does this in a browser)

The rest happens in the app UI. Walk the user through it; you cannot do these
steps for them because they involve their credentials and email verification:

1. **Open the deployed URL** → create the admin password (min 8 chars). They are
   signed in automatically.
2. **Settings → Security → Passkeys** (recommended): add a passkey for
   passwordless sign-in. Passkeys bind to the exact hostname — if they later
   move to a custom domain, they'll need to add a new passkey there.
3. **Settings → Cloudflare tab**: the user creates a Cloudflare API token at
   dash.cloudflare.com → My Profile → API Tokens → Create Custom Token with
   EXACTLY these permissions:

   | Scope | Permission | Access |
   |---|---|---|
   | Account | Email Routing Addresses | Edit |
   | Zone | Zone | Read |
   | Zone | DNS | Edit |
   | Zone | Email Routing Rules | Edit |
   | Zone | Zone Settings | Edit |

   They enter the token, their Account ID (dashboard sidebar), their domain, and
   optionally a personal forwarding email, then save. This auto-creates the zone
   if needed, enables Email Routing, and points the catch-all rule at the
   worker.

   ⚠️ If the worker was deployed under a name other than `qmail`, the
   catch-all rule targets the wrong worker — the "Fix Email Routing" button in
   the same tab accepts the actual worker name via API
   (`POST /api/setup/cloudflare/worker-routing` with `{"workerName": "..."}`).
4. **Settings → Brevo tab**: paste the Brevo API key and save. Saving also
   auto-registers a delivery-status webhook pointing back at this deployment
   (Sent mail then shows Delivered/Opened/Bounced badges). If the user rotates
   the key later, re-saving re-registers it.
5. **Brevo dashboard**: the user must add + verify their sending domain
   (SPF/DKIM/DMARC records) at app.brevo.com/senders/domain/list, or outgoing
   mail will be refused or land in spam.
6. **Settings → Addresses tab**: add at least one From address
   (e.g. `hello@theirdomain.com`).
7. **Complete Setup** banner → click it.
8. **Test both directions**: send an email from any external mailbox to
   `anything@theirdomain.com` (catch-all — every local part works) and confirm
   it appears in the Inbox; then send one out via Compose.

## Optional: R2 for large attachments

Default behavior without R2: attachments are stored base64-inline in D1 with a
**5MB per-file cap**. With R2 the cap is **25MB** and the database stays small.

R2 must first be **enabled by the user in the Cloudflare dashboard** (one-time
opt-in; the API returns error code `10042` if it isn't). Then:

```bash
cd packages/worker
npx wrangler r2 bucket create qmail-attachments
```

Uncomment the `[[r2_buckets]]` block in `wrangler.toml` and redeploy. Existing
inline attachments keep working — reads fall back to D1 automatically.

## Upgrading an existing deployment

Order matters, and migrations must each run **exactly once**:

1. `git pull` and `pnpm install`.
2. Figure out the database's generation:
   ```bash
   npx wrangler d1 execute qmail-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
   ```
   - No `credentials` table → first run `schema.sql` (idempotent), then
     `migrations/002-features.sql`.
   - `credentials` exists but no `push_subscriptions`/`emails_fts` → run
     `migrations/002-features.sql` only.
   - `push_subscriptions` exists but no `contacts` → run `schema.sql` (it is
     fully idempotent and only adds what's missing).
   - All present → schema is current.
3. **Never run `002-features.sql` twice** — it rebuilds tables and will fail on
   an already-migrated database (D1 rolls the batch back, so a failed re-run is
   harmless but alarming).
4. `pnpm -r build` from the root, then `npx wrangler deploy` from
   `packages/worker/`.
5. Tell the user: upgrading from a pre-passkey version **invalidates existing
   sessions** (tokens are now stored hashed) — they just sign in again with the
   same password.

## Local development (only if the user asks for it)

```bash
# Terminal 1 — worker + local D1 (state lives in packages/worker/.wrangler/)
cd packages/worker
npx wrangler d1 execute qmail-db --local --file=./src/db/schema.sql
npx wrangler dev            # serves on http://localhost:8787

# Terminal 2 — optional Vite dev server with HMR (proxies /api to :8787)
cd frontend
pnpm run dev                # serves on http://localhost:5173
```

Gotchas you will hit if you're careless:

- `wrangler d1 ... --local` is **cwd-sensitive** — run it from
  `packages/worker/` or it errors with "Couldn't find a D1 DB".
- The local D1 file is keyed by `database_id`; changing the id in
  `wrangler.toml` silently gives you a fresh empty local database.
- If port 8787 is taken by a zombie dev server: `lsof -ti :8787 | xargs kill -9`.
- Test the cron locally with `npx wrangler dev --test-scheduled`, then
  `curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Frontend assets not found" page | Frontend not built before deploy, or `[assets]` block missing `binding = "ASSETS"` | `pnpm -r build`, check wrangler.toml, redeploy |
| Deploy error mentioning `qmail-attachments` | R2 block uncommented but bucket/R2 not enabled | Re-comment the `[[r2_buckets]]` block or create the bucket |
| API error code `10042` on bucket create | R2 not enabled on the account | User enables R2 in the Cloudflare dashboard first |
| Inbound mail never arrives | Catch-all rule not pointing at the worker, or DNS/MX not active | Settings → Cloudflare → "Fix Email Routing"; verify MX records and zone is active |
| Outbound refused / spam-foldered | Domain not verified in Brevo | Complete SPF/DKIM/DMARC verification in Brevo dashboard |
| 429 on login | Rate limit: 5 attempts / 15 min (password + passkey share it) | Wait 15 minutes |
| "Too many setup attempts" | Setup rate limit: 3 / hour | Wait an hour |
| Everyone logged out after upgrade | Session tokens now stored hashed | Expected — sign in again |
| Passkey works on workers.dev but not custom domain | Passkeys bind to hostname | Register an additional passkey on the new hostname |
| Migration file fails mid-run | Wrong generation or ran twice | D1 rolls back the batch; re-check the generation table in "Upgrading" |
| Scheduled email stuck with status "failed" | Brevo rejected it (bad key, unverified domain) | Fix Brevo config; the email is preserved — edit it under Drafts and resend |

## Facts about the system worth stating to users

- All secrets (Cloudflare token, Brevo key) live in the D1 `settings` table,
  entered through the UI over HTTPS — nothing secret goes in config files.
- Received HTML email is DOMPurify-sanitized and remote images are blocked by
  default (toggle in Settings → Security → Privacy).
- Push notifications are payload-free by design: the push service only ever
  learns "something arrived", never any mail content.
- Full backup anytime: Settings → Security → Backup → mbox export.
- The cron (every 5 minutes) delivers scheduled mail and prunes expired
  sessions; it is included in the deploy automatically.
