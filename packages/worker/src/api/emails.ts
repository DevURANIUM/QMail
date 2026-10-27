import { Hono } from 'hono';
import { DatabaseQueries, Email, EmailType } from '../db/queries';
import { generateId, sanitizeFilename, contentDispositionAttachment, sqliteDateTime } from '../lib/utils';
import { isValidEmail, isAllowedContentType } from '../lib/validation';
import { deliverStoredEmail, parseEmailAddress, recordRecipientsAsContacts } from '../lib/mailer';
import {
  storeAttachment,
  loadAttachmentBytes,
  loadAttachmentBase64,
  deleteAttachmentObjects,
} from '../lib/attachments';
import { buildEml, mboxSeparator } from '../lib/eml';

export interface Env {
  DB: D1Database;
  ATTACHMENTS?: R2Bucket;
}

const MAX_UPLOAD_ATTACHMENT_SIZE = 5 * 1024 * 1024;  // 5MB per file over the JSON API
const MAX_TOTAL_ATTACHMENT_SIZE = 10 * 1024 * 1024;  // 10MB per email
const MAX_ATTACHMENT_COUNT = 10;

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

function base64ByteLength(content: string): number {
  const padding = content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0;
  return Math.floor((content.length * 3) / 4) - padding;
}

function base64ToBytes(content: string): Uint8Array {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

interface OutgoingAttachment {
  filename: string;
  content: string; // Base64
  contentType?: string;
}

interface SendRequest {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  attachments?: OutgoingAttachment[];
  draftId?: string;          // send an existing draft (its row is reused)
  scheduleAt?: string;       // ISO datetime → store as scheduled instead of sending
  replyToEmailId?: string;   // thread the message as a reply to this stored email
  forwardOfEmailId?: string; // copy this stored email's attachments onto the new message
}

function validateSendRequest(body: SendRequest): string | null {
  if (!body.from || !body.to || !body.subject) {
    return 'from, to, and subject are required';
  }
  if (!body.text && !body.html) {
    return 'Either text or html body is required';
  }
  for (const [field, value] of [['from', body.from], ['to', body.to], ['cc', body.cc], ['bcc', body.bcc], ['replyTo', body.replyTo]] as const) {
    if (value && !isValidEmail(parseEmailAddress(value).email)) {
      return `Invalid ${field} address`;
    }
  }
  if (body.attachments) {
    if (body.attachments.length > MAX_ATTACHMENT_COUNT) {
      return `Too many attachments (max ${MAX_ATTACHMENT_COUNT})`;
    }
    let totalSize = 0;
    for (const att of body.attachments) {
      if (!att.filename || typeof att.content !== 'string') {
        return 'Invalid attachment';
      }
      if (att.content.length % 4 !== 0 || !BASE64_PATTERN.test(att.content)) {
        return `Attachment "${att.filename}" is not valid base64`;
      }
      if (att.contentType && !isAllowedContentType(att.contentType)) {
        return `Attachment type not allowed: ${att.contentType}`;
      }
      const size = base64ByteLength(att.content);
      if (size > MAX_UPLOAD_ATTACHMENT_SIZE) {
        return `Attachment "${att.filename}" exceeds 5MB`;
      }
      totalSize += size;
    }
    if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE) {
      return 'Total attachment size exceeds 10MB';
    }
  }
  return null;
}

const emails = new Hono<{ Bindings: Env }>();

/**
 * List emails (type: received | sent | draft | scheduled;
 * filters: unread, starred, archived, label)
 */
emails.get('/', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const type = c.req.query('type') as EmailType | undefined;
    const rawLimit = parseInt(c.req.query('limit') || '50', 10);
    const rawOffset = parseInt(c.req.query('offset') || '0', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    const emailList = await db.listEmails(type, {
      limit,
      offset,
      unreadOnly: c.req.query('unread') === 'true',
      starredOnly: c.req.query('starred') === 'true',
      archivedOnly: c.req.query('archived') === 'true',
      label: c.req.query('label') || undefined,
      folder: c.req.query('folder') || undefined,
    });

    return c.json({
      emails: emailList,
      pagination: { limit, offset },
    });
  } catch (error) {
    console.error('List emails error:', error);
    return c.json({ error: 'Failed to list emails' }, 500);
  }
});

/**
 * Full-text search
 */
emails.get('/search', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const q = (c.req.query('q') || '').slice(0, 200);
    if (!q.trim()) {
      return c.json({ emails: [] });
    }
    const results = await db.searchEmails(q, 50);
    return c.json({ emails: results });
  } catch (error) {
    console.error('Search error:', error);
    return c.json({ error: 'Search failed' }, 500);
  }
});

