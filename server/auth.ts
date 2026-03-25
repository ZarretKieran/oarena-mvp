import type { Context, Next } from 'hono';
import { queries } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'oarena-dev-secret-change-in-prod';
const encoder = new TextEncoder();

// ── Password hashing (Bun native) ──

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

// ── JWT (minimal HMAC-SHA256 implementation) ──

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(sig));
}

async function hmacVerify(payload: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(payload);
  return expected === signature;
}

export interface JwtPayload {
  readonly sub: string;       // user id
  readonly username: string;
  readonly exp: number;       // expiry unix seconds
}

export async function signJwt(userId: string, username: string): Promise<string> {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        sub: userId,
        username,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
      })
    )
  );
  const signature = await hmacSign(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const valid = await hmacVerify(`${header}.${payload}`, signature);
  if (!valid) return null;

  const decoded = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(payload))
  ) as JwtPayload;

  if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
  return decoded;
}

// ── Hono middleware ──

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJwt(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const user = queries.getUserById.get(payload.sub);
  if (!user) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('userId', payload.sub);
  c.set('username', payload.username);
  await next();
}
