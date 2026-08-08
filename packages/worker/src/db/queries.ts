export interface Email {
  id: string;
  type: 'received' | 'sent';
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
  mailgun_id: string | null;
  created_at: string;
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
  content: string; // Base64 encoded
  created_at: string;
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

  async createEmail(email: Omit<Email, 'created_at'>): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO emails (id, type, from_address, to_address, cc, bcc, subject, body_text, body_html, headers, raw_size, is_read, is_starred, mailgun_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        email.mailgun_id
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
    type?: 'received' | 'sent',
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      starredOnly?: boolean;
    }
  ): Promise<Email[]> {
    let query = 'SELECT * FROM emails';
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
    await this.db
      .prepare('DELETE FROM emails WHERE id = ?')
      .bind(id)
      .run();
  }

  async markManyAsRead(ids: string[], isRead: boolean): Promise<void> {
    if (ids.length === 0) return;
    await this.db.batch(ids.map(id =>
      this.db.prepare('UPDATE emails SET is_read = ? WHERE id = ?').bind(isRead ? 1 : 0, id)
    ));
  }

  async markAllReceivedAsRead(): Promise<void> {
    await this.db
      .prepare("UPDATE emails SET is_read = 1 WHERE type = 'received' AND is_read = 0")
      .run();
  }

  async deleteManyEmails(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.batch(ids.map(id =>
      this.db.prepare('DELETE FROM emails WHERE id = ?').bind(id)
    ));
  }

  async getEmailStats(): Promise<{
    total_received: number;
    total_sent: number;
    unread: number;
    starred: number;
  }> {
    const results = await this.db.batch([
      this.db.prepare("SELECT COUNT(*) as count FROM emails WHERE type = 'received'"),
      this.db.prepare("SELECT COUNT(*) as count FROM emails WHERE type = 'sent'"),
      this.db.prepare("SELECT COUNT(*) as count FROM emails WHERE is_read = 0 AND type = 'received'"),
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
        'INSERT INTO attachments (id, email_id, filename, content_type, size, content) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(
        attachment.id,
        attachment.email_id,
        attachment.filename,
        attachment.content_type,
        attachment.size,
        attachment.content
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
      .prepare('SELECT id, email_id, filename, content_type, size, created_at FROM attachments WHERE email_id = ?')
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
}
