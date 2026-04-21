import { beforeEach, expect, mock, test } from 'bun:test';
import type { DailyChallenge, LeagueTier, PersonalBest, RaceFormat, UserStats } from '../../shared/types';

type AchievementRecord = {
  progress: number;
  unlocked_at: number | null;
};

type WodRaceRecord = {
  id: string;
  user_id: string;
  state: 'finished';
  status: 'finished';
  format: RaceFormat;
  target_value: number;
  interval_count: number | null;
  rest_seconds: number | null;
  final_time: number | null;
  final_distance: number | null;
  final_avg_pace: number | null;
};

type Harness = {
  authUserId: string;
  authUsername: string;
  dailyChallenges: Map<string, DailyChallenge>;
  userStats: Map<string, UserStats>;
  personalBests: Map<string, PersonalBest>;
  userAchievements: Map<string, AchievementRecord>;
  wodEntries: Map<string, {
    challenge_id: string;
    user_id: string;
    race_id: string;
    result_time: number | null;
    result_distance: number | null;
    completed_at: number;
  }>;
  wodRaces: Map<string, WodRaceRecord>;
  raceStateUpdates: Array<{ raceId: string; state: string }>;
  participantStatusUpdates: Array<{ raceId: string; userId: string; status: string }>;
  participantResultUpdates: Array<{ raceId: string; userId: string; status: string | null }>;
  personalBestUpserts: Array<PersonalBest>;
  wodUpserts: Array<{
    challenge_id: string;
    user_id: string;
    race_id: string;
    result_time: number | null;
    result_distance: number | null;
    completed_at: number;
  }>;
};

function defaultStats(userId: string): UserStats {
  return {
    user_id: userId,
    elo: 1000,
    tier: 'club',
    division: 4,
    lp: 0,
    wins: 0,
    losses: 0,
    total_races: 0,
    total_meters: 0,
    total_time: 0,
    current_streak: 0,
    best_streak: 0,
    placement_races: 0,
  };
}

function createHarness(): Harness {
  return {
    authUserId: 'user-1',
    authUsername: 'tester',
    dailyChallenges: new Map(),
    userStats: new Map(),
    personalBests: new Map(),
    userAchievements: new Map(),
    wodEntries: new Map(),
    wodRaces: new Map(),
    raceStateUpdates: [],
    participantStatusUpdates: [],
    participantResultUpdates: [],
    personalBestUpserts: [],
    wodUpserts: [],
  };
}

function personalBestKey(userId: string, format: RaceFormat, targetValue: number, intervalCount: number, restSeconds: number): string {
  return [userId, format, targetValue, intervalCount, restSeconds].join('|');
}

function achievementKey(userId: string, achievementId: string): string {
  return `${userId}|${achievementId}`;
}

function wodEntryKey(challengeId: string, userId: string): string {
  return `${challengeId}|${userId}`;
}

function makeParticipant(userId: string, username: string, elapsedTime: number): Record<string, unknown> {
  return {
    userId,
    username,
    status: 'racing',
    distance: 2000,
    pace: 0,
    strokeRate: 0,
    heartRate: 0,
    elapsedTime,
    averagePace: 0,
    watts: 0,
    calories: 0,
    strokeCount: 0,
    workoutState: 0,
    lastUpdate: Date.now(),
  };
}

let harness = createHarness();

