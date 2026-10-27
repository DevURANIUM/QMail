-- Migration 002: threading, drafts, scheduled send, archive, labels,
-- delivery status, full-text search, R2 attachments, push subscriptions.
-- Run ONCE against databases created before this migration:
--   wrangler d1 execute qmail-db --remote --file=./src/db/migrations/002-features.sql
-- Fresh installs get all of this from schema.sql and must NOT run this file.

-- Rebuild attachments FIRST, dropping its foreign key: with foreign_keys on,
-- DROP TABLE emails would run an implicit DELETE that cascades and wipes all
-- attachment rows. Attachment deletion is handled explicitly in code instead.
CREATE TABLE attachments_new (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    content TEXT,          -- Base64 content (legacy / small deployments without R2)
    r2_key TEXT,           -- R2 object key when stored in R2
    created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO attachments_new (id, email_id, filename, content_type, size, content, created_at)
    SELECT id, email_id, filename, content_type, size, content, created_at FROM attachments;

DROP TABLE attachments;
ALTER TABLE attachments_new RENAME TO attachments;

CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);

-- Rebuild emails with the new shape (CHECK constraints cannot be altered)
CREATE TABLE emails_new (
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
    labels TEXT DEFAULT '[]',
    message_id TEXT,
    in_reply_to TEXT,
    thread_id TEXT,
    delivery_status TEXT,
    scheduled_at TEXT,
    mailgun_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO emails_new (id, type, from_address, to_address, cc, bcc, subject, body_text, body_html, headers, raw_size, is_read, is_starred, mailgun_id, created_at)
    SELECT id, type, from_address, to_address, cc, bcc, subject, body_text, body_html, headers, raw_size, is_read, is_starred, mailgun_id, created_at FROM emails;

DROP TABLE emails;
ALTER TABLE emails_new RENAME TO emails;

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

-- Web Push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

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

INSERT INTO emails_fts(emails_fts) VALUES ('rebuild');

-- New default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('block_remote_images', 'true');
