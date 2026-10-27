import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

test('install prompt is captured before the install component mounts and cleared on install', async () => {
  const listeners = {};
  const context = { exports: {}, require: () => ({ ref: value => ({ value }) }), window: {
    addEventListener: (name, callback) => { listeners[name] = callback; },
  } };
  const source = fs.readFileSync(new URL('./src/pwa.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  let prevented = false;
  const event = { preventDefault: () => { prevented = true; } };
  listeners.beforeinstallprompt(event);
  assert.equal(prevented, true);
  assert.equal(context.exports.deferredPrompt.value, event);
  listeners.appinstalled();
  assert.equal(context.exports.deferredPrompt.value, null);
});
const manifest = JSON.parse(fs.readFileSync(new URL('./public/manifest.webmanifest', import.meta.url)));
function worker(fetcher) {
  const handlers = {};
  const cached = [];
  const offline = new Response('offline page');
  const context = {
    self: { location: { origin: 'https://qmail.test' }, addEventListener: (name, callback) => { handlers[name] = callback; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async () => ({ add: async url => cached.push(url) }), keys: async () => [], match: async () => offline },
    fetch: fetcher, URL, Response,
  };
  vm.runInNewContext(fs.readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8'), context);
  return { handlers, cached };
}
test('manifest identifies standalone Qmail and provides real PNG icons', () => {
  assert.equal(manifest.name, 'Qmail');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.id, '/');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}`);
    assert.ok(icon);
    const png = fs.readFileSync(new URL(`./public${icon.src}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
test('install caches only public offline document', async () => {
  const { handlers, cached } = worker(fetch);
  let pending;
  handlers.install({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(cached, ['/offline.html']);
});
test('API, cross-origin and non-navigation requests bypass cache handler', () => {
  const { handlers } = worker(fetch);
  for (const request of [
    { url: 'https://qmail.test/api/emails', mode: 'navigate', method: 'GET' },
    { url: 'https://qmail.test/api', mode: 'navigate', method: 'GET' },
    { url: 'https://other.test/', mode: 'navigate', method: 'GET' },
    { url: 'https://qmail.test/assets/app.js', mode: 'cors', method: 'GET' },
    { url: 'https://qmail.test/', mode: 'navigate', method: 'POST' },
  ]) handlers.fetch({ request, respondWith: () => assert.fail('Must not intercept') });
});
test('failed navigation returns offline fallback, successful navigation remains network-only', async () => {
  for (const connected of [false, true]) {
    const { handlers } = worker(async () => { if (!connected) throw Error('offline'); return new Response('network'); });
    let response;
    handlers.fetch({ request: { url: 'https://qmail.test/inbox', mode: 'navigate', method: 'GET' }, respondWith: promise => { response = promise; } });
    assert.equal(await (await response).text(), connected ? 'network' : 'offline page');
  }
});