const queries = {
  ensureUserStats: {
    run(userId: string) {
      if (!harness.userStats.has(userId)) {
        harness.userStats.set(userId, defaultStats(userId));
      }
    },
  },
  getUserStats: {
    get(userId: string) {
      return harness.userStats.get(userId) ?? null;
    },
  },
  updateUserStats: {
    run(
      elo: number,
      tier: LeagueTier,
      division: number,
      lp: number,
      wins: number,
      losses: number,
      totalRaces: number,
      totalMeters: number,
      totalTime: number,
      currentStreak: number,
      bestStreak: number,
      placementRaces: number,
      demotionShield: number,
      userId: string,
    ) {
      harness.userStats.set(userId, {
        user_id: userId,
        elo,
        tier,
        division,
        lp,
        wins,
        losses,
        total_races: totalRaces,
        total_meters: totalMeters,
        total_time: totalTime,
        current_streak: currentStreak,
        best_streak: bestStreak,
        placement_races: placementRaces,
        demotion_shield: demotionShield,
      } as UserStats);
    },
  },
  getPersonalBest: {
    get(userId: string, format: RaceFormat, targetValue: number, intervalCount: number, restSeconds: number) {
      return harness.personalBests.get(personalBestKey(userId, format, targetValue, intervalCount, restSeconds)) ?? null;
    },
  },
  upsertPersonalBest: {
    run(
      userId: string,
      format: RaceFormat,
      targetValue: number,
      intervalCount: number,
      restSeconds: number,
      bestTime: number | null,
      bestDistance: number | null,
      bestPace: number | null,
      raceId: string,
      achievedAt: number,
    ) {
      const record: PersonalBest = {
        user_id: userId,
        format,
        target_value: targetValue,
        interval_count: intervalCount || undefined,
        rest_seconds: restSeconds || undefined,
        best_time: bestTime ?? undefined,
        best_distance: bestDistance ?? undefined,
        best_pace: bestPace ?? undefined,
        race_id: raceId,
        achieved_at: achievedAt,
      };

      harness.personalBests.set(personalBestKey(userId, format, targetValue, intervalCount, restSeconds), record);
      harness.personalBestUpserts.push(record);
    },
  },
  getPersonalBests: {
    all(userId: string) {
      return [...harness.personalBests.values()].filter((record) => record.user_id === userId);
    },
  },
  countUserWodEntries: {
    get(userId: string) {
      return { count: [...harness.wodEntries.values()].filter((entry) => entry.user_id === userId).length };
    },
  },
  getUserAchievement: {
    get(userId: string, achievementId: string) {
      return harness.userAchievements.get(achievementKey(userId, achievementId)) ?? null;
    },
  },
  upsertUserAchievement: {
    run(userId: string, achievementId: string, progress: number, unlockedAt: number | null) {
      const key = achievementKey(userId, achievementId);
      const previous = harness.userAchievements.get(key);
      harness.userAchievements.set(key, {
        progress,
        unlocked_at: previous?.unlocked_at ?? unlockedAt,
      });
    },
  },
  insertAchievementDef: {
    run() {
      // No-op for the harness.
    },
  },
  getWodToday: {
    get(date: string) {
      return harness.dailyChallenges.get(date) ?? null;
    },
  },
  getWodLeaderboard: {
    all(challengeId: string) {
      return [...harness.wodEntries.values()]
        .filter((entry) => entry.challenge_id === challengeId)
        .sort((a, b) => {
          const aTime = a.result_time;
          const bTime = b.result_time;

          if (aTime == null && bTime == null) {
            if (a.result_distance == null && b.result_distance == null) {
              return a.completed_at - b.completed_at;
            }
            if (a.result_distance == null) return 1;
            if (b.result_distance == null) return -1;
            if (a.result_distance === b.result_distance) return a.completed_at - b.completed_at;
            return b.result_distance - a.result_distance;
          }

          if (aTime == null) return 1;
          if (bTime == null) return -1;
          if (aTime !== bTime) return aTime - bTime;
          return a.completed_at - b.completed_at;
        })
        .map((entry) => ({
          challenge_id: entry.challenge_id,
          user_id: entry.user_id,
          username: entry.user_id,
          result_time: entry.result_time,
          result_distance: entry.result_distance,
          completed_at: entry.completed_at,
        }));
    },
  },
  getWodEntry: {
    get(challengeId: string, userId: string) {
      return harness.wodEntries.get(wodEntryKey(challengeId, userId)) ?? null;
    },
  },
  upsertWodEntry: {
    run(challengeId: string, userId: string, raceId: string, resultTime: number | null, resultDistance: number | null, completedAt: number) {
      const record = {
        challenge_id: challengeId,
        user_id: userId,
        race_id: raceId,
        result_time: resultTime,
        result_distance: resultDistance,
        completed_at: completedAt,
      };

      harness.wodEntries.set(wodEntryKey(challengeId, userId), record);
      harness.wodUpserts.push(record);
    },
  },
  getRaceByIdForWod: {
    get(raceId: string, userId: string) {
      const race = harness.wodRaces.get(raceId);
      if (!race || race.user_id !== userId) return null;
      return race;
    },
  },
  updateRaceState: {
    run(state: string, raceId: string) {
      harness.raceStateUpdates.push({ raceId, state });
    },
  },
  updateParticipantStatus: {
    run(status: string, raceId: string, userId: string) {
      harness.participantStatusUpdates.push({ raceId, userId, status });
    },
  },
  updateParticipantResult: {
    run(
      _finalTime: number | null,
      _finalDistance: number | null,
      _finalAvgPace: number | null,
      _finalCalories: number | null,
      _finalStrokeCount: number | null,
      _placement: number | null,
      status: string,
      raceId: string,
      userId: string,
    ) {
      harness.participantResultUpdates.push({ raceId, userId, status });
    },
  },
};

