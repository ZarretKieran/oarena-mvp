import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import { db, queries } from '../db';

const users = new Hono();

users.use('*', authMiddleware);

users.get('/:id/profile', (c) => {
  const userId = c.req.param('id');
  const profile = queries.getUserProfile.get(userId);
  if (!profile) {
    return c.json({ error: 'User not found' }, 404);
  }

  const rank = queries.getUserLeaderboardRank.get(profile.elo, profile.elo, userId, userId)?.rank ?? 1;

  return c.json({
    profile: {
      user: {
        id: profile.id,
        username: profile.username,
        created_at: profile.created_at,
      },
      stats: {
        user_id: profile.id,
        elo: profile.elo,
        tier: profile.tier,
        division: profile.division,
        lp: profile.lp,
        wins: profile.wins,
        losses: profile.losses,
        total_races: profile.total_races,
        total_meters: profile.total_meters,
        total_time: profile.total_time,
        current_streak: profile.current_streak,
        best_streak: profile.best_streak,
        placement_races: profile.placement_races,
        rank,
      },
    },
  });
});

users.get('/:id/personal-bests', (c) => {
  const userId = c.req.param('id');
  const personalBests = queries.getPersonalBests.all(userId);
  return c.json({ personal_bests: personalBests });
});

users.get('/:id/achievements', (c) => {
  const userId = c.req.param('id');
  const achievements = queries.getUserAchievements.all(userId);
  return c.json({ achievements });
});

users.delete('/me', (c) => {
  const userId = c.get('userId');
  const deletionTime = Date.now();
  const replacementUsername = `deleted_${userId.slice(0, 8)}_${deletionTime}`;
  const replacementPasswordHash = `deleted_${crypto.randomUUID()}`;

  db.transaction(() => {
    queries.cancelActiveRacesByCreator.run(userId);
    queries.deleteUserRaceParticipations.run(userId);
    queries.deleteUserWodEntries.run(userId);
    queries.deleteUserAchievements.run(userId);
    queries.deleteUserPersonalBests.run(userId);
    queries.deleteUserStats.run(userId);
    queries.softDeleteUser.run(replacementUsername, replacementPasswordHash, deletionTime, userId);
  })();

  return c.json({});
});

export { users };
