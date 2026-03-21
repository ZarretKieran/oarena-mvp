import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './routes/auth';
import { races } from './routes/races';
import { history } from './routes/history';
import { createWsHandler, authenticateWsUpgrade } from './ws/handler';
import { startScheduler } from './race/scheduler';
import type { WsData } from './ws/rooms';
import { join } from 'path';
import { existsSync } from 'fs';

const app = new Hono();

// CORS for dev (Vite runs on different port)
app.use('*', cors({ origin: '*' }));

// API routes
app.route('/api/auth', auth);
app.route('/api/races', races);
app.route('/api/history', history);

// Health check
app.get('/api/health', (c) => c.json({ ok: true }));

// Serve static client files in production
const clientDist = join(import.meta.dir, '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.get('*', async (c) => {
    const path = c.req.path === '/' ? '/index.html' : c.req.path;
    const file = Bun.file(join(clientDist, path));
    if (await file.exists()) {
      return new Response(file);
    }
    // SPA fallback
    return new Response(Bun.file(join(clientDist, 'index.html')));
  });
}

const wsHandler = createWsHandler();

const PORT = parseInt(process.env.PORT || '3001');

const server = Bun.serve({
  port: PORT,
  fetch: async (req, server) => {
    // WebSocket upgrade
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const wsData = await authenticateWsUpgrade(req);
      if (!wsData) {
        return new Response('Unauthorized', { status: 401 });
      }
      const upgraded = server.upgrade<WsData>(req, { data: wsData });
      if (upgraded) return undefined as any;
      return new Response('WebSocket upgrade failed', { status: 500 });
    }

    // HTTP routes via Hono
    return app.fetch(req);
  },
  websocket: wsHandler,
});

// Start background scheduler
startScheduler();

console.log(`[oarena] Server running on http://localhost:${PORT}`);
