import { DatabaseQueries, Attachment } from '../db/queries';
import { generateId, sanitizeFilename } from './utils';

/**
 * Attachment storage: R2 when the ATTACHMENTS bucket is bound, inline
 * base64 in D1 otherwise. Reads handle both so legacy rows keep working.
 */

// D1 rows are size-limited; R2 objects are not (we cap generously)
export const MAX_INLINE_ATTACHMENT_SIZE = 5 * 1024 * 1024;   // 5MB in D1
export const MAX_R2_ATTACHMENT_SIZE = 25 * 1024 * 1024;      // 25MB in R2

export function maxAttachmentSize(bucket: R2Bucket | undefined): number {
  return bucket ? MAX_R2_ATTACHMENT_SIZE : MAX_INLINE_ATTACHMENT_SIZE;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(content: string): Uint8Array {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Persist attachment bytes and its metadata row.
 */
export async function storeAttachment(
  db: DatabaseQueries,
  bucket: R2Bucket | undefined,
  input: {
    emailId: string;
    filename: string;
    contentType: string;
    bytes: Uint8Array;
  }
): Promise<string> {
  const id = generateId();
  const filename = sanitizeFilename(input.filename);

  if (bucket) {
    const key = `attachments/${input.emailId}/${id}`;
    await bucket.put(key, input.bytes.slice().buffer, {
      httpMetadata: { contentType: input.contentType },
    });
    await db.createAttachment({
      id,
      email_id: input.emailId,
      filename,
      content_type: input.contentType,
      size: input.bytes.byteLength,
      content: null,
      r2_key: key,
    });
  } else {
    await db.createAttachment({
      id,
      email_id: input.emailId,
      filename,
      content_type: input.contentType,
      size: input.bytes.byteLength,
      content: uint8ToBase64(input.bytes),
      r2_key: null,
    });
  }

  return id;
}

/**
 * Load attachment bytes from wherever they live.
 */
export async function loadAttachmentBytes(
  bucket: R2Bucket | undefined,
  attachment: Pick<Attachment, 'content' | 'r2_key'>
): Promise<Uint8Array | null> {
  if (attachment.r2_key && bucket) {
    const object = await bucket.get(attachment.r2_key);
    if (!object) return null;
    return new Uint8Array(await object.arrayBuffer());
  }
  if (attachment.content) {
    return base64ToUint8(attachment.content);
  }
  return null;
}

export async function loadAttachmentBase64(
  bucket: R2Bucket | undefined,
  attachment: Pick<Attachment, 'content' | 'r2_key'>
): Promise<string | null> {
  if (attachment.content) return attachment.content;
  const bytes = await loadAttachmentBytes(bucket, attachment);
  return bytes ? uint8ToBase64(bytes) : null;
}

/**
 * Delete the R2 objects belonging to an email's attachments (row deletion
 * happens separately in D1). Safe to call without a bucket.
 */
export async function deleteAttachmentObjects(
  bucket: R2Bucket | undefined,
  attachments: Array<Pick<Attachment, 'r2_key'>>
): Promise<void> {
  if (!bucket) return;
  const keys = attachments.map(a => a.r2_key).filter((k): k is string => !!k);
  if (keys.length > 0) {
    await bucket.delete(keys);
  }
}
