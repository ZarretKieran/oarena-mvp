import { Hono } from 'hono';
import { queries } from '../db';
import { appendWaitlistSignupToGoogleSheet } from '../google-sheets';

const waitlist = new Hono();

export function normalizeWaitlistName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

export function normalizeWaitlistEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidWaitlistEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  return trimmed.slice(0, 64);
}

waitlist.post('/', async (c) => {
  const body = await c.req.json<{ name?: string; email?: string; source?: string }>();

  if (typeof body.name !== 'string' || !normalizeWaitlistName(body.name)) {
    return c.json({ error: 'Valid name required' }, 400);
  }

  if (typeof body.email !== 'string') {
    return c.json({ error: 'Valid email required' }, 400);
  }

  const name = normalizeWaitlistName(body.name);
  const email = normalizeWaitlistEmail(body.email);
  if (!isValidWaitlistEmail(email)) {
    return c.json({ error: 'Valid email required' }, 400);
  }

  const source = normalizeSource(body.source);
  const createdAt = Date.now();

  queries.insertWaitlistSignup.run(
    crypto.randomUUID(),
    name,
    email,
    source,
    createdAt,
  );

  try {
    await appendWaitlistSignupToGoogleSheet({
      name,
      email,
      source,
      createdAt,
    });
  } catch (error) {
    console.error('[waitlist] failed to append signup to Google Sheets', error);
  }

  return c.json({ ok: true });
});

export { waitlist };