/**
 * All labels in use
 */
emails.get('/labels', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    return c.json({ labels: await db.listAllLabels() });
  } catch (error) {
    console.error('List labels error:', error);
    return c.json({ error: 'Failed to list labels' }, 500);
  }
});

/**
 * Get email statistics
 */
emails.get('/stats', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const [stats, storageBytes] = await Promise.all([
      db.getEmailStats(),
      db.getStorageBytes(),
    ]);
    return c.json({ ...stats, storage_bytes: storageBytes });
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ error: 'Failed to get stats' }, 500);
  }
});

/**
 * Get daily send/receive counts for the activity chart.
 */
emails.get('/activity', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const rawDays = parseInt(c.req.query('days') || '14', 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 7), 90) : 14;

    const rows = await db.getEmailActivity(days);

    const byDay = new Map<string, { received: number; sent: number }>();
    for (const row of rows) {
      const entry = byDay.get(row.day) || { received: 0, sent: 0 };
      if (row.type === 'received') entry.received = row.count;
      if (row.type === 'sent') entry.sent = row.count;
      byDay.set(row.day, entry);
    }

    const activity: Array<{ day: string; received: number; sent: number }> = [];
    const now = Date.now();
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const entry = byDay.get(day) || { received: 0, sent: 0 };
      activity.push({ day, ...entry });
    }

    return c.json({ days, activity });
  } catch (error) {
    console.error('Get activity error:', error);
    return c.json({ error: 'Failed to get activity' }, 500);
  }
});

/**
 * Export the whole mailbox as mbox
 */
emails.get('/export/mbox', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const all = await db.listAllEmails();
    const parts: string[] = [];

    for (const email of all) {
      const rows = await db.getAttachmentsByEmailId(email.id);
      const attachments: Array<{ filename: string; content_type: string; base64: string }> = [];
      for (const row of rows) {
        const full = await db.getAttachment(row.id);
        if (!full) continue;
        const base64 = await loadAttachmentBase64(c.env.ATTACHMENTS, full);
        if (base64) {
          attachments.push({ filename: full.filename, content_type: full.content_type, base64 });
        }
      }
      const eml = buildEml(email, attachments)
        // mbox From-line escaping
        .replace(/\nFrom /g, '\n>From ');
      parts.push(`${mboxSeparator(email)}\r\n${eml}\r\n`);
    }

    return new Response(parts.join(''), {
      headers: {
        'Content-Type': 'application/mbox',
        'Content-Disposition': 'attachment; filename="qmail-export.mbox"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Export mbox error:', error);
    return c.json({ error: 'Failed to export mailbox' }, 500);
  }
});

/**
 * Create or update a draft
 */
emails.post('/drafts', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const body = await c.req.json<{
      id?: string;
      from: string;
      to?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      text?: string;
      html?: string;
    }>();

    if (!body.from) {
      return c.json({ error: 'from is required' }, 400);
    }

    const fields = {
      from_address: body.from,
      to_address: body.to || '',
      cc: body.cc || null,
      bcc: body.bcc || null,
      subject: body.subject || null,
      body_text: body.text || null,
      body_html: body.html || null,
    };

    if (body.id) {
      const existing = await db.getEmail(body.id);
      if (!existing || existing.type !== 'draft') {
        return c.json({ error: 'Draft not found' }, 404);
      }
      await db.updateEmailContent(body.id, fields);
      return c.json({ success: true, id: body.id });
    }

    const id = generateId();
    await db.createEmail({
      id,
      type: 'draft',
      ...fields,
      headers: null,
      raw_size: null,
      is_read: 1,
      is_starred: 0,
      mailgun_id: null,
    });

    return c.json({ success: true, id });
  } catch (error) {
    console.error('Save draft error:', error);
    return c.json({ error: 'Failed to save draft' }, 500);
  }
});

/**
 * Get a single email with attachments and its conversation
 */
emails.get('/:id', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const id = c.req.param('id');
    const email = await db.getEmail(id);

    if (!email) {
      return c.json({ error: 'Email not found' }, 404);
    }

    // Mark as read if it's a received email
    if (email.type === 'received' && !email.is_read) {
      await db.markAsRead(id);
      email.is_read = 1;
    }

    // Get attachments (without content for listing)
    const attachments = await db.getAttachmentsByEmailId(id);

    // Conversation: other messages in the same thread
    let thread: Array<Pick<Email, 'id' | 'type' | 'from_address' | 'to_address' | 'subject' | 'created_at' | 'is_read'>> = [];
    if (email.thread_id) {
      const threadEmails = await db.getEmailsByThread(email.thread_id);
      thread = threadEmails.map(t => ({
        id: t.id,
        type: t.type,
        from_address: t.from_address,
        to_address: t.to_address,
        subject: t.subject,
        created_at: t.created_at,
        is_read: t.is_read,
      }));
    }

    return c.json({
      ...email,
      attachments,
      thread,
    });
  } catch (error) {
    console.error('Get email error:', error);
    return c.json({ error: 'Failed to get email' }, 500);
  }
});

