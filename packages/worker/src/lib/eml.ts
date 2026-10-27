import { Email, Attachment } from '../db/queries';

/**
 * Build an RFC 5322 message (.eml) from a stored email.
 * Attachment contents are provided pre-loaded as base64.
 */

function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\r\n\x00]/g, ' ');
  // Encode non-ASCII per RFC 2047
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(clean)));
  return `=?UTF-8?B?${b64}?=`;
}

function wrapBase64(content: string): string {
  return content.replace(/(.{76})/g, '$1\r\n');
}

function toUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function buildEml(
  email: Email,
  attachments: Array<Pick<Attachment, 'filename' | 'content_type'> & { base64: string }>
): string {
  const lines: string[] = [];
  const date = new Date(email.created_at.includes('T') ? email.created_at : `${email.created_at.replace(' ', 'T')}Z`);
  const mixedBoundary = `qmail-mixed-${email.id}`;
  const altBoundary = `qmail-alt-${email.id}`;

  lines.push(`From: ${encodeHeaderValue(email.from_address)}`);
  lines.push(`To: ${encodeHeaderValue(email.to_address)}`);
  if (email.cc) lines.push(`Cc: ${encodeHeaderValue(email.cc)}`);
  lines.push(`Subject: ${encodeHeaderValue(email.subject || '(No Subject)')}`);
  lines.push(`Date: ${date.toUTCString()}`);
  if (email.message_id) lines.push(`Message-ID: ${encodeHeaderValue(email.message_id)}`);
  if (email.in_reply_to) lines.push(`In-Reply-To: ${encodeHeaderValue(email.in_reply_to)}`);
  lines.push('MIME-Version: 1.0');

  const hasAttachments = attachments.length > 0;
  const hasBoth = !!email.body_text && !!email.body_html;

  const bodyParts: string[] = [];

  function pushBody(target: string[]) {
    if (hasBoth) {
      target.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      target.push('');
      target.push(`--${altBoundary}`);
      target.push('Content-Type: text/plain; charset=utf-8');
      target.push('Content-Transfer-Encoding: base64');
      target.push('');
      target.push(wrapBase64(toUtf8Base64(email.body_text || '')));
      target.push(`--${altBoundary}`);
      target.push('Content-Type: text/html; charset=utf-8');
      target.push('Content-Transfer-Encoding: base64');
      target.push('');
      target.push(wrapBase64(toUtf8Base64(email.body_html || '')));
      target.push(`--${altBoundary}--`);
    } else {
      const isHtml = !!email.body_html;
      target.push(`Content-Type: text/${isHtml ? 'html' : 'plain'}; charset=utf-8`);
      target.push('Content-Transfer-Encoding: base64');
      target.push('');
      target.push(wrapBase64(toUtf8Base64(email.body_html || email.body_text || '')));
    }
  }

  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    lines.push('');
    lines.push(`--${mixedBoundary}`);
    pushBody(bodyParts);
    lines.push(...bodyParts);
    for (const att of attachments) {
      lines.push(`--${mixedBoundary}`);
      lines.push(`Content-Type: ${att.content_type}; name="${encodeHeaderValue(att.filename)}"`);
      lines.push(`Content-Disposition: attachment; filename="${encodeHeaderValue(att.filename)}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push('');
      lines.push(wrapBase64(att.base64));
    }
    lines.push(`--${mixedBoundary}--`);
  } else {
    pushBody(lines);
  }

  return lines.join('\r\n') + '\r\n';
}

/**
 * mbox "From " separator line for an email.
 */
export function mboxSeparator(email: Email): string {
  const date = new Date(email.created_at.includes('T') ? email.created_at : `${email.created_at.replace(' ', 'T')}Z`);
  return `From MAILER-DAEMON ${date.toUTCString()}`;
}
