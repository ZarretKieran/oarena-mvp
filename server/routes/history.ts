import { Hono } from 'hono';
import { queries } from '../db';
import { authMiddleware } from '../auth';

const history = new Hono();

history.use('*', authMiddleware);

history.get('/', (c) => {
  const userId = c.get('userId') as string;
  const rows = queries.getUserRaces.all(userId);
  return c.json({ races: rows });
});

export { history };