/**
 * Download an email as .eml
 */
emails.get('/:id/eml', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const id = c.req.param('id');
    const email = await db.getEmail(id);
    if (!email) {
      return c.json({ error: 'Email not found' }, 404);
    }

    const rows = await db.getAttachmentsByEmailId(id);
    const attachments: Array<{ filename: string; content_type: string; base64: string }> = [];
    for (const row of rows) {
      const full = await db.getAttachment(row.id);
      if (!full) continue;
      const base64 = await loadAttachmentBase64(c.env.ATTACHMENTS, full);
      if (base64) {
        attachments.push({ filename: full.filename, content_type: full.content_type, base64 });
      }
    }

    const eml = buildEml(email, attachments);
    const filename = sanitizeFilename(`${email.subject || 'email'}.eml`);

    return new Response(eml, {
      headers: {
        'Content-Type': 'message/rfc822',
        'Content-Disposition': contentDispositionAttachment(filename),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('EML export error:', error);
    return c.json({ error: 'Failed to export email' }, 500);
  }
});

/**
 * Get attachments for an email
 */
emails.get('/:id/attachments', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const id = c.req.param('id');
    const attachments = await db.getAttachmentsByEmailId(id);
    return c.json({ attachments });
  } catch (error) {
    console.error('Get attachments error:', error);
    return c.json({ error: 'Failed to get attachments' }, 500);
  }
});

/**
 * Download an attachment (from R2 or D1)
 */
emails.get('/:emailId/attachments/:attachmentId', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const emailId = c.req.param('emailId');
    const attachmentId = c.req.param('attachmentId');
    const attachment = await db.getAttachment(attachmentId);

    // The attachment must belong to the email in the URL
    if (!attachment || attachment.email_id !== emailId) {
      return c.json({ error: 'Attachment not found' }, 404);
    }

    const bytes = await loadAttachmentBytes(c.env.ATTACHMENTS, attachment);
    if (!bytes) {
      return c.json({ error: 'Attachment content unavailable' }, 404);
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': attachment.content_type,
        'Content-Disposition': contentDispositionAttachment(attachment.filename),
        'Content-Length': String(bytes.byteLength),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    console.error('Download attachment error:', error);
    return c.json({ error: 'Failed to download attachment' }, 500);
  }
});

/**
 * Send an email — immediately, or scheduled for later.
 * Also handles sending drafts, replies (threading), and forwards.
 */
