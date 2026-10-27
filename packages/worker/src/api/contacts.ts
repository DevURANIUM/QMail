import { Hono } from 'hono';
import { DatabaseQueries } from '../db/queries';
import { generateId } from '../lib/utils';
import { isValidEmail, sanitizeString } from '../lib/validation';

export interface Env {
  DB: D1Database;
}

const contacts = new Hono<{ Bindings: Env }>();

/**
 * List contacts
 */
contacts.get('/', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    return c.json({ contacts: await db.listContacts() });
  } catch (error) {
    console.error('List contacts error:', error);
    return c.json({ error: 'Failed to list contacts' }, 500);
  }
});

/**
 * Create (or refresh) a contact
 */
contacts.post('/', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const { email, name, notes } = await c.req.json<{ email: string; name?: string; notes?: string }>();

    if (!email || !isValidEmail(email)) {
      return c.json({ error: 'A valid email address is required' }, 400);
    }

    const id = generateId();
    await db.upsertContact({
      id,
      email,
      name: name ? sanitizeString(name, 120) : null,
      notes: notes ? sanitizeString(notes, 500) : null,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('Create contact error:', error);
    return c.json({ error: 'Failed to save contact' }, 500);
  }
});

/**
 * Update a contact
 */
contacts.put('/:id', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    const { email, name, notes } = await c.req.json<{ email: string; name?: string; notes?: string }>();

    if (!email || !isValidEmail(email)) {
      return c.json({ error: 'A valid email address is required' }, 400);
    }

    await db.updateContact(c.req.param('id'), {
      email,
      name: name ? sanitizeString(name, 120) : null,
      notes: notes ? sanitizeString(notes, 500) : null,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('Update contact error:', error);
    return c.json({ error: 'Failed to update contact' }, 500);
  }
});

/**
 * Delete a contact
 */
contacts.delete('/:id', async (c) => {
  const db = new DatabaseQueries(c.env.DB);

  try {
    await db.deleteContact(c.req.param('id'));
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete contact error:', error);
    return c.json({ error: 'Failed to delete contact' }, 500);
  }
});

export default contacts;
