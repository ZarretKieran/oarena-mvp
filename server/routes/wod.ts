import { Hono } from 'hono';
import type { DailyChallenge, RaceFormat, WodEntry, WodHistoryDay } from '../../shared/types';
import { authMiddleware } from '../auth';
import { queries } from '../db';

const wod = new Hono();

wod.use('*', authMiddleware);

const MOCK_USERNAMES = ['stroke_king', 'blade_runner', 'catchdrive', 'erg_enforcer', 'wake_chaser', 'oar_nothing'];

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function offsetDateKey(daysAgo: number, now = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function templateForDate(date: string): { format: RaceFormat; targetValue: number; intervalCount?: number; restSeconds?: number; title: string; description: string } {
  const templates = [
    { format: 'distance' as const, targetValue: 2000, title: 'Daily 2K', description: 'Set your fastest 2,000m time today.' },
    { format: 'distance' as const, targetValue: 5000, title: 'Steady 5K', description: 'Settle in and hold your pace through 5,000m.' },
    { format: 'time' as const, targetValue: 1200, title: '20-Minute Grind', description: 'Row as far as you can in 20 minutes.' },
    { format: 'distance' as const, targetValue: 1000, title: 'One-K Burner', description: 'Sprint a hard 1,000m effort.' },
    { format: 'interval_distance' as const, targetValue: 500, intervalCount: 5, restSeconds: 60, title: 'Power 500s', description: 'Five hard 500m intervals with 60s rest.' },
    { format: 'interval_time' as const, targetValue: 240, intervalCount: 4, restSeconds: 60, title: 'Four by Four', description: 'Four 4-minute pieces with 60s rest.' },
  ];
  const numeric = date.replace(/-/g, '').split('').reduce((sum, char) => sum + Number(char), 0);
  return templates[numeric % templates.length];
}

export function buildMockChallenge(date: string): DailyChallenge {
  const template = templateForDate(date);
  return {
    id: `mock-${date}`,
    date,
    format: template.format,
    target_value: template.targetValue,
    interval_count: template.intervalCount,
    rest_seconds: template.restSeconds,
    title: template.title,
    description: template.description,
  };
}

export function buildMockLeaderboard(challenge: DailyChallenge, currentUserId: string, currentUsername: string): WodEntry[] {
  const entries = [
    { userId: 'mock-1', username: MOCK_USERNAMES[0] },
    { userId: 'mock-2', username: MOCK_USERNAMES[1] },
    { userId: currentUserId, username: currentUsername },
    { userId: 'mock-4', username: MOCK_USERNAMES[3] },
    { userId: 'mock-5', username: MOCK_USERNAMES[4] },
  ];

  return entries.map((entry, index) => {
    const completedAt = Date.now() - index * 83_000;
    const isDistanceBased = challenge.format === 'distance' || challenge.format === 'interval_distance';

    return {
      challenge_id: challenge.id,
      user_id: entry.userId,
      username: entry.username,
      result_time: isDistanceBased ? baseTimeForChallenge(challenge, index) : null,
      result_distance: isDistanceBased ? null : baseDistanceForChallenge(challenge, index),
      completed_at: completedAt,
    };
  });
}

function baseTimeForChallenge(challenge: DailyChallenge, index: number): number {
  switch (challenge.format) {
  case 'distance':
    return challenge.target_value === 5000 ? 1110 + index * 18 : challenge.target_value === 1000 ? 188 + index * 5 : 410 + index * 8;
  case 'interval_distance':
    return 580 + index * 16;
  case 'time':
  case 'interval_time':
    return 0;
  }
}

function baseDistanceForChallenge(challenge: DailyChallenge, index: number): number {
  switch (challenge.format) {
  case 'time':
    return 6030 - index * 115;
  case 'interval_time':
    return 4720 - index * 90;
  case 'distance':
  case 'interval_distance':
    return 0;
  }
}

function leaderboardForChallenge(challenge: DailyChallenge, currentUserId: string, currentUsername: string): WodEntry[] {
  const live = queries.getWodLeaderboard.all(challenge.id) as WodEntry[];
  return live.length > 0 ? live : buildMockLeaderboard(challenge, currentUserId, currentUsername);
}

function buildWodHistory(currentUserId: string, currentUsername: string, limit = 5): WodHistoryDay[] {
  const liveChallenges = (queries.listRecentWodChallenges?.all?.(limit) ?? []) as DailyChallenge[];
  const history: WodHistoryDay[] = liveChallenges.map((challenge) => ({
    challenge,
    leaderboard: leaderboardForChallenge(challenge, currentUserId, currentUsername),
  }));

  let daysAgo = 1;
  while (history.length < limit) {
    const date = offsetDateKey(daysAgo);
    if (!history.some((item) => item.challenge.date === date)) {
      const mockChallenge = buildMockChallenge(date);
      history.push({
        challenge: mockChallenge,
        leaderboard: buildMockLeaderboard(mockChallenge, currentUserId, currentUsername),
      });
    }
    daysAgo += 1;
  }

  return history.sort((a, b) => b.challenge.date.localeCompare(a.challenge.date));
}

function currentUsernameFor(userId: string): string {
  return queries.getUserById?.get?.(userId)?.username ?? 'you';
}

wod.get('/today', (c) => {
  const userId = c.get('userId') as string;
  const username = currentUsernameFor(userId);
  const today = todayKey();
  const challenge = queries.getWodToday.get(today) as DailyChallenge | null;
  const resolvedChallenge = challenge ?? buildMockChallenge(today);

  return c.json({
    challenge: resolvedChallenge,
    leaderboard: leaderboardForChallenge(resolvedChallenge, userId, username),
    history: buildWodHistory(userId, username),
  });
});

wod.post('/submit', async (c) => {
  const userId = c.get('userId') as string;
  const body = await c.req.json<{ race_id?: string; challenge_id?: string }>();

  if (!body.race_id) {
    return c.json({ error: 'race_id is required' }, 400);
  }

  const today = todayKey();
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
  const userId = c.get('userId') as string;
  const username = currentUsernameFor(userId);
  const challenge = queries.getWodToday.get(c.req.param('date')) as DailyChallenge | null;
  const resolvedChallenge = challenge ?? buildMockChallenge(c.req.param('date'));

  return c.json({
    challenge: resolvedChallenge,
    leaderboard: leaderboardForChallenge(resolvedChallenge, userId, username),
  });
});

wod.get('/history', (c) => {
  const userId = c.get('userId') as string;
  const username = currentUsernameFor(userId);

  return c.json({
    history: buildWodHistory(userId, username),
  });
});

export { wod };
