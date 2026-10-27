export type EmailType = 'received' | 'sent' | 'draft' | 'scheduled';

export interface Email {
  id: string;
  type: EmailType;
  from_address: string;
  to_address: string;
  cc: string | null;
  bcc: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  headers: string | null;
  raw_size: number | null;
  is_read: number;
  is_starred: number;
  archived: number;
  labels: string; // JSON array of strings
  message_id: string | null;
  in_reply_to: string | null;
  thread_id: string | null;
  delivery_status: string | null;
  scheduled_at: string | null;
  mailgun_id: string | null;
  created_at: string;
  /** Populated by list/search queries via subselect */
  attachment_count?: number;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export interface Address {
  id: string;
  address: string;
  display_name: string | null;
  is_default: number;
  created_at: string;
}

export interface Session {
  id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  email_id: string;
  filename: string;
  content_type: string;
  size: number;
  content: string | null; // Base64 encoded (null when stored in R2)
  r2_key: string | null;  // R2 object key (null when stored inline)
  created_at: string;
}

export interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface Contact {
  id: string;
  email: string;
  name: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
}

export interface Credential {
  id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export class DatabaseQueries {
  constructor(private db: D1Database) {}

  // ==================== Settings ====================

  async getSetting(key: string): Promise<string | null> {
    const result = await this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .bind(key)
      .first<{ value: string }>();
    return result?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .bind(key, value)
      .run();
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const results = await this.db
      .prepare('SELECT key, value FROM settings')
      .all<Setting>();

    const settings: Record<string, string> = {};
    for (const row of results.results || []) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  // ==================== Emails ====================

  async createEmail(email: Omit<Email, 'created_at' | 'archived' | 'labels' | 'message_id' | 'in_reply_to' | 'thread_id' | 'delivery_status' | 'scheduled_at'> & Partial<Pick<Email, 'archived' | 'labels' | 'message_id' | 'in_reply_to' | 'thread_id' | 'delivery_status' | 'scheduled_at'>>): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO emails (id, type, from_address, to_address, cc, bcc, subject, body_text, body_html, headers, raw_size, is_read, is_starred, archived, labels, message_id, in_reply_to, thread_id, delivery_status, scheduled_at, mailgun_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        email.id,
        email.type,
        email.from_address,
        email.to_address,
        email.cc,
        email.bcc,
        email.subject,
        email.body_text,
        email.body_html,
        email.headers,
        email.raw_size,
        email.is_read,
        email.is_starred,
        email.archived ?? 0,
        email.labels ?? '[]',
        email.message_id ?? null,
        email.in_reply_to ?? null,
        email.thread_id ?? null,
        email.delivery_status ?? null,
        email.scheduled_at ?? null,
        email.mailgun_id
      )
      .run();
  }

  /** Update draft/scheduled email fields in place */
  async updateEmailContent(id: string, fields: {
    from_address: string;
    to_address: string;
    cc: string | null;
    bcc: string | null;
    subject: string | null;
    body_text: string | null;
    body_html: string | null;
    scheduled_at?: string | null;
  }): Promise<void> {
    await this.db
      .prepare(
        `UPDATE emails SET from_address = ?, to_address = ?, cc = ?, bcc = ?, subject = ?, body_text = ?, body_html = ?, scheduled_at = ? WHERE id = ?`
      )
      .bind(
        fields.from_address,
        fields.to_address,
        fields.cc,
        fields.bcc,
        fields.subject,
        fields.body_text,
        fields.body_html,
        fields.scheduled_at ?? null,
        id
      )
      .run();
  }

  async getEmail(id: string): Promise<Email | null> {
    return this.db
      .prepare('SELECT * FROM emails WHERE id = ?')
      .bind(id)
      .first<Email>();
  }

  async listEmails(
    type?: EmailType,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      starredOnly?: boolean;
      archivedOnly?: boolean;
      folder?: string;
      label?: string;
    }
  ): Promise<Email[]> {
    let query = 'SELECT emails.*, (SELECT COUNT(*) FROM attachments WHERE attachments.email_id = emails.id) AS attachment_count FROM emails';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (options?.unreadOnly) {
      conditions.push('is_read = 0');
    }

    if (options?.starredOnly) {
      conditions.push('is_starred = 1');
    }

    // Archived mail lives in its own view; everything else excludes it
    if (options?.archivedOnly) {
      conditions.push('archived = 1');
    } else {
      conditions.push('archived = 0');
    }

    if (options?.folder) {
      conditions.push('EXISTS (SELECT 1 FROM email_folders WHERE email_id = emails.id AND folder_id = ?)');
      params.push(options.folder);
    } else if (!options?.archivedOnly && !options?.label) {
      conditions.push('NOT EXISTS (SELECT 1 FROM email_folders WHERE email_id = emails.id)');
    }

    if (options?.label) {
      conditions.push("EXISTS (SELECT 1 FROM json_each(emails.labels) WHERE json_each.value = ?)");
      params.push(options.label);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const bound = params.length > 0 ? stmt.bind(...params) : stmt;
    const results = await bound.all<Email>();
    return results.results || [];
  }

  /**
   * Full-text search across subject, body, and addresses (FTS5).
   * The query is normalized into quoted terms so FTS syntax can't error.
   */
  async searchEmails(query: string, limit = 50): Promise<Email[]> {
    const terms = query
      .split(/\s+/)
      .map(t => t.replace(/["*^]/g, ''))
      .filter(Boolean)
      .map(t => `"${t}"*`)
      .join(' ');

    if (!terms) return [];

    const results = await this.db
      .prepare(
        `SELECT e.*, (SELECT COUNT(*) FROM attachments WHERE attachments.email_id = e.id) AS attachment_count
         FROM emails e
         JOIN emails_fts f ON e.rowid = f.rowid
         WHERE emails_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .bind(terms, limit)
      .all<Email>();
    return results.results || [];
  }

  async getEmailsByThread(threadId: string): Promise<Email[]> {
    const results = await this.db
      .prepare("SELECT * FROM emails WHERE thread_id = ? ORDER BY created_at")
      .bind(threadId)
      .all<Email>();
    return results.results || [];
  }

  async getEmailByMessageId(messageId: string): Promise<Email | null> {
    return this.db
      .prepare('SELECT * FROM emails WHERE message_id = ? LIMIT 1')
      .bind(messageId)
      .first<Email>();
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    await this.db
      .prepare('UPDATE emails SET archived = ? WHERE id = ?')
      .bind(archived ? 1 : 0, id)
      .run();
  }

  async setLabels(id: string, labels: string[]): Promise<void> {
    await this.db
      .prepare('UPDATE emails SET labels = ? WHERE id = ?')
      .bind(JSON.stringify(labels), id)
      .run();
  }

  async listAllLabels(): Promise<string[]> {
    const results = await this.db
      .prepare("SELECT DISTINCT json_each.value AS label FROM emails, json_each(emails.labels) ORDER BY label")
      .all<{ label: string }>();
    return (results.results || []).map(r => r.label);
  }

  async getEmailByBrevoMessageId(brevoMessageId: string): Promise<Email | null> {
    return this.db
      .prepare("SELECT * FROM emails WHERE mailgun_id = ? AND type = 'sent' LIMIT 1")
      .bind(brevoMessageId)
      .first<Email>();
  }

  async updateDeliveryStatus(brevoMessageId: string, status: string): Promise<void> {
    await this.db
      .prepare("UPDATE emails SET delivery_status = ? WHERE mailgun_id = ? AND type = 'sent'")
      .bind(status, brevoMessageId)
      .run();
  }

  /**
   * Convert a pending/draft/scheduled row into a sent email after delivery.
   * Brevo's message id becomes the RFC Message-ID so future replies thread.
   */
  async markEmailSent(id: string, brevoMessageId: string | null): Promise<void> {
    await this.db
      .prepare(
        `UPDATE emails SET
           type = 'sent',
           delivery_status = 'queued',
           mailgun_id = ?,
           message_id = COALESCE(?, message_id),
           thread_id = COALESCE(thread_id, ?, id),
           scheduled_at = NULL,
           created_at = datetime('now')
         WHERE id = ?`
      )
      .bind(brevoMessageId, brevoMessageId, brevoMessageId, id)
      .run();
  }

  /** Move a draft into the scheduled queue (clears any failed marker) */
  async setScheduled(id: string): Promise<void> {
    await this.db
      .prepare("UPDATE emails SET type = 'scheduled', delivery_status = NULL WHERE id = ?")
      .bind(id)
      .run();
  }

  /** Demote a failed send back to an editable draft */
  async markSendFailed(id: string): Promise<void> {
    await this.db
      .prepare("UPDATE emails SET type = 'draft', delivery_status = 'failed', scheduled_at = NULL WHERE id = ?")
      .bind(id)
      .run();
  }

  /** Every email, newest first (mbox export) */
  async listAllEmails(limit = 5000): Promise<Email[]> {
    const results = await this.db
      .prepare('SELECT * FROM emails ORDER BY created_at LIMIT ?')
      .bind(limit)
      .all<Email>();
    return results.results || [];
  }

  async markScheduledFailed(id: string): Promise<void> {
    await this.db
      .prepare("UPDATE emails SET delivery_status = 'failed' WHERE id = ?")
      .bind(id)
      .run();
  }

  /** Scheduled emails that are due and have not permanently failed */
  async listDueScheduledEmails(): Promise<Email[]> {
    const results = await this.db
      .prepare(
        "SELECT * FROM emails WHERE type = 'scheduled' AND scheduled_at <= datetime('now') AND (delivery_status IS NULL OR delivery_status != 'failed')"
      )
      .all<Email>();
    return results.results || [];
  }

  async markAsRead(id: string): Promise<void> {
    await this.db
      .prepare('UPDATE emails SET is_read = 1 WHERE id = ?')
      .bind(id)
      .run();
  }

  async markAsUnread(id: string): Promise<void> {
    await this.db
      .prepare('UPDATE emails SET is_read = 0 WHERE id = ?')
      .bind(id)
      .run();
  }

  async toggleStar(id: string): Promise<void> {
    await this.db
      .prepare('UPDATE emails SET is_starred = NOT is_starred WHERE id = ?')
      .bind(id)
      .run();
  }

  async deleteEmail(id: string): Promise<void> {
    // D1 does not guarantee foreign_keys pragma, so delete attachments explicitly
    await this.db.batch([
      this.db.prepare('DELETE FROM attachments WHERE email_id = ?').bind(id),
      this.db.prepare('DELETE FROM emails WHERE id = ?').bind(id),
    ]);
  }

  async getEmailActivity(days: number): Promise<Array<{ day: string; type: string; count: number }>> {
    const results = await this.db
      .prepare(
        `SELECT date(created_at) AS day, type, COUNT(*) AS count
         FROM emails
         WHERE created_at >= datetime('now', ?)
         GROUP BY day, type`
      )
      .bind(`-${days - 1} days`)
      .all<{ day: string; type: string; count: number }>();
    return results.results || [];
  }

  async getStorageBytes(): Promise<number> {
    const result = await this.db
      .prepare(
        `SELECT
           (SELECT COALESCE(SUM(raw_size), 0) FROM emails) +
           (SELECT COALESCE(SUM(size), 0) FROM attachments WHERE email_id IN (SELECT id FROM emails WHERE type = 'sent'))
         AS bytes`
      )
      .first<{ bytes: number }>();
    return result?.bytes ?? 0;
  }

  async getEmailStats(): Promise<{
    total_received: number;
    total_sent: number;
    unread: number;
    starred: number;
  }> {
    const results = await this.db.batch([
      this.db.prepare("SELECT COUNT(*) as count FROM emails WHERE type = 'received' AND archived = 0"),
      this.db.prepare("SELECT COUNT(*) as count FROM emails WHERE type = 'sent'"),
      this.db.prepare("SELECT COUNT(*) as count FROM emails WHERE is_read = 0 AND type = 'received' AND archived = 0"),
      this.db.prepare('SELECT COUNT(*) as count FROM emails WHERE is_starred = 1'),
    ]);

    return {
      total_received: (results[0].results?.[0] as { count: number })?.count ?? 0,
      total_sent: (results[1].results?.[0] as { count: number })?.count ?? 0,
      unread: (results[2].results?.[0] as { count: number })?.count ?? 0,
      starred: (results[3].results?.[0] as { count: number })?.count ?? 0,
    };
  }

  // ==================== Addresses ====================

  async createAddress(address: Omit<Address, 'created_at'>): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO addresses (id, address, display_name, is_default) VALUES (?, ?, ?, ?)'
      )
      .bind(address.id, address.address, address.display_name, address.is_default)
      .run();
  }

  async listAddresses(): Promise<Address[]> {
    const results = await this.db
      .prepare('SELECT * FROM addresses ORDER BY created_at')
      .all<Address>();
    return results.results || [];
  }

  async deleteAddress(id: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM addresses WHERE id = ?')
      .bind(id)
      .run();
  }

  async setDefaultAddress(id: string): Promise<void> {
    await this.db.batch([
      this.db.prepare('UPDATE addresses SET is_default = 0'),
      this.db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').bind(id),
    ]);
  }

  // ==================== Sessions ====================

  async createSession(session: Omit<Session, 'created_at'>): Promise<void> {
    await this.db
      .prepare('INSERT INTO sessions (id, token, expires_at) VALUES (?, ?, ?)')
      .bind(session.id, session.token, session.expires_at)
      .run();
  }

  async getSessionByToken(token: string): Promise<Session | null> {
    return this.db
      .prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')")
      .bind(token)
      .first<Session>();
  }

  async deleteSession(token: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM sessions WHERE token = ?')
      .bind(token)
      .run();
  }

  async cleanExpiredSessions(): Promise<void> {
    await this.db
      .prepare("DELETE FROM sessions WHERE expires_at < datetime('now')")
      .run();
  }

  // ==================== Attachments ====================

  async createAttachment(attachment: Omit<Attachment, 'created_at'>): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO attachments (id, email_id, filename, content_type, size, content, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        attachment.id,
        attachment.email_id,
        attachment.filename,
        attachment.content_type,
        attachment.size,
        attachment.content,
        attachment.r2_key
      )
      .run();
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    return this.db
      .prepare('SELECT * FROM attachments WHERE id = ?')
      .bind(id)
      .first<Attachment>();
  }

  async getAttachmentsByEmailId(emailId: string): Promise<Omit<Attachment, 'content'>[]> {
    const results = await this.db
      .prepare('SELECT id, email_id, filename, content_type, size, r2_key, created_at FROM attachments WHERE email_id = ?')
      .bind(emailId)
      .all<Omit<Attachment, 'content'>>();
    return results.results || [];
  }

  async deleteAttachmentsByEmailId(emailId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM attachments WHERE email_id = ?')
      .bind(emailId)
      .run();
  }

  // ==================== Contacts ====================

  async listContacts(): Promise<Contact[]> {
    const results = await this.db
      .prepare('SELECT * FROM contacts ORDER BY COALESCE(name, email) COLLATE NOCASE')
      .all<Contact>();
    return results.results || [];
  }

  /** Create or refresh a contact; an existing name is never clobbered by null */
  async upsertContact(contact: { id: string; email: string; name?: string | null; notes?: string | null }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO contacts (id, email, name, notes)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           name = COALESCE(excluded.name, contacts.name),
           notes = COALESCE(excluded.notes, contacts.notes)`
      )
      .bind(contact.id, contact.email.toLowerCase(), contact.name ?? null, contact.notes ?? null)
      .run();
  }

  async updateContact(id: string, fields: { email: string; name: string | null; notes: string | null }): Promise<void> {
    await this.db
      .prepare('UPDATE contacts SET email = ?, name = ?, notes = ? WHERE id = ?')
      .bind(fields.email.toLowerCase(), fields.name, fields.notes, id)
      .run();
  }

  async deleteContact(id: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM contacts WHERE id = ?')
      .bind(id)
      .run();
  }

  async touchContactLastContacted(email: string): Promise<void> {
    await this.db
      .prepare("UPDATE contacts SET last_contacted_at = datetime('now') WHERE email = ?")
      .bind(email.toLowerCase())
      .run();
  }

  // ==================== Push Subscriptions ====================

  async createPushSubscription(sub: Omit<PushSubscription, 'created_at'>): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
      )
      .bind(sub.id, sub.endpoint, sub.p256dh, sub.auth)
      .run();
  }

  async listPushSubscriptions(): Promise<PushSubscription[]> {
    const results = await this.db
      .prepare('SELECT * FROM push_subscriptions')
      .all<PushSubscription>();
    return results.results || [];
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
      .bind(endpoint)
      .run();
  }

  // ==================== WebAuthn Credentials ====================

  async createCredential(credential: Omit<Credential, 'created_at' | 'last_used_at'>): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO credentials (id, credential_id, public_key, counter, transports, device_name) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        credential.id,
        credential.credential_id,
        credential.public_key,
        credential.counter,
        credential.transports,
        credential.device_name
      )
      .run();
  }

