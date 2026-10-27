import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('./src/utils/textDirection.ts', import.meta.url), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const direction = context.exports.textDirection;

test('Persian, Arabic and Hebrew choose RTL, ignoring numbers and punctuation', () => {
  for (const value of ['سلام و وقت بخیر', '۱۲۳ - گزارش امنیتی', '2026: مرحبا', 'שלום']) assert.equal(direction(value), 'rtl');
});
test('reply prefixes preserve the original subject direction', () => {
  assert.equal(direction('Re: Fwd: گزارش امنیتی'), 'rtl');
  assert.equal(direction('Re: Project update'), 'ltr');
});
test('English, addresses and empty input retain LTR', () => {
  for (const value of ['', '123', 'Hello سلام', 'security@example.com']) assert.equal(direction(value), 'ltr');
});
