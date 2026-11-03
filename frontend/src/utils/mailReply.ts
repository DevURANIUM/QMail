import type { Email } from '@/api/types';

export function mailboxAddress(value: string): string {
  return (value.match(/<([^<>]+)>/)?.[1] || value.split(',')[0]).trim();
}

export function replyRecipient(email: Pick<Email, 'type' | 'to_address' | 'from_address' | 'headers'>): string {
  if (email.type === 'sent') return mailboxAddress(email.to_address);
  try {
    const headers: unknown = JSON.parse(email.headers || '[]');
    if (Array.isArray(headers)) {
      const header = headers.find(value => typeof value?.key === 'string' && value.key.toLowerCase() === 'reply-to');
      if (typeof header?.value === 'string' && !/[\r\n]/.test(header.value)) {
        const address = mailboxAddress(header.value);
        if (/^[^\s@<>]+@[^\s@<>]+$/.test(address)) return address;
      }
    }
  } catch { /* Older stored messages may not have structured headers. */ }
  return mailboxAddress(email.from_address);
}

/** Recover the app's trailing reply quote when reopening a saved draft. */
export function splitReplyQuote(text: string): { body: string; header: string; quote: string } | null {
  const match = /\n\n(On [^\n]+ wrote:)\n((?:>[^\n]*(?:\n|$))+)$/.exec(text);
  if (!match) return null;
  return {
    body: text.slice(0, match.index),
    header: match[1],
    quote: match[2].split('\n').map(line => line.replace(/^> ?/, '')).join('\n'),
  };
}
