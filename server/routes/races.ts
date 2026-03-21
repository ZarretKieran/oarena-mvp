import { Hono } from 'hono';
import { queries } from '../db';
import { authMiddleware } from '../auth';
import type { RaceType, RaceFormat } from '../../shared/types';

const races = new Hono();

// All race routes require auth
races.use('*', authMiddleware);

// List open/active races (feed)
races.get('/', (c) => {
  const rows = queries.listOpenRaces.all();
  return c.json({ races: rows });
});

// Create a race
races.post('/', async (c) => {
  const userId = c.get('userId') as string;
  const body = await c.req.json<{
    race_type?: RaceType;
    format?: RaceFormat;
    target_value?: number;
    split_value?: number;
    warmup_start_time?: number;
    max_participants?: number;
  }>();

  // Validate
  if (!body.race_type || !['duel', 'group'].includes(body.race_type)) {
    return c.json({ error: 'race_type must be "duel" or "group"' }, 400);
  }
  if (!body.format || !['distance', 'time'].includes(body.format)) {
    return c.json({ error: 'format must be "distance" or "time"' }, 400);
  }
  if (!body.target_value || body.target_value <= 0) {
    return c.json({ error: 'target_value must be positive' }, 400);
  }
  if (!body.warmup_start_time || body.warmup_start_time < Date.now()) {
    return c.json({ error: 'warmup_start_time must be in the future' }, 400);
  }

  const splitValue = body.split_value ?? (body.format === 'distance' ? 500 : 300);
  const maxParticipants = body.race_type === 'duel' ? 2 : (body.max_participants ?? 8);

  const id = crypto.randomUUID();
  const now = Date.now();

  queries.insertRace.run(
    id, userId, body.race_type, body.format,
    body.target_value, splitValue,
    body.warmup_start_time, maxParticipants, now
  );

  // Creator auto-joins
  queries.insertParticipant.run(id, userId, now);

  const race = queries.getRaceById.get(id);
  return c.json({ race }, 201);
});

// Join a race
races.post('/:id/join', (c) => {
  const userId = c.get('userId') as string;
  const raceId = c.req.param('id');

  const race = queries.getRaceById.get(raceId);
  if (!race) {
    return c.json({ error: 'Race not found' }, 404);
  }
  if (race.state !== 'open') {
    return c.json({ error: 'Race is no longer open for joining' }, 400);
  }

  const already = queries.isParticipant.get(raceId, userId);
  if (already && already.count > 0) {
    return c.json({ error: 'Already joined this race' }, 400);
  }

  const count = queries.getParticipantCount.get(raceId);
  if (count && count.count >= race.max_participants) {
    return c.json({ error: 'Race is full' }, 400);
  }

  queries.insertParticipant.run(raceId, userId, Date.now());

  const participants = queries.getParticipants.all(raceId);
  return c.json({ participants });
});

// Get race details
races.get('/:id', (c) => {
  const raceId = c.req.param('id');
  const race = queries.getRaceById.get(raceId);
  if (!race) {
    return c.json({ error: 'Race not found' }, 404);
  }
  const participants = queries.getParticipants.all(raceId);
  return c.json({ race, participants });
});

export { races };
