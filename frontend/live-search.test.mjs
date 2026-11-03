import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const vue = require('vue');
const { parse, compileScript } = require('vue/compiler-sfc');
function searchComponent(name) {
  const descriptor = parse(fs.readFileSync(new URL(`./src/views/${name}.vue`, import.meta.url), 'utf8')).descriptor;
  const code = ts.transpileModule(compileScript(descriptor, { id: 'search-test' }).content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const timers = new Map(), requests = [], unmount = [];
  let counter = 0;
  const context = { exports: {}, setTimeout: callback => { const id = ++counter; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id),
    require: name => ({
      vue: { ...vue, onMounted() {}, onUnmounted: callback => unmount.push(callback) },
      'vue-router': { useRouter: () => ({ replace: async () => {}, push() {} }), useRoute: () => ({ query: {} }) },
      '@/stores/emails': { useEmailsStore: () => ({ sent: [], inbox: [] }) },
      '@/api/client': { default: { searchEmails: query => new Promise(resolve => requests.push({ query, resolve })) } },
    })[name] || { default: {} },
  };
  vm.runInNewContext(code, context);
  const scope = vue.effectScope();
  const state = scope.run(() => context.exports.default.setup({}, { expose() {} }));
  return { state, requests, timers, fire() { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); }, stop() { unmount.forEach(callback => callback()); scope.stop(); } };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
for (const view of ['Sent', 'Inbox']) {
  test(`${view}: typing is debounced; older responses and cleared queries cannot overwrite results`, async () => {
    const app = searchComponent(view);
    try {
      app.state.searchQuery.value = 'a';
      app.state.searchQuery.value = 'alpha';
      assert.equal(app.requests.length, 0);
      assert.equal(app.timers.size, 1);
      app.fire();
      assert.equal(app.requests[0].query, 'alpha');
      app.state.searchQuery.value = 'beta';
      app.fire();
      app.requests[1].resolve({ emails: [{ id: 'beta' }] });
      await settle();
      app.requests[0].resolve({ emails: [{ id: 'alpha' }] });
      await settle();
      assert.equal(app.state.searchResults.value[0].id, 'beta');
      app.state.searchQuery.value = 'slow';
      app.fire();
      app.state.searchQuery.value = '';
      app.requests[2].resolve({ emails: [{ id: 'slow' }] });
      await settle();
      assert.equal(app.state.searchResults.value, null);
      assert.equal(app.state.isSearching.value, false);
      assert.equal(app.timers.size, 0);
      app.state.searchQuery.value = 'pending';
      app.stop();
      assert.equal(app.timers.size, 0);
    } finally { app.stop(); }
  });
}
