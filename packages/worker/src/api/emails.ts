import { Hono } from 'hono';
import { DatabaseQueries } from '../db/queries';
import { BrevoAPI } from '@qmail/brevo-api';
import { generateId } from '../lib/utils';

export interface Env {
  DB: D1Database;
}

const emails = new Hono<{ Bindings: Env }>();

/**
 * List emails
 */
emails.get('/', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const type = c.req.query('type') as 'received' | 'sent' | undefined;
    const requestedLimit = Number.parseInt(c.req.query('limit') || '50', 10);
    const requestedOffset = Number.parseInt(c.req.query('offset') || '0', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
    const unreadOnly = c.req.query('unread') === 'true';
    const starredOnly = c.req.query('starred') === 'true';

    const emailList = await db.listEmails(type, {
      limit,
      offset,
      unreadOnly,
      starredOnly,
    });

    return c.json({
      emails: emailList,
      pagination: {
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('List emails error:', error);
    return c.json({ error: 'Failed to list emails' }, 500);
  }
});

/**
 * Get email statistics
 */
emails.get('/stats', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const stats = await db.getEmailStats();
    return c.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    return c.json({ error: 'Failed to get stats' }, 500);
  }
});

/** Apply an action to a bounded set of emails. */
emails.post('/bulk', async (c) => {
  const db = new DatabaseQueries(c.env.DB);
  try {
    const body = await c.req.json<{ ids?: unknown; action?: unknown }>();
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : [];
    if (body.action === 'read-all') {
      await db.markAllReceivedAsRead();
      return c.json({ success: true, affected: ids.length });
    }
    if (ids.length === 0 || ids.length > 100) {
      return c.json({ error: 'Select between 1 and 100 emails' }, 400);
    }
    if (body.action === 'read' || body.action === 'unread') {
      await db.markManyAsRead(ids, body.action === 'read');
    } else if (body.action === 'delete') {
      await db.deleteManyEmails(ids);
    } else {
      return c.json({ error: 'Invalid bulk action' }, 400);
    }
    return c.json({ success: true, affected: ids.length });
  } catch (error) {
    console.error('Bulk email action error:', error);
    return c.json({ error: 'Failed to update emails' }, 500);
  }
});

/**
 * Get a single email with attachments
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

    return c.json({
      ...email,
      attachments,
    });
  } catch (error) {
    console.error('Get email error:', error);
    return c.json({ error: 'Failed to get email' }, 500);
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
 * Download an attachment
 */
emails.get('/:emailId/attachments/:attachmentId', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const emailId = c.req.param('emailId');
    const attachmentId = c.req.param('attachmentId');
    const attachment = await db.getAttachment(attachmentId);

    if (!attachment || attachment.email_id !== emailId) {
      return c.json({ error: 'Attachment not found' }, 404);
    }

    // Decode base64 content
    const binaryString = atob(attachment.content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': attachment.content_type,
        'Content-Disposition': `attachment; filename="${attachment.filename.replace(/["\r\n]/g, '_')}"`,
        'Content-Length': String(attachment.size),
      },
    });
  } catch (error) {
    console.error('Download attachment error:', error);
    return c.json({ error: 'Failed to download attachment' }, 500);
  }
});

/**
 * Send an email with optional attachments
 */
emails.post('/send', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const body = await c.req.json<{
      from: string;
      to: string;
      cc?: string;
      bcc?: string;
      subject: string;
      text?: string;
      html?: string;
      replyTo?: string;
      attachments?: Array<{
        filename: string;
        content: string; // Base64 encoded
        contentType?: string;
      }>;
    }>();

    // Validate required fields
    if (!body.from || !body.to || !body.subject) {
      return c.json({ error: 'from, to, and subject are required' }, 400);
    }

    if (!body.text && !body.html) {
      return c.json({ error: 'Either text or html body is required' }, 400);
    }

    // Get Brevo settings
    const brevoApiKey = await db.getSetting('brevo_api_key');

    if (!brevoApiKey) {
      return c.json({ error: 'Brevo not configured' }, 400);
    }

    // Initialize Brevo client
    const brevo = new BrevoAPI({
      apiKey: brevoApiKey,
    });

    // Parse email addresses
    const parseEmail = (email: string) => {
      const match = email.match(/^(.+?)\s*<(.+?)>$/);
      if (match) {
        return { name: match[1].trim(), email: match[2].trim() };
      }
      return { email: email.trim() };
    };

    // Prepare attachments for Brevo API
    const brevoAttachments = body.attachments?.map(att => ({
      name: att.filename,
      content: att.content,
      contentType: att.contentType,
    }));

    // Send the email
    const result = await brevo.send({
      from: parseEmail(body.from),
      to: [parseEmail(body.to)],
      cc: body.cc ? [parseEmail(body.cc)] : undefined,
      bcc: body.bcc ? [parseEmail(body.bcc)] : undefined,
      subject: body.subject,
      text: body.text,
      html: body.html,
      replyTo: body.replyTo ? parseEmail(body.replyTo) : undefined,
      attachments: brevoAttachments,
    });

    // Store the sent email
    const emailId = generateId();
    await db.createEmail({
      id: emailId,
      type: 'sent',
      from_address: body.from,
      to_address: body.to,
      cc: body.cc || null,
      bcc: body.bcc || null,
      subject: body.subject,
      body_text: body.text || null,
      body_html: body.html || null,
      headers: null,
      raw_size: null,
      is_read: 1,
      is_starred: 0,
      mailgun_id: result.messageId || null,
    });

    // Store attachments for sent emails too
    if (body.attachments && body.attachments.length > 0) {
      for (const att of body.attachments) {
        const attachmentId = generateId();
        // Calculate size from base64 (base64 is ~4/3 of original size)
        const size = Math.floor(att.content.length * 3 / 4);
        await db.createAttachment({
          id: attachmentId,
          email_id: emailId,
          filename: att.filename,
          content_type: att.contentType || 'application/octet-stream',
          size,
          content: att.content,
        });
      }
    }

    return c.json({
      success: true,
      id: emailId,
      messageId: result.messageId,
    });
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
    const id = c.req.param('id');
    await db.markAsRead(id);
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
    const id = c.req.param('id');
    await db.markAsUnread(id);
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
    const id = c.req.param('id');
    await db.toggleStar(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Toggle star error:', error);
    return c.json({ error: 'Failed to toggle star' }, 500);
  }
});

/**
 * Delete an email
 */
emails.delete('/:id', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const id = c.req.param('id');
    await db.deleteEmail(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete email error:', error);
    return c.json({ error: 'Failed to delete email' }, 500);
  }
});

export default emails;