mock.module('../db', () => ({ queries }));
mock.module('../auth', () => ({
  authMiddleware: async (c: any, next: () => Promise<void>) => {
    c.set('userId', harness.authUserId);
    c.set('username', harness.authUsername);
    await next();
  },
}));

const { calculateEloChanges, applyLpChange } = await import('../race/elo');
const { checkAchievements } = await import('../race/achievements');
const { handleRaceMessage, setActiveRace, getAllActiveRaces, removeActiveRace } = await import('../race/state-machine');
const { wod } = await import('../routes/wod');

beforeEach(() => {
  harness = createHarness();
  for (const raceId of [...getAllActiveRaces().keys()]) {
    removeActiveRace(raceId);
  }
});

test('calculateEloChanges converts a head-to-head win into the expected Elo and LP movement', () => {
  const changes = calculateEloChanges([
    { userId: 'user-1', elo: 1000, placementRaces: 0, placement: 1, status: 'finished' },
    { userId: 'user-2', elo: 1000, placementRaces: 0, placement: 2, status: 'finished' },
  ]);

  expect(changes).toEqual([
    { userId: 'user-1', oldElo: 1000, newElo: 1032, eloDelta: 32 },
    { userId: 'user-2', oldElo: 1000, newElo: 968, eloDelta: -32 },
  ]);

  const lpOutcome = applyLpChange(
    { elo: 1000, tier: 'club', division: 1, lp: 95, demotionShield: 0 },
    changes[0].eloDelta,
  );

  expect(lpOutcome).toEqual({
    tier: 'varsity',
    division: 4,
    lp: 25,
    demotionShield: 1,
    isPromotion: true,
    isDemotion: false,
  });
});

test('force finishing a race updates Elo and replaces only a better personal best', () => {
  harness.userStats.set('user-1', {
    ...defaultStats('user-1'),
    lp: 95,
    division: 1,
  });
  harness.userStats.set('user-2', defaultStats('user-2'));

  harness.personalBests.set(
    personalBestKey('user-1', 'distance', 2000, 0, 0),
    {
      user_id: 'user-1',
      format: 'distance',
      target_value: 2000,
      best_time: 430,
      best_distance: 2000,
      race_id: 'race-old',
      achieved_at: 1,
    },
  );
  harness.personalBests.set(
    personalBestKey('user-2', 'distance', 2000, 0, 0),
    {
      user_id: 'user-2',
      format: 'distance',
      target_value: 2000,
      best_time: 410,
      best_distance: 2000,
      race_id: 'race-old',
      achieved_at: 1,
    },
  );

  setActiveRace('race-1', {
    id: 'race-1',
    creatorId: 'user-1',
    state: 'racing',
    config: {
      format: 'distance',
      target_value: 2000,
      split_value: 500,
    },
    warmupStartTime: Date.now(),
    maxParticipants: 2,
    raceType: 'duel',
    participants: new Map([
      ['user-1', makeParticipant('user-1', 'alice', 420)],
      ['user-2', makeParticipant('user-2', 'bob', 435)],
    ]) as any,
    countdownRemaining: null,
    countdownTimer: null,
    warmupTimer: null,
    readyCheckTimer: null,
    standingsInterval: null,
  });

  const ws = {
    data: {
      raceId: 'race-1',
      userId: 'user-1',
      username: 'alice',
    },
    send() {
      return undefined;
    },
  } as any;

  handleRaceMessage(ws, { type: 'force_finish', race_id: 'race-1' });

  expect(harness.personalBestUpserts).toHaveLength(1);
  expect(harness.personalBestUpserts[0].user_id).toBe('user-1');
  expect(harness.personalBestUpserts[0].best_time).toBe(420);
  expect(harness.personalBests.get(personalBestKey('user-1', 'distance', 2000, 0, 0))?.best_time).toBe(420);
  expect(harness.personalBests.get(personalBestKey('user-2', 'distance', 2000, 0, 0))?.best_time).toBe(410);

  expect(harness.userStats.get('user-1')?.elo).toBe(1032);
  expect(harness.userStats.get('user-1')?.tier).toBe('club');
  expect(harness.userStats.get('user-1')?.division).toBe(4);
  expect(harness.userStats.get('user-1')?.lp).toBe(25);
  expect(harness.userStats.get('user-2')?.elo).toBe(968);
  expect(getAllActiveRaces().has('race-1')).toBe(false);
});

