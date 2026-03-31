import type { LeagueTier, RaceFormat, UserStats } from '../../shared/types';
import { db, queries } from '../db';
import { checkAchievements, seedAchievementDefinitions } from '../race/achievements';
import { eloToTierDivision } from '../race/elo';

const TARGET_OTHER_USERS = 30;
const DEFAULT_SELF_USERNAME = 'test_zarret';
const DEFAULT_SELF_PASSWORD = 'oarena-demo-password';
const TEST_RACE_PREFIX = 'test-race-';
const TEST_CHALLENGE_PREFIX = 'test-challenge-';

type SeedOptions = {
  selfUsername: string;
  password: string;
};

type UserRow = {
  id: string;
  username: string;
  created_at: number;
};

type ChallengeRow = {
  id: string;
  date: string;
  format: RaceFormat;
  target_value: number;
  interval_count: number | null;
  rest_seconds: number | null;
  title: string;
  description: string;
};

type RaceSeed = {
  id: string;
  creatorId: string;
  raceType: 'duel' | 'group';
  format: RaceFormat;
  targetValue: number;
  splitValue: number;
  intervalCount: number | null;
  restSeconds: number | null;
  maxParticipants: number;
  warmupStartTime: number;
  createdAt: number;
  state: 'open' | 'finished' | 'canceled';
  participantUserIds: string[];
};

type RaceResultSeed = {
  userId: string;
  status: 'finished' | 'dnf';
  placement: number | null;
  finalTime: number | null;
  finalDistance: number | null;
  finalAvgPace: number | null;
  finalCalories: number | null;
  finalStrokeCount: number | null;
};

type PersonalBestCandidate = {
  format: RaceFormat;
  targetValue: number;
  intervalCount: number;
  restSeconds: number;
  bestTime: number | null;
  bestDistance: number | null;
  bestPace: number | null;
  raceId: string;
  achievedAt: number;
};

const TEST_USERNAMES = [
  'test_strokecraft',
  'test_splitpilot',
  'test_lanehunter',
  'test_boatspeed',
  'test_catchburn',
  'test_ratebandit',
  'test_slidecontrol',
  'test_hammerhead',
  'test_surgewindow',
  'test_blackwater',
  'test_last500',
  'test_bluebuoy',
  'test_tightcatch',
  'test_redlinecrew',
  'test_flywheelfox',
  'test_pressureleg',
  'test_arcsteady',
  'test_mirrorwash',
  'test_headwind',
  'test_fastfinisher',
  'test_metersmatter',
  'test_rhythmlock',
  'test_hardten',
  'test_bowballast',
  'test_gunwale',
  'test_breakaway',
  'test_boatfeel',
  'test_corepressure',
  'test_racecraft',
  'test_silverwake',
];

const RACE_TEMPLATES: Array<{
  raceType: 'duel' | 'group';
  format: RaceFormat;
  targetValue: number;
  splitValue: number;
}> = [
  { raceType: 'duel', format: 'distance', targetValue: 2000, splitValue: 500 },
  { raceType: 'group', format: 'distance', targetValue: 5000, splitValue: 500 },
  { raceType: 'group', format: 'time', targetValue: 1200, splitValue: 300 },
  { raceType: 'group', format: 'distance', targetValue: 1000, splitValue: 250 },
  { raceType: 'duel', format: 'distance', targetValue: 6000, splitValue: 500 },
  { raceType: 'group', format: 'time', targetValue: 900, splitValue: 300 },
];

function parseArgs(argv: string[]): SeedOptions {
  const options: SeedOptions = {
    selfUsername: DEFAULT_SELF_USERNAME,
    password: DEFAULT_SELF_PASSWORD,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--self-username') {
      const value = argv[index + 1];
      if (!value) throw new Error('--self-username requires a value');
      options.selfUsername = value.trim();
      index += 1;
      continue;
    }

    if (arg === '--password') {
      const value = argv[index + 1];
      if (!value) throw new Error('--password requires a value');
      options.password = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.selfUsername) {
    throw new Error('self username cannot be empty');
  }

  return options;
}

