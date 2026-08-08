-- QMail D1 Database Schema

-- Settings table for storing configuration
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Emails table for storing received and sent emails
CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('received', 'sent')),
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
    mailgun_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_emails_type ON emails(type);
CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_from ON emails(from_address);
CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_address);
CREATE INDEX IF NOT EXISTS idx_emails_is_read ON emails(is_read);

-- Attachments table for storing email attachments
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    content TEXT NOT NULL, -- Base64 encoded content
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);

-- Email addresses managed by the user
CREATE TABLE IF NOT EXISTS addresses (
    id TEXT PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    display_name TEXT,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Sessions for authentication
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);
CREATE INDEX IF NOT EXISTS idx_rate_limits_timestamp ON rate_limits(timestamp);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('setup_completed', 'false'),
    ('domain', ''),
    ('destination_email', ''),
    ('cloudflare_api_key', ''),
    ('cloudflare_account_id', ''),
    ('cloudflare_zone_id', ''),
    ('brevo_api_key', '');
