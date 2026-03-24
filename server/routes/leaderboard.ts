import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import { queries } from '../db';

const leaderboard = new Hono();

leaderboard.use('*', authMiddleware);

leaderboard.get('/', (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '25')));
  const offset = Math.max(0, Number(c.req.query('offset') ?? '0'));
  const rows = queries.getLeaderboard.all(limit, offset);

  return c.json({
    leaderboard: rows.map((row: any, index: number) => ({
      user_id: row.id,
      username: row.username,
      elo: row.elo,
      tier: row.tier,
      division: row.division,
      lp: row.lp,
      wins: row.wins,
      losses: row.losses,
      total_races: row.total_races,
      current_streak: row.current_streak,
      best_streak: row.best_streak,
      rank: offset + index + 1,
    })),
    limit,
    offset,
  });
});

export { leaderboard };
