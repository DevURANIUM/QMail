import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('./src/db/queries.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, context);

test('sent search scopes results before the limit; default search remains global', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`CREATE TABLE emails(id TEXT PRIMARY KEY, type TEXT, subject TEXT); CREATE TABLE attachments(id TEXT, email_id TEXT); CREATE VIRTUAL TABLE emails_fts USING fts5(subject);`);
    for (let i = 1; i <= 61; i++) {
      sqlite.prepare('INSERT INTO emails(rowid,id,type,subject) VALUES(?,?,?,?)').run(i, String(i), i === 61 ? 'sent' : 'received', 'project');
      sqlite.prepare('INSERT INTO emails_fts(rowid,subject) VALUES(?,?)').run(i, 'project');
    }
    const db = new context.exports.DatabaseQueries({ prepare(sql) { return { bind(...args) { return { all: async () => ({ results: sqlite.prepare(sql).all(...args) }) }; } }; } });
    const sent = await db.searchEmails('project', 50, 'sent');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].id, '61');
    assert.equal((await db.searchEmails('project')).length, 50);
    const empty = await db.searchEmails('***');
    assert.equal(empty.length, 0);
  } finally { sqlite.close(); }
});
