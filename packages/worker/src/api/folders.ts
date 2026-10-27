import { Hono } from 'hono';

const folders = new Hono<{ Bindings: { DB: D1Database } }>();
function nameFrom(body: unknown): string | null {
  const name = (body as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 60 && !/[\x00-\x1f]/.test(name) ? name.trim() : null;
}
folders.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  await next();
});
folders.get('/', async c => {
  const result = await c.env.DB.prepare('SELECT folders.*, (SELECT COUNT(*) FROM email_folders WHERE folder_id = folders.id) AS count FROM folders ORDER BY name COLLATE NOCASE').all();
  return c.json({ folders: result.results });
});
folders.post('/', async c => {
  const name = nameFrom(await c.req.json().catch(() => null));
  if (!name) return c.json({ error: 'Folder name must contain 1–60 characters.' }, 400);
  const id = crypto.randomUUID();
  const result = await c.env.DB.prepare('INSERT INTO folders (id, name) VALUES (?, ?) ON CONFLICT(name) DO NOTHING').bind(id, name).run();
  if (!result.meta.changes) return c.json({ error: 'A folder with this name already exists.' }, 409);
  return c.json({ id, name }, 201);
});
folders.post('/move', async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 100 ||
      body.ids.some((id: unknown) => typeof id !== 'string' || id.length > 100) ||
      (body.folderId !== null && typeof body.folderId !== 'string')) return c.json({ error: 'Choose 1–100 emails and a valid destination.' }, 400);
  const ids = [...new Set<string>(body.ids)];
  if (body.folderId !== null && !await c.env.DB.prepare('SELECT id FROM folders WHERE id = ?').bind(body.folderId).first()) return c.json({ error: 'Folder not found.' }, 404);
  // Only actual received/sent messages can move; drafts and scheduled messages keep their workflow.
  const statements = ids.map(id => body.folderId === null
    ? c.env.DB.prepare('DELETE FROM email_folders WHERE email_id = ?').bind(id)
    : c.env.DB.prepare("INSERT INTO email_folders (email_id, folder_id) SELECT id, ? FROM emails WHERE id = ? AND type IN ('received', 'sent') ON CONFLICT(email_id) DO UPDATE SET folder_id = excluded.folder_id").bind(body.folderId, id));
  statements.push(...ids.map(id => c.env.DB.prepare("UPDATE emails SET archived = 0 WHERE id = ? AND type IN ('received', 'sent')").bind(id)));
  await c.env.DB.batch(statements);
  return c.json({ success: true });
});
folders.put('/:id', async c => {
  const name = nameFrom(await c.req.json().catch(() => null));
  if (!name) return c.json({ error: 'Folder name must contain 1–60 characters.' }, 400);
  const id = c.req.param('id');
  const result = await c.env.DB.prepare('UPDATE folders SET name = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM folders WHERE name = ? AND id != ?)').bind(name, id, name, id).run();
  if (!result.meta.changes) return c.json({ error: 'Folder missing or name already in use.' }, 409);
  return c.json({ success: true });
});
folders.delete('/:id', async c => {
  const id = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM email_folders WHERE folder_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id),
  ]);
  return c.json({ success: true });
});
export default folders;
