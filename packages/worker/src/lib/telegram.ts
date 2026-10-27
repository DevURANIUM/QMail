import type { DatabaseQueries } from '../db/queries';

export function validateTelegramConfig(token: string, chatId: string): string | null {
  if (!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token)) return 'Enter a valid bot token from @BotFather.';
  if (!/^[1-9]\d{0,15}$/.test(chatId)) return 'Enter the positive numeric Telegram user ID of the recipient.';
  return null;
}

export function telegramChunks(text: string): string[] {
  // Count UTF-16 units conservatively and never split a surrogate pair.
  const chunks: string[] = [];
  let chunk = '';
  for (const character of text) {
    if (chunk.length + character.length > 4000) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const invalid = validateTelegramConfig(token, chatId);
  if (invalid) throw new Error(invalid);
  for (const chunk of telegramChunks(text)) {
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk, protect_content: true, link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // Fetch errors can contain the request URL (and therefore the bot token).
      throw new Error('Telegram could not be reached. Please try again.');
    }
    const data = await response.json().catch(() => null) as { ok?: boolean } | null;
    if (!response.ok || !data?.ok) {
      if (response.status === 429) throw new Error('Telegram rate limit reached. Please try again later.');
      if (response.status === 401 || response.status === 404) throw new Error('Telegram rejected the bot token. Check it in @BotFather.');
      throw new Error('Telegram delivery failed. Check the user ID and ask the recipient to start the bot and unblock it.');
    }
  }
}

export async function notifyTelegram(db: DatabaseQueries, email: {
  from: string; to: string; subject: string; text?: string; attachmentCount: number;
}): Promise<void> {
  try {
    if (await db.getSetting('telegram_enabled') !== 'true') return;
    const token = await db.getSetting('telegram_bot_token') || '';
    const chatId = await db.getSetting('telegram_chat_id') || '';
    // Bound delivery work for exceptionally large emails; the complete email stays in the inbox.
    const body = email.text || '(No plain-text body. Open Qmail to view the HTML email.)';
    const excerpt = body.length > 24000 ? `${body.slice(0, 24000)}\n\n[Message shortened. Read the full email in Qmail.]` : body;
    await sendTelegramMessage(token, chatId,
      `New email · Qmail\nFrom: ${email.from.slice(0, 320)}\nTo: ${email.to.slice(0, 320)}\nSubject: ${email.subject.slice(0, 500)}\nAttachments: ${email.attachmentCount} (available in Qmail)\n\n${excerpt}`);
    await db.setSetting('telegram_last_delivery', new Date().toISOString());
    await db.setSetting('telegram_last_error', '');
  } catch (error) {
    // Delivery is best-effort and must never reject an already stored email.
    const safeError = error instanceof Error && !error.message.includes('https:') ? error.message : 'Telegram notification failed.';
    try { await db.setSetting('telegram_last_error', safeError); } catch { /* Mail storage must remain independent. */ }
    console.warn('Telegram notification failed; email remains available in Qmail.');
  }
}
