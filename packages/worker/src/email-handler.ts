import PostalMime from 'postal-mime';
import { DatabaseQueries } from './db/queries';
import { storeAttachment, maxAttachmentSize } from './lib/attachments';
import { notifyAllSubscriptions } from './lib/push';
import { notifyTelegram } from './lib/telegram';

export interface Env {
  DB: D1Database;
  ATTACHMENTS?: R2Bucket;
}

/**
 * Determine the conversation (thread) id for an incoming message.
 * A reply joins the thread of the message it references; otherwise the
 * message starts a new thread keyed by its own Message-ID (or row id).
 */
async function resolveThreadId(
  db: DatabaseQueries,
  messageId: string | null,
  inReplyTo: string | null,
  references: string[],
  fallbackId: string
): Promise<string> {
  const candidates = [inReplyTo, ...references.slice().reverse()].filter((c): c is string => !!c);
  for (const candidate of candidates) {
    const referenced = await db.getEmailByMessageId(candidate);
    if (referenced?.thread_id) {
      return referenced.thread_id;
    }
  }
  return messageId || fallbackId;
}

/**
 * Handles incoming emails via Cloudflare Email Workers
 * Parses the email, stores it in D1 (attachments in R2), and forwards to destination
 */
export async function handleEmail(
  message: ForwardableEmailMessage,
  env: Env
): Promise<void> {
  const db = new DatabaseQueries(env.DB);

  try {
    // Get the raw email content
    const rawEmail = await new Response(message.raw).arrayBuffer();
    const rawEmailUint8 = new Uint8Array(rawEmail);

    // Parse the email using postal-mime
    const parser = new PostalMime();
    const parsed = await parser.parse(rawEmailUint8);

    // Generate a unique ID
    const id = crypto.randomUUID();

    // Extract headers as JSON string
    const headers = JSON.stringify(parsed.headers);

    // Threading
    const messageId = parsed.messageId || null;
    const inReplyTo = parsed.inReplyTo?.trim() || null;
    const references = (parsed.references || '').split(/\s+/).filter(Boolean);
    const threadId = await resolveThreadId(db, messageId, inReplyTo, references, id);

    // Store the email in D1
    await db.createEmail({
      id,
      type: 'received',
      from_address: message.from,
      to_address: message.to,
      cc: parsed.cc?.map(c => c.address).join(', ') || null,
      bcc: null,
      subject: parsed.subject || '(No Subject)',
      body_text: parsed.text || null,
      body_html: parsed.html || null,
      headers,
      raw_size: rawEmail.byteLength,
      is_read: 0,
      is_starred: 0,
      message_id: messageId,
      in_reply_to: inReplyTo,
      thread_id: threadId,
      mailgun_id: null,
    });

    // Store attachments (R2 when configured, D1 inline otherwise)
    const sizeLimit = maxAttachmentSize(env.ATTACHMENTS);
    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const attachment of parsed.attachments) {
        // postal-mime may deliver text attachments as strings
        const data: Uint8Array = typeof attachment.content === 'string'
          ? new TextEncoder().encode(attachment.content)
          : new Uint8Array(attachment.content);

        if (data.byteLength > sizeLimit) {
          console.warn(`Skipping attachment ${attachment.filename}: too large (${data.byteLength} bytes)`);
          continue;
        }

        await storeAttachment(db, env.ATTACHMENTS, {
          emailId: id,
          filename: attachment.filename || 'unnamed',
          contentType: attachment.mimeType || 'application/octet-stream',
          bytes: data,
        });
      }
    }

    await notifyTelegram(db, {
      from: message.from, to: message.to, subject: parsed.subject || '(No Subject)',
      text: parsed.text, attachmentCount: parsed.attachments?.length || 0,
    });

    // Get the destination email from settings
    const destinationEmail = await db.getSetting('destination_email');

    // Forward the email to the destination if configured
    if (destinationEmail) {
      await message.forward(destinationEmail);
    }

    // Fire a web push notification to registered devices (never fatal)
    await notifyAllSubscriptions(db);

    console.log(`Email received and stored: ${id} from ${message.from} to ${message.to} with ${parsed.attachments?.length || 0} attachments`);
  } catch (error) {
    console.error('Error handling email:', error);
    // Re-throw to let Cloudflare know the email wasn't processed
    throw error;
  }
}

/**
 * Email event handler for Cloudflare Workers
 */
export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    await handleEmail(message, env);
  },
};
