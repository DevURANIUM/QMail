import PostalMime from 'postal-mime';
import { DatabaseQueries } from './db/queries';

export interface Env {
  DB: D1Database;
}

// Max attachment size: 5MB (D1 has row size limits)
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Handles incoming emails via Cloudflare Email Workers
 * Parses the email, stores it in D1, and forwards to destination
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

    // Store the email in D1
    await db.createEmail({
      id,
      type: 'received',
      // message.from is the SMTP envelope sender and is often a bounce address.
      // Prefer the user-visible From header parsed from the message itself.
      from_address: parsed.from?.address
        ? (parsed.from.name ? `${parsed.from.name} <${parsed.from.address}>` : parsed.from.address)
        : message.from,
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
      mailgun_id: null,
    });

    // Store attachments
    if (parsed.attachments && parsed.attachments.length > 0) {
      for (const attachment of parsed.attachments) {
        const attachmentBytes = typeof attachment.content === 'string'
          ? new TextEncoder().encode(attachment.content)
          : new Uint8Array(attachment.content);
        // Skip attachments that are too large
        if (attachmentBytes.byteLength > MAX_ATTACHMENT_SIZE) {
          console.warn(`Skipping attachment ${attachment.filename}: too large (${attachmentBytes.byteLength} bytes)`);
          continue;
        }

        const attachmentId = crypto.randomUUID();
        const content = uint8ArrayToBase64(attachmentBytes);

        await db.createAttachment({
          id: attachmentId,
          email_id: id,
          filename: attachment.filename || 'unnamed',
          content_type: attachment.mimeType || 'application/octet-stream',
          size: attachmentBytes.byteLength,
          content,
        });

        console.log(`Attachment saved: ${attachment.filename} (${attachmentBytes.byteLength} bytes)`);
      }
    }

    // Get the destination email from settings
    const destinationEmail = await db.getSetting('destination_email');

    // Forward the email to the destination if configured
    if (destinationEmail) {
      await message.forward(destinationEmail);
    }

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