emails.post('/send', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const body = await c.req.json<SendRequest>();

    const validationError = validateSendRequest(body);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    // Threading context for replies
    let inReplyTo: string | null = null;
    let threadId: string | null = null;
    if (body.replyToEmailId) {
      const original = await db.getEmail(body.replyToEmailId);
      if (original) {
        inReplyTo = original.message_id;
        threadId = original.thread_id || original.message_id || original.id;
      }
    }

    // Scheduling
    let scheduledAt: string | null = null;
    if (body.scheduleAt) {
      const when = new Date(body.scheduleAt);
      if (isNaN(when.getTime())) {
        return c.json({ error: 'Invalid schedule time' }, 400);
      }
      if (when.getTime() < Date.now() + 60 * 1000) {
        return c.json({ error: 'Schedule time must be at least a minute in the future' }, 400);
      }
      scheduledAt = sqliteDateTime(when);
    }

    // Create (or reuse a draft's) row in a pending state
    const type: EmailType = scheduledAt ? 'scheduled' : 'draft';
    let emailId: string;

    const fields = {
      from_address: body.from,
      to_address: body.to,
      cc: body.cc || null,
      bcc: body.bcc || null,
      subject: body.subject,
      body_text: body.text || null,
      body_html: body.html || null,
      scheduled_at: scheduledAt,
    };

    if (body.draftId) {
      const draft = await db.getEmail(body.draftId);
      if (!draft || (draft.type !== 'draft' && draft.type !== 'scheduled')) {
        return c.json({ error: 'Draft not found' }, 404);
      }
      emailId = draft.id;
      await db.updateEmailContent(emailId, fields);
      if (scheduledAt) {
        await db.setScheduled(emailId);
      }
    } else {
      emailId = generateId();
      await db.createEmail({
        id: emailId,
        type,
        ...fields,
        headers: null,
        raw_size: null,
        is_read: 1,
        is_starred: 0,
        in_reply_to: inReplyTo,
        thread_id: threadId,
        mailgun_id: null,
      });
    }

    // Store uploaded attachments
    if (body.attachments) {
      for (const att of body.attachments) {
        await storeAttachment(db, c.env.ATTACHMENTS, {
          emailId,
          filename: att.filename,
          contentType: att.contentType || 'application/octet-stream',
          bytes: base64ToBytes(att.content),
        });
      }
    }

    // Forward: copy the original message's attachments onto this one
    if (body.forwardOfEmailId) {
      const rows = await db.getAttachmentsByEmailId(body.forwardOfEmailId);
      for (const row of rows) {
        const full = await db.getAttachment(row.id);
        if (!full) continue;
        const bytes = await loadAttachmentBytes(c.env.ATTACHMENTS, full);
        if (bytes) {
          await storeAttachment(db, c.env.ATTACHMENTS, {
            emailId,
            filename: full.filename,
            contentType: full.content_type,
            bytes,
          });
        }
      }
    }

    // Scheduled: stop here, the cron delivers it
    if (scheduledAt) {
      return c.json({ success: true, id: emailId, scheduled: true, scheduledAt: body.scheduleAt });
    }

    // Immediate delivery
    const email = await db.getEmail(emailId);
    if (!email) {
      return c.json({ error: 'Failed to prepare email' }, 500);
    }

    try {
      const messageId = await deliverStoredEmail(db, c.env.ATTACHMENTS, email);
      await db.markEmailSent(emailId, messageId || null);
      await recordRecipientsAsContacts(db, email);
      return c.json({ success: true, id: emailId, messageId });
    } catch (sendError) {
      // Keep the content: demote to a failed draft instead of losing it
      await db.markSendFailed(emailId);
      const details = sendError instanceof Error ? sendError.message : 'Unknown error';
      return c.json({ error: 'Failed to send email — saved as draft', details }, 500);
    }
  } catch (error) {
    console.error('Send email error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: 'Failed to send email', details: errorMessage }, 500);
  }
});

/**
 * Mark email as read
 */
emails.post('/:id/read', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    await db.markAsRead(c.req.param('id'));
    return c.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return c.json({ error: 'Failed to mark as read' }, 500);
  }
});

/**
 * Mark email as unread
 */
emails.post('/:id/unread', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    await db.markAsUnread(c.req.param('id'));
    return c.json({ success: true });
  } catch (error) {
    console.error('Mark unread error:', error);
    return c.json({ error: 'Failed to mark as unread' }, 500);
  }
});

/**
 * Toggle star on email
 */
emails.post('/:id/star', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    await db.toggleStar(c.req.param('id'));
    return c.json({ success: true });
  } catch (error) {
    console.error('Toggle star error:', error);
    return c.json({ error: 'Failed to toggle star' }, 500);
  }
});

/**
 * Archive / unarchive
 */
emails.post('/:id/archive', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    await db.setArchived(c.req.param('id'), true);
    return c.json({ success: true });
  } catch (error) {
    console.error('Archive error:', error);
    return c.json({ error: 'Failed to archive' }, 500);
  }
});

emails.post('/:id/unarchive', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    await db.setArchived(c.req.param('id'), false);
    return c.json({ success: true });
  } catch (error) {
    console.error('Unarchive error:', error);
    return c.json({ error: 'Failed to unarchive' }, 500);
  }
});

/**
 * Replace labels on an email
 */
emails.put('/:id/labels', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const { labels } = await c.req.json<{ labels: string[] }>();
    if (!Array.isArray(labels) || labels.some(l => typeof l !== 'string')) {
      return c.json({ error: 'labels must be an array of strings' }, 400);
    }
    const normalized = [...new Set(labels.map(l => l.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
    await db.setLabels(c.req.param('id'), normalized);
    return c.json({ success: true, labels: normalized });
  } catch (error) {
    console.error('Set labels error:', error);
    return c.json({ error: 'Failed to set labels' }, 500);
  }
});

/**
 * Delete an email (D1 rows and R2 objects)
 */
emails.delete('/:id', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const id = c.req.param('id');
    const attachments = await db.getAttachmentsByEmailId(id);
    await deleteAttachmentObjects(c.env.ATTACHMENTS, attachments);
    await db.deleteEmail(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete email error:', error);
    return c.json({ error: 'Failed to delete email' }, 500);
  }
});

export default emails;
