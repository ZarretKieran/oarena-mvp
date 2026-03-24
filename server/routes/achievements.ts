import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import { queries } from '../db';

const achievements = new Hono();

achievements.use('*', authMiddleware);

achievements.get('/', (c) => {
  return c.json({ achievements: queries.listAchievementDefs.all() });
});

export { achievements };
