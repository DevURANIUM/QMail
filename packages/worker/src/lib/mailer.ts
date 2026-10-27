import { BrevoAPI } from '@qmail/brevo-api';
import { DatabaseQueries, Email } from '../db/queries';
import { loadAttachmentBase64 } from './attachments';
import { generateId } from './utils';

/**
 * Shared Brevo delivery path, used by the send API route and the
 * scheduled-send cron. Loads attachments from storage and sets
 * threading headers when the message is a reply.
 */

export function parseEmailAddress(email: string): { name?: string; email: string } {
  const match = email.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: email.trim() };
}

/**
 * People you write to become contacts automatically. Never fatal.
 */
export async function recordRecipientsAsContacts(db: DatabaseQueries, email: Email): Promise<void> {
  try {
    const recipients = [email.to_address, email.cc, email.bcc]
      .filter((value): value is string => !!value)
      .map(value => parseEmailAddress(value));

    for (const recipient of recipients) {
      if (!recipient.email.includes('@')) continue;
      await db.upsertContact({
        id: generateId(),
        email: recipient.email,
        name: recipient.name ?? null,
      });
      await db.touchContactLastContacted(recipient.email);
    }
  } catch (error) {
    console.warn('Contact auto-capture failed:', error);
  }
}

/**
 * Send a stored email (draft or scheduled row) through Brevo.
 * Returns the Brevo message id.
 */
export async function deliverStoredEmail(
  db: DatabaseQueries,
  bucket: R2Bucket | undefined,
  email: Email
): Promise<string> {
  const brevoApiKey = await db.getSetting('brevo_api_key');
  if (!brevoApiKey) {
    throw new Error('Brevo not configured');
  }

  const brevo = new BrevoAPI({ apiKey: brevoApiKey });

  // Load attachments from R2/D1
  const rows = await db.getAttachmentsByEmailId(email.id);
  const attachments: Array<{ name: string; content: string; contentType?: string }> = [];
  for (const row of rows) {
    const full = await db.getAttachment(row.id);
    if (!full) continue;
    const content = await loadAttachmentBase64(bucket, full);
    if (content) {
      attachments.push({ name: full.filename, content, contentType: full.content_type });
    }
  }

  // Threading headers for replies
  const headers: Record<string, string> = {};
  if (email.in_reply_to) {
    headers['In-Reply-To'] = email.in_reply_to;
    headers['References'] = email.in_reply_to;
  }

  const result = await brevo.send({
    from: parseEmailAddress(email.from_address),
    to: [parseEmailAddress(email.to_address)],
    cc: email.cc ? [parseEmailAddress(email.cc)] : undefined,
    bcc: email.bcc ? [parseEmailAddress(email.bcc)] : undefined,
    subject: email.subject || '(No Subject)',
    text: email.body_text || undefined,
    html: email.body_html || undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });

  return result.messageId;
}