test('checkAchievements unlocks new milestones once and preserves existing unlocks', () => {
  const context = {
    stats: {
      ...defaultStats('user-1'),
      wins: 1,
      total_races: 1,
      best_streak: 1,
    },
    totalPbs: 1,
    raceDistance: 2000,
    isTwoKSubSeven: false,
    wodCompletions: 1,
    highestTier: 'elite' as LeagueTier,
  };

  const firstUnlocks = checkAchievements('user-1', context);
  expect(firstUnlocks.includes('first_race')).toBe(true);
  expect(firstUnlocks.includes('first_win')).toBe(true);
  expect(firstUnlocks.includes('first_pb')).toBe(true);
  expect(firstUnlocks.includes('first_wod')).toBe(true);
  expect(firstUnlocks.includes('reach_club')).toBe(true);
  expect(firstUnlocks.includes('reach_elite')).toBe(true);

  const firstRaceRecord = harness.userAchievements.get(achievementKey('user-1', 'first_race'));
  expect(firstRaceRecord?.progress).toBe(1);
  expect(firstRaceRecord?.unlocked_at).not.toBeNull();

  const secondUnlocks = checkAchievements('user-1', context);
  expect(secondUnlocks).toEqual([]);
  expect(harness.userAchievements.get(achievementKey('user-1', 'first_race'))?.unlocked_at).not.toBeNull();
});

test('wod today returns the current challenge and leaderboard ordering', async () => {
  const today = new Date().toISOString().slice(0, 10);
  harness.dailyChallenges.set(today, {
    id: 'challenge-1',
    date: today,
    format: 'distance',
    target_value: 2000,
    title: 'Daily 2k',
    description: 'Row the daily 2k.',
  });
  harness.wodEntries.set(wodEntryKey('challenge-1', 'user-1'), {
    challenge_id: 'challenge-1',
    user_id: 'user-1',
    race_id: 'race-a',
    result_time: 510,
    result_distance: 2000,
    completed_at: 1,
  });
  harness.wodEntries.set(wodEntryKey('challenge-1', 'user-2'), {
    challenge_id: 'challenge-1',
    user_id: 'user-2',
    race_id: 'race-b',
    result_time: 500,
    result_distance: 2000,
    completed_at: 2,
  });

  const response = await wod.request('/today');
  expect(response.status).toBe(200);

  const body = await response.json() as { challenge: DailyChallenge | null; leaderboard: Array<{ user_id: string; result_time: number | null }> };
  expect(body.challenge?.id).toBe('challenge-1');
  expect(body.leaderboard.map((row) => row.user_id)).toEqual(['user-2', 'user-1']);
});

test('wod submission only replaces the current result when the new performance is better', async () => {
  const today = new Date().toISOString().slice(0, 10);
  harness.dailyChallenges.set(today, {
    id: 'challenge-2',
    date: today,
    format: 'distance',
    target_value: 2000,
    title: 'Daily 2k',
    description: 'Row the daily 2k.',
  });
  harness.wodEntries.set(wodEntryKey('challenge-2', 'user-1'), {
    challenge_id: 'challenge-2',
    user_id: 'user-1',
    race_id: 'race-existing',
    result_time: 460,
    result_distance: 2000,
    completed_at: 1,
  });

  harness.wodRaces.set('race-slower', {
    id: 'race-slower',
    user_id: 'user-1',
    state: 'finished',
    status: 'finished',
    format: 'distance',
    target_value: 2000,
    interval_count: null,
    rest_seconds: null,
    final_time: 470,
    final_distance: 2000,
    final_avg_pace: 120,
  });
  harness.wodRaces.set('race-faster', {
    id: 'race-faster',
    user_id: 'user-1',
    state: 'finished',
    status: 'finished',
    format: 'distance',
    target_value: 2000,
    interval_count: null,
    rest_seconds: null,
    final_time: 430,
    final_distance: 2000,
    final_avg_pace: 110,
  });

  const slowerResponse = await wod.request('/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ race_id: 'race-slower', challenge_id: 'challenge-2' }),
  });
  expect(slowerResponse.status).toBe(200);
  const slowerBody = await slowerResponse.json() as { submitted: boolean };
  expect(slowerBody.submitted).toBe(false);
  expect(harness.wodEntries.get(wodEntryKey('challenge-2', 'user-1'))?.result_time).toBe(460);

  const fasterResponse = await wod.request('/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ race_id: 'race-faster', challenge_id: 'challenge-2' }),
  });
  expect(fasterResponse.status).toBe(200);
  const fasterBody = await fasterResponse.json() as { submitted: boolean; leaderboard: Array<{ user_id: string; result_time: number | null }> };
  expect(fasterBody.submitted).toBe(true);
  expect(harness.wodEntries.get(wodEntryKey('challenge-2', 'user-1'))?.result_time).toBe(430);
  expect(fasterBody.leaderboard[0].user_id).toBe('user-1');
  expect(fasterBody.leaderboard[0].result_time).toBe(430);
});
