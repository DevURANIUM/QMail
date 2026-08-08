import type { Email } from '@/api/types';

type StoredHeader = { key?: string; name?: string; value?: string };

export function headerValue(email: Email, name: string): string | null {
  if (!email.headers) return null;
  try {
    const headers = JSON.parse(email.headers) as StoredHeader[];
    return headers.find(header => (header.key || header.name)?.toLowerCase() === name.toLowerCase())?.value || null;
  } catch {
    return null;
  }
}

export function displaySender(email: Email): string {
  const headerSender = headerValue(email, 'from');
  const isEnvelopeAddress = /(?:bounces|identity-reachout)\.[^@]+/i.test(email.from_address);
  return isEnvelopeAddress && headerSender ? headerSender : email.from_address;
}

export function senderAddress(email: Email): string {
  const sender = displaySender(email);
  return sender.match(/<([^>]+)>/)?.[1] || sender;
}

export function senderName(email: Email): string {
  const sender = displaySender(email);
  const name = sender.replace(/<[^>]+>/, '').trim().replace(/^"|"$/g, '');
  return name && name !== senderAddress(email) ? name : senderAddress(email).split('@')[0];
}
