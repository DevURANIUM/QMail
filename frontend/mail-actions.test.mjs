import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const context = { exports: {}, require: name => dependencies[name], console };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, context);
  return context.exports;
}
const { replyRecipient, splitReplyQuote } = load('./src/utils/mailReply.ts');
test('reply to a sent email targets its recipient; incoming mail honors Reply-To', () => {
  assert.equal(replyRecipient({ type: 'sent', to_address: 'Recipient <recipient@example.com>', from_address: 'me@example.com', headers: null }), 'recipient@example.com');
  assert.equal(replyRecipient({ type: 'received', from_address: 'sender@example.com', headers: JSON.stringify([{ key: 'Reply-To', value: 'Support <support@example.com>' }]) }), 'support@example.com');
  assert.equal(replyRecipient({ type: 'received', from_address: 'sender@example.com', headers: 'bad json' }), 'sender@example.com');
  assert.equal(replyRecipient({ type: 'received', from_address: 'sender@example.com', headers: JSON.stringify([{ key: 'reply-to', value: 'x@example.com\r\nBcc: hidden@example.com' }]) }), 'sender@example.com');
});
test('bulk deletion deduplicates, bounds concurrency, retains failures and refreshes stats once', async () => {
  let active = 0, maxActive = 0, statsCalls = 0;
  const calls = [];
  const store = load('./src/stores/emails.ts', {
    pinia: { defineStore: (_, setup) => setup },
    vue: { ref: value => ({ value }), computed: callback => ({ get value() { return callback(); } }) },
    '@/api/client': { default: {
      deleteEmail: async id => { calls.push(id); active++; maxActive = Math.max(active, maxActive); await new Promise(resolve => setTimeout(resolve, 1)); active--; if (id === 'failed') throw Error('Delete failed'); },
      getEmailStats: async () => { statsCalls++; return {}; },
    } },
  }).useEmailsStore();
  const ids = ['one','two','three','four','five','six','failed'];
  store.emails.value = ids.map(id => ({ id }));
  store.currentEmail.value = { id: 'one' };
  const result = await store.deleteEmails([...ids, 'one']);
  assert.equal(calls.length, ids.length);
  assert.ok(maxActive <= 5);
  assert.equal(statsCalls, 1);
  assert.deepEqual(Array.from(result.failed), ['failed']);
  assert.equal(store.currentEmail.value, null);
  assert.deepEqual(Array.from(store.emails.value, value => value.id), ['failed']);
});

test('saved reply quotes reopen separately without changing authored text', () => {
  const split = splitReplyQuote('پاسخ جدید\n\nOn 11/3/2026, sender@example.com wrote:\n> سلام\n> \n> Original');
  assert.equal(split.body, 'پاسخ جدید');
  assert.equal(split.quote, 'سلام\n\nOriginal');
  assert.equal(split.header, 'On 11/3/2026, sender@example.com wrote:');
  assert.equal(splitReplyQuote('Ordinary message\n> a quoted line'), null);
});