function dayKey(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function getTestUsers(): UserRow[] {
  return db
    .query<UserRow, []>(
      `SELECT id, username, created_at
       FROM users
       WHERE is_test = 1 AND deleted_at IS NULL
       ORDER BY created_at ASC, username ASC`,
    )
    .all();
}

function clearExistingTestData(): void {
  db.transaction(() => {
    db.run(`DELETE FROM wod_entries WHERE is_test = 1`);
    db.run(`DELETE FROM personal_bests WHERE is_test = 1`);
    db.run(`DELETE FROM user_achievements WHERE is_test = 1`);
    db.run(`DELETE FROM race_participants WHERE is_test = 1`);
    db.run(`DELETE FROM daily_challenges WHERE is_test = 1`);
    db.run(`DELETE FROM user_stats WHERE is_test = 1`);
    db.run(`DELETE FROM races WHERE is_test = 1`);
    db.run(`DELETE FROM users WHERE is_test = 1`);
  })();
}

async function createTestUsers(options: SeedOptions): Promise<{ selfUser: UserRow; otherUsers: UserRow[] }> {
  const passwordHash = await Bun.password.hash(options.password, {
    algorithm: 'bcrypt',
    cost: 10,
  });

  const createdAtBase = Date.now() - (TARGET_OTHER_USERS + 1) * 3_600_000;
  const usernames = [options.selfUsername, ...TEST_USERNAMES];

  for (const [index, username] of usernames.entries()) {
    db.query(
      `INSERT INTO users (id, username, password_hash, created_at, is_test)
       VALUES (?, ?, ?, ?, 1)`,
    ).run(
      crypto.randomUUID(),
      username,
      passwordHash,
      createdAtBase + index * 3_600_000,
    );
  }

  const users = getTestUsers();
  const selfUser = users.find((user) => user.username === options.selfUsername);
  if (!selfUser) {
    throw new Error(`Failed to create self test user ${options.selfUsername}`);
  }

  const otherUsers = users.filter((user) => user.id !== selfUser.id).slice(0, TARGET_OTHER_USERS);
  return { selfUser, otherUsers };
}

function reorderUsersAroundSelf(selfUser: UserRow, otherUsers: UserRow[]): UserRow[] {
  const selfRankIndex = 11;
  return [
    ...otherUsers.slice(0, selfRankIndex),
    selfUser,
    ...otherUsers.slice(selfRankIndex),
  ];
}

function leagueStatsForRank(userId: string, rankIndex: number): UserStats & { demotion_shield: number } {
  const elo = Math.max(850, 2190 - rankIndex * 39 - Math.floor(rankIndex / 4) * 6);
  const { tier, division } = eloToTierDivision(elo);
  const lp = rankIndex === 11 ? 78 : 12 + ((rankIndex * 19) % 83);
  const wins = Math.max(8, 42 - rankIndex + (rankIndex % 4));
  const losses = 6 + rankIndex + (rankIndex % 3);
  const totalRaces = wins + losses;
  const totalMeters = 42_000 + totalRaces * (1_900 + (rankIndex % 5) * 180);
  const totalTime = totalRaces * (430 + (rankIndex % 4) * 27);
  const currentStreak = rankIndex % 7 === 0 ? 0 : Math.max(1, 6 - (rankIndex % 6));
  const bestStreak = currentStreak + 2 + (rankIndex % 4);
  const placementRaces = Math.min(totalRaces, 5 + (rankIndex % 9));

  return {
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
    demotion_shield: division === 4 && ['varsity', 'elite', 'olympic'].includes(tier) ? 1 : 0,
  };
}

function upsertStatsForUsers(rankedUsers: UserRow[]): Map<string, UserStats & { demotion_shield: number }> {
  const statsByUserId = new Map<string, UserStats & { demotion_shield: number }>();

  for (const [index, user] of rankedUsers.entries()) {
    db.query(
      `INSERT INTO user_stats (user_id, is_test) VALUES (?, 1)
       ON CONFLICT(user_id) DO UPDATE SET is_test = 1`,
    ).run(user.id);

    const stats = leagueStatsForRank(user.id, index);
    db.query(
      `UPDATE user_stats
       SET elo = ?, tier = ?, division = ?, lp = ?, wins = ?, losses = ?, total_races = ?,
           total_meters = ?, total_time = ?, current_streak = ?, best_streak = ?,
           placement_races = ?, demotion_shield = ?, is_test = 1
       WHERE user_id = ?`,
    ).run(
      stats.elo,
      stats.tier,
      stats.division,
      stats.lp,
      stats.wins,
      stats.losses,
      stats.total_races,
      stats.total_meters,
      stats.total_time,
      stats.current_streak,
      stats.best_streak,
      stats.placement_races,
      stats.demotion_shield,
      user.id,
    );

    statsByUserId.set(user.id, stats);
  }

  return statsByUserId;
}

function resultForParticipant(rankPosition: number, userCount: number, format: RaceFormat, targetValue: number): Omit<RaceResultSeed, 'userId' | 'status' | 'placement'> {
  const strength = userCount - rankPosition;

  if (format === 'distance') {
    const pace = 101 + rankPosition * 1.85 + (rankPosition % 3) * 0.6;
    const finalTime = Math.round((targetValue / 500) * pace);
    return {
      finalTime,
      finalDistance: targetValue,
      finalAvgPace: Math.round(pace),
      finalCalories: Math.round(targetValue * 0.42),
      finalStrokeCount: Math.round(targetValue / 9.2),
    };
  }

  const finalDistance = 6_050 - rankPosition * 120 - (rankPosition % 4) * 24 + strength * 4;
  const finalAvgPace = Math.round(targetValue / Math.max(finalDistance / 500, 1));
  return {
    finalTime: targetValue,
    finalDistance,
    finalAvgPace,
    finalCalories: Math.round(finalDistance * 0.4),
    finalStrokeCount: Math.round(finalDistance / 9.6),
  };
}

function insertRace(seed: RaceSeed): void {
  db.query(
    `INSERT INTO races (
      id, creator_id, race_type, format, target_value, split_value,
      warmup_start_time, max_participants, state, created_at, interval_count, rest_seconds, is_test
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(
    seed.id,
    seed.creatorId,
    seed.raceType,
    seed.format,
    seed.targetValue,
    seed.splitValue,
    seed.warmupStartTime,
    seed.maxParticipants,
    seed.state,
    seed.createdAt,
    seed.intervalCount,
    seed.restSeconds,
  );

  for (const [index, userId] of seed.participantUserIds.entries()) {
    db.query(
      `INSERT INTO race_participants (race_id, user_id, status, joined_at, is_test)
       VALUES (?, ?, ?, ?, 1)`,
    ).run(
      seed.id,
      userId,
      seed.state === 'open' ? 'joined' : 'finished',
      seed.createdAt + index * 30_000,
    );
  }
}

function updateParticipantResult(raceId: string, result: RaceResultSeed): void {
  db.query(
    `UPDATE race_participants
     SET status = ?, final_time = ?, final_distance = ?, final_avg_pace = ?,
         final_calories = ?, final_stroke_count = ?, placement = ?, is_test = 1
     WHERE race_id = ? AND user_id = ?`,
  ).run(
    result.status,
    result.finalTime,
    result.finalDistance,
    result.finalAvgPace,
    result.finalCalories,
    result.finalStrokeCount,
    result.placement,
    raceId,
    result.userId,
  );
}

function maybeStorePersonalBest(
  store: Map<string, PersonalBestCandidate>,
  userId: string,
  race: RaceSeed,
  result: RaceResultSeed,
): void {
  if (result.status !== 'finished') return;

  const key = [userId, race.format, race.targetValue, 0, 0].join('|');
  const nextCandidate: PersonalBestCandidate = {
    format: race.format,
    targetValue: race.targetValue,
    intervalCount: 0,
    restSeconds: 0,
    bestTime: result.finalTime,
    bestDistance: result.finalDistance,
    bestPace: result.finalAvgPace,
    raceId: race.id,
    achievedAt: race.createdAt,
  };

  const previous = store.get(key);
  if (!previous) {
    store.set(key, nextCandidate);
    return;
  }

  const shouldReplace = race.format === 'distance'
    ? (previous.bestTime == null || (nextCandidate.bestTime != null && nextCandidate.bestTime < previous.bestTime))
    : (previous.bestDistance == null || (nextCandidate.bestDistance != null && nextCandidate.bestDistance > previous.bestDistance));

  if (shouldReplace) store.set(key, nextCandidate);
}

function seedHistoricalRaces(rankedUsers: UserRow[], selfUser: UserRow): { personalBestStore: Map<string, PersonalBestCandidate>; historyRaceIds: string[] } {
  const personalBestStore = new Map<string, PersonalBestCandidate>();
  const historyRaceIds: string[] = [];
  const now = Date.now();

  for (let index = 0; index < 18; index += 1) {
    const template = RACE_TEMPLATES[index % RACE_TEMPLATES.length];
    const includeSelf = index < 12 || index % 3 === 0;
    const creator = rankedUsers[(index * 3) % rankedUsers.length];
    const pool = rankedUsers.filter((user) => user.id !== creator.id);
    const participantCount = template.raceType === 'duel' ? 2 : 4 + (index % 4);
    const selectedUsers = [creator];

    if (includeSelf && creator.id !== selfUser.id) selectedUsers.push(selfUser);

    for (const candidate of pool) {
      if (selectedUsers.length >= participantCount) break;
      if (selectedUsers.some((user) => user.id === candidate.id)) continue;
      selectedUsers.push(candidate);
    }

    const createdAt = now - (index + 1) * 5 * 3_600_000;
    const race: RaceSeed = {
      id: `${TEST_RACE_PREFIX}history-${String(index + 1).padStart(2, '0')}`,
      creatorId: creator.id,
      raceType: template.raceType,
      format: template.format,
      targetValue: template.targetValue,
      splitValue: template.splitValue,
      intervalCount: null,
      restSeconds: null,
      maxParticipants: template.raceType === 'duel' ? 2 : Math.max(participantCount, 6),
      warmupStartTime: createdAt + 300_000,
      createdAt,
      state: 'finished',
      participantUserIds: selectedUsers.map((user) => user.id),
    };

    insertRace(race);
    historyRaceIds.push(race.id);

    for (const [position, user] of selectedUsers.entries()) {
      const result: RaceResultSeed = {
        userId: user.id,
        status: 'finished',
        placement: position + 1,
        ...resultForParticipant(position, selectedUsers.length, race.format, race.targetValue),
      };
      updateParticipantResult(race.id, result);
      maybeStorePersonalBest(personalBestStore, user.id, race, result);
    }
  }

  for (let index = 0; index < 3; index += 1) {
    const template = RACE_TEMPLATES[(index + 2) % RACE_TEMPLATES.length];
    const creator = rankedUsers[(index * 5 + 4) % rankedUsers.length];
    const selectedUsers = [creator, selfUser, rankedUsers[(index * 7 + 2) % rankedUsers.length]]
      .filter((user, userIndex, list) => list.findIndex((item) => item.id === user.id) === userIndex)
      .slice(0, 3);

    const createdAt = now - (index + 1) * 13 * 3_600_000;
    const race: RaceSeed = {
      id: `${TEST_RACE_PREFIX}canceled-${String(index + 1).padStart(2, '0')}`,
      creatorId: creator.id,
      raceType: 'group',
      format: template.format,
      targetValue: template.targetValue,
      splitValue: template.splitValue,
      intervalCount: null,
      restSeconds: null,
      maxParticipants: 6,
      warmupStartTime: createdAt + 300_000,
      createdAt,
      state: 'canceled',
      participantUserIds: selectedUsers.map((user) => user.id),
    };

    insertRace(race);
    for (const user of selectedUsers) {
      updateParticipantResult(race.id, {
        userId: user.id,
        status: 'dnf',
        placement: null,
        finalTime: null,
        finalDistance: null,
        finalAvgPace: null,
        finalCalories: null,
        finalStrokeCount: null,
      });
    }
  }

  return { personalBestStore, historyRaceIds };
}

function seedOpenRaces(rankedUsers: UserRow[], selfUser: UserRow): void {
  const now = Date.now();

  for (let index = 0; index < 6; index += 1) {
    const template = RACE_TEMPLATES[(index + 1) % RACE_TEMPLATES.length];
    const creator = index === 1 ? selfUser : rankedUsers[(index * 4 + 3) % rankedUsers.length];
    const participantCount = template.raceType === 'duel' ? 2 : 3 + (index % 3);
    const participants = [creator];

    for (const candidate of rankedUsers) {
      if (participants.length >= participantCount) break;
      if (participants.some((user) => user.id === candidate.id)) continue;
      participants.push(candidate);
    }

    insertRace({
      id: `${TEST_RACE_PREFIX}open-${String(index + 1).padStart(2, '0')}`,
      creatorId: creator.id,
      raceType: template.raceType,
      format: template.format,
      targetValue: template.targetValue,
      splitValue: template.splitValue,
      intervalCount: null,
      restSeconds: null,
      maxParticipants: template.raceType === 'duel' ? 2 : 8,
      warmupStartTime: now + (index + 2) * 180_000,
      createdAt: now - index * 900_000,
      state: 'open',
      participantUserIds: participants.map((user) => user.id),
    });
  }
}

function upsertPersonalBests(store: Map<string, PersonalBestCandidate>): void {
  for (const [key, candidate] of store.entries()) {
    const [userId] = key.split('|');
    db.query(
      `INSERT INTO personal_bests (
         user_id, format, target_value, interval_count, rest_seconds,
         best_time, best_distance, best_pace, race_id, achieved_at, is_test
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(user_id, format, target_value, interval_count, rest_seconds) DO UPDATE SET
         best_time = excluded.best_time,
         best_distance = excluded.best_distance,
         best_pace = excluded.best_pace,
         race_id = excluded.race_id,
         achieved_at = excluded.achieved_at,
         is_test = 1`,
    ).run(
      userId,
      candidate.format,
      candidate.targetValue,
      candidate.intervalCount,
      candidate.restSeconds,
      candidate.bestTime,
      candidate.bestDistance,
      candidate.bestPace,
      candidate.raceId,
      candidate.achievedAt,
    );
  }
}

function upsertChallenge(date: string): ChallengeRow {
  const existing = queries.getWodToday.get(date) as ChallengeRow | null;
  if (existing) return existing;

  const templates = [
    { format: 'distance' as const, targetValue: 2000, title: 'Daily 2K', description: 'Set your fastest 2,000m time today.' },
    { format: 'distance' as const, targetValue: 5000, title: 'Steady 5K', description: 'Hold pace through a long piece.' },
    { format: 'time' as const, targetValue: 1200, title: '20-Minute Grind', description: 'Row as far as possible in 20 minutes.' },
    { format: 'distance' as const, targetValue: 1000, title: 'One-K Burner', description: 'Sprint a sharp 1,000m effort.' },
    { format: 'distance' as const, targetValue: 6000, title: 'Strength 6K', description: 'A long aerobic race with consequences.' },
    { format: 'time' as const, targetValue: 900, title: '15-Minute Push', description: 'Fifteen minutes to hold form under pressure.' },
  ];

  const numeric = date.replace(/-/g, '').split('').reduce((sum, char) => sum + Number(char), 0);
  const template = templates[numeric % templates.length];
  const challengeId = `${TEST_CHALLENGE_PREFIX}${date}`;

  db.query(
    `INSERT INTO daily_challenges (
       id, date, format, target_value, interval_count, rest_seconds, title, description, is_test
     ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 1)`,
  ).run(
    challengeId,
    date,
    template.format,
    template.targetValue,
    template.title,
    template.description,
  );

  return queries.getWodToday.get(date) as ChallengeRow;
}

function insertWodEntries(rankedUsers: UserRow[], historyRaceIds: string[]): Map<string, number> {
  const completions = new Map<string, number>();

  for (let daysAgo = 0; daysAgo < 7; daysAgo += 1) {
    const challenge = upsertChallenge(dayKey(daysAgo));
    const userCount = 10 + ((daysAgo + 2) % 5);

    for (let index = 0; index < userCount; index += 1) {
      const user = rankedUsers[index];
      if (!user) break;

      const completedAt = Date.now() - daysAgo * 86_400_000 - index * 61_000;
      const isDistanceBased = challenge.format === 'distance' || challenge.format === 'interval_distance';
      const resultTime = isDistanceBased
        ? Math.round((((challenge.format === 'interval_distance' ? challenge.target_value * (challenge.interval_count ?? 1) : challenge.target_value) / 500)) * (103 + index * 1.4))
        : null;
      const resultDistance = isDistanceBased ? null : 5_900 - index * 105 - daysAgo * 12;

      db.query(
        `INSERT INTO wod_entries (
           challenge_id, user_id, race_id, result_time, result_distance, completed_at, is_test
         ) VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(challenge_id, user_id) DO UPDATE SET
           race_id = excluded.race_id,
           result_time = excluded.result_time,
           result_distance = excluded.result_distance,
           completed_at = excluded.completed_at,
           is_test = 1`,
      ).run(
        challenge.id,
        user.id,
        historyRaceIds[(daysAgo * 7 + index) % historyRaceIds.length],
        resultTime,
        resultDistance,
        completedAt,
      );

      completions.set(user.id, (completions.get(user.id) ?? 0) + 1);
    }
  }

  return completions;
}

function rebuildAchievements(rankedUsers: UserRow[], statsByUserId: Map<string, UserStats & { demotion_shield: number }>, wodCompletions: Map<string, number>): void {
  for (const user of rankedUsers) {
    const stats = statsByUserId.get(user.id);
    if (!stats) continue;

    const personalBests = queries.getPersonalBests.all(user.id) as Array<{ best_time?: number; target_value: number }>;
    const fastest2k = personalBests.find((record) => record.target_value === 2000 && typeof record.best_time === 'number');
    const furthestDistance = personalBests.reduce((max, record) => Math.max(max, record.target_value), 0);

    checkAchievements(user.id, {
      stats,
      totalPbs: personalBests.length,
      raceDistance: furthestDistance,
      isTwoKSubSeven: typeof fastest2k?.best_time === 'number' && fastest2k.best_time < 420,
      wodCompletions: wodCompletions.get(user.id) ?? 0,
      highestTier: stats.tier as LeagueTier,
    });

    db.query(`UPDATE user_achievements SET is_test = 1 WHERE user_id = ?`).run(user.id);
  }
}

function count(table: string): number {
  return db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table} WHERE is_test = 1`).get().count;
}

async function run(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));

  clearExistingTestData();
  seedAchievementDefinitions();

  const { selfUser, otherUsers } = await createTestUsers(options);
  const rankedUsers = reorderUsersAroundSelf(selfUser, otherUsers);

  db.transaction(() => {
    const statsByUserId = upsertStatsForUsers(rankedUsers);
    const { personalBestStore, historyRaceIds } = seedHistoricalRaces(rankedUsers, selfUser);
    seedOpenRaces(rankedUsers, selfUser);
    upsertPersonalBests(personalBestStore);
    const wodCompletions = insertWodEntries(rankedUsers, historyRaceIds);
    rebuildAchievements(rankedUsers, statsByUserId, wodCompletions);
  })();

  console.log(JSON.stringify({
    ok: true,
    login: {
      username: options.selfUsername,
      password: options.password,
    },
    counts: {
      users: count('users'),
      races: count('races'),
      participants: count('race_participants'),
      stats: count('user_stats'),
      personalBests: count('personal_bests'),
      achievements: count('user_achievements'),
      dailyChallenges: count('daily_challenges'),
      wodEntries: count('wod_entries'),
    },
  }, null, 2));
}

run().catch((error) => {
  console.error(
    error instanceof Error ? `[seed-test-data] ${error.message}` : '[seed-test-data] Unknown error',
  );
  process.exit(1);
}).finally(() => {
  db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
});
