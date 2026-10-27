import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse, compileScript } = require('vue/compiler-sfc');
const ts = require('typescript');
const source = fs.readFileSync(new URL('./src/components/InstallApp.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const compiled = ts.transpileModule(compileScript(descriptor, { id: 'install-test' }).content,
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function component(prompt) {
  let timeout;
  const deferredPrompt = { value: prompt };
  const context = {
    exports: {},
    require: name => name === '@/pwa' ? { deferredPrompt } : {
      defineComponent: value => value, ref: value => ({ value }), onMounted() {}, onUnmounted() {},
    },
    window: { matchMedia: () => ({ matches: false }) },
    navigator: { userAgent: '', platform: '', maxTouchPoints: 0 },
    setTimeout: callback => { timeout = callback; return 1; }, clearTimeout() {},
  };
  vm.runInNewContext(compiled, context);
  return { state: context.exports.default.setup({}, { expose() {} }), deferredPrompt, expire: () => timeout() };
}

test('unresponsive browser prompt releases the button and reports the failure', async () => {
  const app = component({ prompt: () => new Promise(() => {}), userChoice: new Promise(() => {}) });
  const pending = app.state.install();
  assert.equal(app.state.installing.value, true);
  assert.equal(app.deferredPrompt.value, null);
  app.expire();
  await pending;
  assert.equal(app.state.installing.value, false);
  assert.match(app.state.message.value, /could not start/);
});

test('accepted, dismissed and failed browser prompts all release the button', async () => {
  for (const outcome of ['accepted', 'dismissed', 'error']) {
    const app = component({ prompt: () => outcome === 'error' ? Promise.reject(Error('failed')) : Promise.resolve(),
      userChoice: Promise.resolve({ outcome }) });
    await app.state.install();
    assert.equal(app.state.installing.value, false);
    assert.equal(Boolean(app.state.message.value), outcome === 'error');
  }
});

test('installation text has no mojibake', () => {
  assert.match(source, /Opening\.\.\./);
  assert.doesNotMatch(source, /[\u00e2\u00c3]/);
});
