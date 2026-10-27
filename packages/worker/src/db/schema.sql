-- Qmail D1 Database Schema (fresh installs; existing DBs use migrations/)

-- Settings table for storing configuration
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Emails table for storing received, sent, draft, and scheduled emails
CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('received', 'sent', 'draft', 'scheduled')),
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    cc TEXT,
    bcc TEXT,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    headers TEXT,
    raw_size INTEGER,
    is_read INTEGER DEFAULT 0,
    is_starred INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    labels TEXT DEFAULT '[]',       -- JSON array of label strings
    message_id TEXT,                -- RFC 5322 Message-ID
    in_reply_to TEXT,
    thread_id TEXT,                 -- conversation grouping key
    delivery_status TEXT,           -- queued | delivered | bounced | deferred | opened | failed
    scheduled_at TEXT,              -- for type='scheduled' (SQLite datetime format)
    mailgun_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_emails_type ON emails(type);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_from ON emails(from_address);
CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_address);
CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_archived ON emails(archived);
CREATE INDEX IF NOT EXISTS idx_emails_scheduled ON emails(type, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_emails_mailgun ON emails(mailgun_id);

-- Attachments table for storing email attachments.
-- No FK on purpose: deletion is handled explicitly in code, and an FK here
-- makes future table rebuilds cascade-delete attachment rows.
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    content TEXT,          -- Base64 content (only when R2 is not configured)
    r2_key TEXT,           -- R2 object key when stored in R2
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);

-- Contacts (people you correspond with)
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    notes TEXT,
    last_contacted_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- Email addresses managed by the user
CREATE TABLE IF NOT EXISTS addresses (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    display_name TEXT,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Sessions for authentication (token column stores SHA-256 hashes)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- WebAuthn / FIDO2 credentials (passkeys)
CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    credential_id TEXT NOT NULL UNIQUE, -- base64url credential ID from the authenticator
    public_key TEXT NOT NULL,           -- base64url COSE public key
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,                    -- JSON array of transports
    device_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_credentials_credential_id ON credentials(credential_id);

-- Short-lived WebAuthn challenges (single use)
CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
    challenge TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_challenges_type ON challenges(type, challenge);

-- Web Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);
CREATE INDEX IF NOT EXISTS idx_rate_limits_timestamp ON rate_limits(timestamp);

-- Full-text search over emails (external content table + sync triggers)
CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
    subject, body_text, from_address, to_address,
    content='emails', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS emails_fts_ai AFTER INSERT ON emails BEGIN
    INSERT INTO emails_fts(rowid, subject, body_text, from_address, to_address)
    VALUES (new.rowid, new.subject, new.body_text, new.from_address, new.to_address);
END;

CREATE TRIGGER IF NOT EXISTS emails_fts_ad AFTER DELETE ON emails BEGIN
    INSERT INTO emails_fts(emails_fts, rowid, subject, body_text, from_address, to_address)
    VALUES ('delete', old.rowid, old.subject, old.body_text, old.from_address, old.to_address);
END;

CREATE TRIGGER IF NOT EXISTS emails_fts_au AFTER UPDATE ON emails BEGIN
    INSERT INTO emails_fts(emails_fts, rowid, subject, body_text, from_address, to_address)
    VALUES ('delete', old.rowid, old.subject, old.body_text, old.from_address, old.to_address);
    INSERT INTO emails_fts(rowid, subject, body_text, from_address, to_address)
    VALUES (new.rowid, new.subject, new.body_text, new.from_address, new.to_address);
END;

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('setup_completed', 'false'),
    ('domain', ''),
    ('destination_email', ''),
    ('cloudflare_api_key', ''),
    ('cloudflare_account_id', ''),
    ('cloudflare_zone_id', ''),
    ('brevo_api_key', ''),
    ('block_remote_images', 'true');

-- Custom mailbox folders
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS email_folders (
  email_id TEXT PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
  folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_folders_folder ON email_folders(folder_id);