  async listCredentials(): Promise<Credential[]> {
    const results = await this.db
      .prepare('SELECT * FROM credentials ORDER BY created_at')
      .all<Credential>();
    return results.results || [];
  }

  async getCredentialByCredentialId(credentialId: string): Promise<Credential | null> {
    return this.db
      .prepare('SELECT * FROM credentials WHERE credential_id = ?')
      .bind(credentialId)
      .first<Credential>();
  }

  async updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
    await this.db
      .prepare("UPDATE credentials SET counter = ?, last_used_at = datetime('now') WHERE credential_id = ?")
      .bind(counter, credentialId)
      .run();
  }

  async deleteCredential(id: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM credentials WHERE id = ?')
      .bind(id)
      .run();
  }

  async countCredentials(): Promise<number> {
    const result = await this.db
      .prepare('SELECT COUNT(*) as count FROM credentials')
      .first<{ count: number }>();
    return result?.count ?? 0;
  }

  // ==================== WebAuthn Challenges ====================

  async createChallenge(challenge: {
    id: string;
    type: 'registration' | 'authentication';
    challenge: string;
    expires_at: string;
  }): Promise<void> {
    await this.db.batch([
      // Opportunistic cleanup of expired challenges
      this.db.prepare("DELETE FROM challenges WHERE expires_at < datetime('now')"),
      this.db
        .prepare('INSERT INTO challenges (id, type, challenge, expires_at) VALUES (?, ?, ?, ?)')
        .bind(challenge.id, challenge.type, challenge.challenge, challenge.expires_at),
    ]);
  }

  /**
   * Atomically look up and delete a challenge so it can only be used once.
   * Returns true if the challenge existed and was still valid.
   */
  async consumeChallenge(type: 'registration' | 'authentication', challenge: string): Promise<boolean> {
    const found = await this.db
      .prepare("SELECT id FROM challenges WHERE type = ? AND challenge = ? AND expires_at > datetime('now')")
      .bind(type, challenge)
      .first<{ id: string }>();

    if (!found) return false;

    await this.db.prepare('DELETE FROM challenges WHERE id = ?').bind(found.id).run();
    return true;
  }
}
