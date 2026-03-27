import { Hono } from 'hono';
import { queries } from '../db';

const waitlist = new Hono();

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
  const body = await c.req.json<{ email?: string; source?: string }>();

  if (typeof body.email !== 'string') {
    return c.json({ error: 'Valid email required' }, 400);
  }

  const email = normalizeWaitlistEmail(body.email);
  if (!isValidWaitlistEmail(email)) {
    return c.json({ error: 'Valid email required' }, 400);
  }

  queries.insertWaitlistSignup.run(
    crypto.randomUUID(),
    email,
    normalizeSource(body.source),
    Date.now(),
  );

  return c.json({ ok: true });
});

export { waitlist };
