import { beforeEach, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { unlinkSync } from 'fs';

const testDbPath = `/tmp/oarena-waitlist-${Date.now()}.db`;
process.env.DB_PATH = testDbPath;

const [{ waitlist, normalizeWaitlistEmail, isValidWaitlistEmail }, { db }] = await Promise.all([
  import(`../routes/waitlist.ts?test=${Date.now()}`),
  import(`../db.ts?test=${Date.now()}`),
]);

const app = new Hono();
app.route('/api/waitlist', waitlist);

beforeEach(() => {
  db.run('DELETE FROM waitlist_signups');
});

test('normalizeWaitlistEmail trims and lowercases email addresses', () => {
  expect(normalizeWaitlistEmail('  Racer@Example.COM ')).toBe('racer@example.com');
});

test('isValidWaitlistEmail rejects malformed addresses', () => {
  expect(isValidWaitlistEmail('racer@example.com')).toBe(true);
  expect(isValidWaitlistEmail('not-an-email')).toBe(false);
  expect(isValidWaitlistEmail('racer@')).toBe(false);
});

test('POST /api/waitlist accepts valid emails and persists a normalized record', async () => {
  const response = await app.request('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: '  Racer@Example.COM ',
      source: 'Landing_Page',
    }),
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });

  const signup = db
    .query('SELECT email, source FROM waitlist_signups')
    .get() as { email: string; source: string | null } | null;

  expect(signup).not.toBeNull();
  expect(signup?.email).toBe('racer@example.com');
  expect(signup?.source).toBe('landing_page');
});

test('POST /api/waitlist rejects invalid email input', async () => {
  const response = await app.request('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bad-email',
      source: 'landing_page',
    }),
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Valid email required' });
});

test('POST /api/waitlist is idempotent for duplicate email submissions', async () => {
  const payload = JSON.stringify({
    email: 'racer@example.com',
    source: 'landing_page',
  });

  const first = await app.request('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  const second = await app.request('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);

  const count = db
    .query('SELECT COUNT(*) as count FROM waitlist_signups')
    .get() as { count: number };

  expect(count.count).toBe(1);
});

test('POST /api/waitlist survives repeated casing and whitespace variants', async () => {
  await app.request('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ' Racer@Example.com ' }),
  });

  await app.request('/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'racer@example.com' }),
  });

  const count = db
    .query('SELECT COUNT(*) as count FROM waitlist_signups')
    .get() as { count: number };

  expect(count.count).toBe(1);
});

process.on('exit', () => {
  db.close(false);
  try {
    unlinkSync(testDbPath);
  } catch (_) {
    // Ignore cleanup failures in tests.
  }
});
