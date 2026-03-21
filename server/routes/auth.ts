import { Hono } from 'hono';
import { queries } from '../db';
import { hashPassword, verifyPassword, signJwt } from '../auth';

const auth = new Hono();

auth.post('/register', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();

  if (!body.username || !body.password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  const username = body.username.trim().toLowerCase();
  if (username.length < 3 || username.length > 20) {
    return c.json({ error: 'Username must be 3-20 characters' }, 400);
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    return c.json({ error: 'Username must be alphanumeric or underscore' }, 400);
  }
  if (body.password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const existing = queries.getUserByUsername.get(username);
  if (existing) {
    return c.json({ error: 'Username already taken' }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  queries.insertUser.run(id, username, passwordHash, Date.now());

  const token = await signJwt(id, username);
  return c.json({ token, user: { id, username } }, 201);
});

auth.post('/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();

  if (!body.username || !body.password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  const username = body.username.trim().toLowerCase();
  const user = queries.getUserByUsername.get(username);
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = await signJwt(user.id, user.username);
  return c.json({ token, user: { id: user.id, username: user.username } });
});

export { auth };
