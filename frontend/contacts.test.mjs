import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { parse, compileScript } = require('vue/compiler-sfc');
const descriptor = parse(fs.readFileSync(new URL('./src/views/Contacts.vue', import.meta.url), 'utf8')).descriptor;
const code = ts.transpileModule(compileScript(descriptor, { id: 'contacts-test' }).content, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function component(deleteContact) {
  const context = { exports: {}, Error, confirm() { assert.fail('Deletion must not open a browser confirmation'); },
    require: name => ({
      vue: { defineComponent: value => value, ref: value => ({ value }), computed: callback => ({ get value() { return callback(); } }), onMounted() {} },
      'vue-router': { useRouter: () => ({}) },
      '@/api/client': { default: { deleteContact } },
      '@/utils/avatar': {},
    })[name],
  };
  vm.runInNewContext(code, context);
  const state = context.exports.default.setup({}, { expose() {} });
  state.contacts.value = [{ id: 'one', email: 'one@example.com' }, { id: 'two', email: 'two@example.com' }];
  return state;
}
test('contact deletion is direct, ignores duplicate clicks and removes only the successful row', async () => {
  let finish, calls = 0;
  const state = component(id => { assert.equal(id, 'one'); calls++; return new Promise(resolve => { finish = resolve; }); });
  const contact = state.contacts.value[0];
  const deleting = state.removeContact(contact);
  await state.removeContact(contact);
  assert.equal(calls, 1);
  assert.equal(state.deletingIds.value.has('one'), true);
  finish(); await deleting;
  assert.deepEqual(Array.from(state.contacts.value, row => row.id), ['two']);
  assert.equal(state.deletingIds.value.size, 0);
});
test('failed deletion keeps the contact and exposes an inline error', async () => {
  const state = component(async () => { throw Error('Delete failed'); });
  await state.removeContact(state.contacts.value[0]);
  assert.equal(state.contacts.value.length, 2);
  assert.equal(state.error.value, 'Delete failed');
  assert.equal(state.deletingIds.value.size, 0);
});
