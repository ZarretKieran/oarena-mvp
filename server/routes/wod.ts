import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import { queries } from '../db';

const wod = new Hono();

wod.use('*', authMiddleware);

wod.get('/today', (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const challenge = queries.getWodToday.get(today);
  if (!challenge) {
    return c.json({ challenge: null, leaderboard: [] });
  }

  return c.json({
    challenge,
    leaderboard: queries.getWodLeaderboard.all(challenge.id),
  });
});

wod.post('/submit', async (c) => {
  const userId = c.get('userId') as string;
  const body = await c.req.json<{ race_id?: string; challenge_id?: string }>();

  if (!body.race_id) {
    return c.json({ error: 'race_id is required' }, 400);
  }

  const today = new Date().toISOString().slice(0, 10);
  const challenge = body.challenge_id
    ? queries.getWodToday.get(today)
    : queries.getWodToday.get(today);

  if (!challenge) {
    return c.json({ error: 'No daily challenge available' }, 404);
  }

  const race = queries.getRaceByIdForWod.get(body.race_id, userId);
  if (!race) {
    return c.json({ error: 'Race not found' }, 404);
  }
  if (race.state !== 'finished' || race.status !== 'finished') {
    return c.json({ error: 'Race must be completed before WOD submission' }, 400);
  }

  const existing = queries.getWodEntry.get(challenge.id, userId);
  const nextTime = race.final_time ?? null;
  const nextDistance = race.final_distance ?? null;
  const isDistanceBased = challenge.format === 'distance' || challenge.format === 'interval_distance';
  const isBetter = !existing || (
    isDistanceBased
      ? (existing.result_time == null || (nextTime != null && nextTime < existing.result_time))
      : (existing.result_distance == null || (nextDistance != null && nextDistance > existing.result_distance))
  );

  if (isBetter) {
    queries.upsertWodEntry.run(
      challenge.id,
      userId,
      body.race_id,
      nextTime,
      nextDistance,
      Date.now(),
    );
  }

  return c.json({
    challenge,
    submitted: isBetter,
    leaderboard: queries.getWodLeaderboard.all(challenge.id),
  });
});

wod.get('/leaderboard/:date', (c) => {
  const challenge = queries.getWodToday.get(c.req.param('date'));
  if (!challenge) {
    return c.json({ error: 'Challenge not found' }, 404);
  }

  return c.json({
    challenge,
    leaderboard: queries.getWodLeaderboard.all(challenge.id),
  });
});

export { wod };
