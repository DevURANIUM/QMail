import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Use the installed workspace compiler, including copied pnpm checkouts with missing links.
let ts;
try { ts = require('typescript'); } catch {
  const root = new URL('../../node_modules/.pnpm/', import.meta.url);
  const version = fs.readdirSync(root).find(name => name.startsWith('typescript@'));
  ts = require(new URL(`${version}/node_modules/typescript/lib/typescript.js`, root).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
}
const source = fs.readFileSync(new URL('./src/lib/telegram.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 } }).outputText;
const { validateTelegramConfig, telegramChunks, sendTelegramMessage, notifyTelegram } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const token = `123456789:${'a'.repeat(35)}`;
const originalFetch = globalThis.fetch;

test('accepts only a bot token and private positive numeric user ID', () => {
  assert.equal(validateTelegramConfig(token, '123456789'), null);
  for (const id of ['-1001234', '@someone', '0', '1.5', '', '123\n']) assert.ok(validateTelegramConfig(token, id));
  for (const value of ['', '********', '123/path:bad']) assert.ok(validateTelegramConfig(value, '123'));
});
test('chunks preserve Persian, emoji and text exactly within Telegram limits', () => {
  const text = 'سلام 👋\n'.repeat(2000);
  const chunks = telegramChunks(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 4000 && !/[\uD800-\uDBFF]$/.test(chunk)));
});
test('sends plain text with previews disabled and content protection', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return Response.json({ ok: true }); };
  try {
    await sendTelegramMessage(token, '123', '<b>not markup</b>' + 'x'.repeat(5000));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.chat_id, '123');
    assert.equal(calls[0].body.parse_mode, undefined);
    assert.equal(calls[0].body.protect_content, true);
    assert.equal(calls[0].body.link_preview_options.is_disabled, true);
    assert.match(calls[0].url, /^https:\/\/api.telegram.org\/bot/);
  } finally { globalThis.fetch = originalFetch; }
});
test('network failures never expose token or URL', async () => {
  globalThis.fetch = async () => { throw new Error(`Failed https://api.telegram.org/bot${token}`); };
  try { await assert.rejects(sendTelegramMessage(token, '123', 'test'), error => !error.message.includes(token) && !error.message.includes('https:')); }
  finally { globalThis.fetch = originalFetch; }
});
test('Telegram API failure is reported safely', async () => {
  globalThis.fetch = async () => Response.json({ ok: false }, { status: 403 });
  try { await assert.rejects(sendTelegramMessage(token, '123', 'test'), /start the bot/); }
  finally { globalThis.fetch = originalFetch; }
});
test('disabled notifications do not send; failed delivery does not reject email', async () => {
  const values = { telegram_enabled: 'false', telegram_bot_token: token, telegram_chat_id: '123' };
  const db = { getSetting: async key => values[key], setSetting: async (key, value) => { values[key] = value; } };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ ok: false }, { status: 429 }); };
  try {
    const email = { from: 'a@example.com', to: 'b@example.com', subject: 'Hello', text: 'سلام', attachmentCount: 1 };
    await notifyTelegram(db, email);
    assert.equal(calls, 0);
    values.telegram_enabled = 'true';
    await assert.doesNotReject(notifyTelegram(db, email));
    assert.match(values.telegram_last_error, /rate limit/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
