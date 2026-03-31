import type { LeagueTier, RaceFormat, UserStats } from '../../shared/types';
import { db, queries } from '../db';
import { seedAchievementDefinitions, checkAchievements } from '../race/achievements';
import { eloToTierDivision } from '../race/elo';

const TARGET_OTHER_USERS = 30;
const DEMO_USERNAME_PREFIX = 'demo_';
const DEMO_RACE_PREFIX = 'demo-race-';
const PASSWORD_SEED = 'oarena-demo-password';

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
  readonly userId: string;
  readonly status: 'finished' | 'dnf';
  readonly placement: number | null;
  readonly finalTime: number | null;
  readonly finalDistance: number | null;
  readonly finalAvgPace: number | null;
  readonly finalCalories: number | null;
  readonly finalStrokeCount: number | null;
};

type PersonalBestCandidate = {
  readonly format: RaceFormat;
  readonly targetValue: number;
  readonly intervalCount: number;
  readonly restSeconds: number;
  readonly bestTime: number | null;
  readonly bestDistance: number | null;
  readonly bestPace: number | null;
  readonly raceId: string;
  readonly achievedAt: number;
};

const DEMO_USERNAMES = [
  'demo_strokecraft',
  'demo_splitpilot',
  'demo_lanehunter',
  'demo_boatspeed',
  'demo_catchburn',
  'demo_ratebandit',
  'demo_slidecontrol',
  'demo_hammerhead',
  'demo_surgewindow',
  'demo_blackwater',
  'demo_last500',
  'demo_bluebuoy',
  'demo_tightcatch',
  'demo_redlinecrew',
  'demo_flywheelfox',
  'demo_pressureleg',
  'demo_arcsteady',
  'demo_mirrorwash',
  'demo_headwind',
  'demo_fastfinisher',
  'demo_metersmatter',
  'demo_rhythmlock',
  'demo_hardten',
  'demo_bowballast',
  'demo_gunwale',
  'demo_breakaway',
  'demo_boatfeel',
  'demo_corepressure',
  'demo_racecraft',
  'demo_silverwake',
];

const RACE_TEMPLATES: Array<{
  raceType: 'duel' | 'group';
  format: RaceFormat;
  targetValue: number;
  splitValue: number;
  intervalCount: number | null;
  restSeconds: number | null;
}> = [
  { raceType: 'duel', format: 'distance', targetValue: 2000, splitValue: 500, intervalCount: null, restSeconds: null },
  { raceType: 'group', format: 'distance', targetValue: 5000, splitValue: 500, intervalCount: null, restSeconds: null },
  { raceType: 'group', format: 'time', targetValue: 1200, splitValue: 300, intervalCount: null, restSeconds: null },
  { raceType: 'group', format: 'distance', targetValue: 1000, splitValue: 250, intervalCount: null, restSeconds: null },
  { raceType: 'duel', format: 'distance', targetValue: 6000, splitValue: 500, intervalCount: null, restSeconds: null },
  { raceType: 'group', format: 'time', targetValue: 900, splitValue: 300, intervalCount: null, restSeconds: null },
];

function dayKey(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function getUsers(): UserRow[] {
  return db
    .query<UserRow, []>(
      `SELECT id, username, created_at
       FROM users
       WHERE deleted_at IS NULL
       ORDER BY created_at ASC, username ASC`,
    )
    .all();
}

function getUserIdsByPrefix(prefix: string): string[] {
  return db
    .query<{ id: string }, [string]>(
      `SELECT id FROM users WHERE username LIKE ? AND deleted_at IS NULL`,
    )
    .all(`${prefix}%`)
    .map((row) => row.id);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function pickSelfUser(users: UserRow[]): UserRow {
  const candidates = users.filter((user) => !user.username.startsWith(DEMO_USERNAME_PREFIX));
  if (candidates.length === 0) {
    throw new Error('No existing non-demo user found. Create your account first, then rerun this seed.');
  }
  return candidates[0];
}

function cleanupPreviousDemoData(activeUserIds: string[]): void {
  const demoUserIds = getUserIdsByPrefix(DEMO_USERNAME_PREFIX);
  const targetIds = [...new Set([...activeUserIds, ...demoUserIds])];

  db.run(`DELETE FROM wod_entries WHERE challenge_id LIKE 'demo-challenge-%'`);
  db.run(`DELETE FROM wod_entries WHERE race_id LIKE '${DEMO_RACE_PREFIX}%'`);
  db.run(`DELETE FROM daily_challenges WHERE id LIKE 'demo-challenge-%'`);
  db.run(`DELETE FROM personal_bests WHERE race_id LIKE '${DEMO_RACE_PREFIX}%'`);
  db.run(`DELETE FROM race_participants WHERE race_id LIKE '${DEMO_RACE_PREFIX}%'`);
  db.run(`DELETE FROM races WHERE id LIKE '${DEMO_RACE_PREFIX}%'`);

  if (targetIds.length > 0) {
    const idPlaceholders = placeholders(targetIds.length);
    db.query(`DELETE FROM user_achievements WHERE user_id IN (${idPlaceholders})`).run(...targetIds);
    db.query(`DELETE FROM personal_bests WHERE user_id IN (${idPlaceholders})`).run(...targetIds);
  }

  if (demoUserIds.length > 0) {
    const demoPlaceholders = placeholders(demoUserIds.length);
    db.query(`DELETE FROM wod_entries WHERE user_id IN (${demoPlaceholders})`).run(...demoUserIds);
    db.query(`DELETE FROM user_stats WHERE user_id IN (${demoPlaceholders})`).run(...demoUserIds);
    db.query(`DELETE FROM users WHERE id IN (${demoPlaceholders})`).run(...demoUserIds);
  }
}

async function ensureDemoUsers(selfUser: UserRow): Promise<UserRow[]> {
  const allUsers = getUsers();
  const existingOthers = allUsers.filter(
    (user) => user.id !== selfUser.id && !user.username.startsWith(DEMO_USERNAME_PREFIX),
  );

  if (existingOthers.length > TARGET_OTHER_USERS) {
    throw new Error(
      `Found ${existingOthers.length} existing non-demo users besides ${selfUser.username}. ` +
      `This seed only supports topping up to exactly ${TARGET_OTHER_USERS} others.`,
    );
  }

  const neededDemoUsers = TARGET_OTHER_USERS - existingOthers.length;
  const passwordHash = await Bun.password.hash(PASSWORD_SEED, {
    algorithm: 'bcrypt',
    cost: 10,
  });

  const now = Date.now();
  for (let index = 0; index < neededDemoUsers; index += 1) {
    const username = DEMO_USERNAMES[index];
    const createdAt = now - (neededDemoUsers - index) * 3_600_000;
    db.query(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      username,
      passwordHash,
      createdAt,
    );
  }

  return getUsers().filter((user) => user.id !== selfUser.id).slice(0, TARGET_OTHER_USERS);
}

function reorderUsersAroundSelf(selfUser: UserRow, otherUsers: UserRow[]): UserRow[] {
  const selfRankIndex = 11;
  const orderedOthers = [...otherUsers];
  const upper = orderedOthers.slice(0, selfRankIndex);
  const lower = orderedOthers.slice(selfRankIndex);
  return [...upper, selfUser, ...lower];
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
    queries.ensureUserStats.run(user.id);
    const stats = leagueStatsForRank(user.id, index);
    queries.updateUserStats.run(
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

function distanceForRace(format: RaceFormat, targetValue: number, intervalCount: number | null): number {
  if (format === 'distance') return targetValue;
  if (format === 'interval_distance') return targetValue * (intervalCount ?? 1);
  return 0;
}

function timeForRace(format: RaceFormat, targetValue: number, intervalCount: number | null): number {
  if (format === 'time') return targetValue;
  if (format === 'interval_time') return targetValue * (intervalCount ?? 1);
  return 0;
}

function resultForParticipant(
  rankPosition: number,
  userCount: number,
  format: RaceFormat,
  targetValue: number,
  intervalCount: number | null,
): Omit<RaceResultSeed, 'userId' | 'status' | 'placement'> {
  const strength = userCount - rankPosition;

  if (format === 'distance' || format === 'interval_distance') {
    const totalDistance = distanceForRace(format, targetValue, intervalCount);
    const pace = 101 + rankPosition * 1.85 + (rankPosition % 3) * 0.6;
    const finalTime = Math.round((totalDistance / 500) * pace);
    return {
      finalTime,
      finalDistance: totalDistance,
      finalAvgPace: Math.round(pace),
      finalCalories: Math.round(totalDistance * 0.42),
      finalStrokeCount: Math.round(totalDistance / 9.2),
    };
  }

  const totalTime = timeForRace(format, targetValue, intervalCount);
  const finalDistance = 6_050 - rankPosition * 120 - (rankPosition % 4) * 24 + strength * 4;
  const finalAvgPace = Math.round(totalTime / Math.max(finalDistance / 500, 1));
  return {
    finalTime: totalTime,
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
      warmup_start_time, max_participants, state, created_at, interval_count, rest_seconds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      `INSERT INTO race_participants (race_id, user_id, status, joined_at)
       VALUES (?, ?, ?, ?)`,
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
         final_calories = ?, final_stroke_count = ?, placement = ?
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

  const intervalCount = race.intervalCount ?? 0;
  const restSeconds = race.restSeconds ?? 0;
  const key = [userId, race.format, race.targetValue, intervalCount, restSeconds].join('|');
  const nextCandidate: PersonalBestCandidate = {
    format: race.format,
    targetValue: race.targetValue,
    intervalCount,
    restSeconds,
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

  const isDistanceRace = race.format === 'distance' || race.format === 'interval_distance';
  const shouldReplace = isDistanceRace
    ? (previous.bestTime == null || (nextCandidate.bestTime != null && nextCandidate.bestTime < previous.bestTime))
    : (previous.bestDistance == null || (nextCandidate.bestDistance != null && nextCandidate.bestDistance > previous.bestDistance));

  if (shouldReplace) {
    store.set(key, nextCandidate);
  }
}

function seedHistoricalRaces(
  rankedUsers: UserRow[],
  selfUser: UserRow,
): {
  personalBestStore: Map<string, PersonalBestCandidate>;
  historyRaceIds: string[];
} {
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

    if (includeSelf && creator.id !== selfUser.id) {
      selectedUsers.push(selfUser);
    }

    for (const candidate of pool) {
      if (selectedUsers.length >= participantCount) break;
      if (selectedUsers.some((user) => user.id === candidate.id)) continue;
      selectedUsers.push(candidate);
    }

    const createdAt = now - (index + 1) * 5 * 3_600_000;
    const race: RaceSeed = {
      id: `${DEMO_RACE_PREFIX}history-${String(index + 1).padStart(2, '0')}`,
      creatorId: creator.id,
      raceType: template.raceType,
      format: template.format,
      targetValue: template.targetValue,
      splitValue: template.splitValue,
      intervalCount: template.intervalCount,
      restSeconds: template.restSeconds,
      maxParticipants: template.raceType === 'duel' ? 2 : Math.max(participantCount, 6),
      warmupStartTime: createdAt + 300_000,
      createdAt,
      state: 'finished',
      participantUserIds: selectedUsers.map((user) => user.id),
    };

    insertRace(race);
    historyRaceIds.push(race.id);

    const orderedParticipants = [...selectedUsers];
    for (const [position, user] of orderedParticipants.entries()) {
      const metrics = resultForParticipant(
        position,
        orderedParticipants.length,
        race.format,
        race.targetValue,
        race.intervalCount,
      );
      const result: RaceResultSeed = {
        userId: user.id,
        status: 'finished',
        placement: position + 1,
        ...metrics,
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
      id: `${DEMO_RACE_PREFIX}canceled-${String(index + 1).padStart(2, '0')}`,
      creatorId: creator.id,
      raceType: 'group',
      format: template.format,
      targetValue: template.targetValue,
      splitValue: template.splitValue,
      intervalCount: template.intervalCount,
      restSeconds: template.restSeconds,
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

    const createdAt = now - index * 900_000;
    const race: RaceSeed = {
      id: `${DEMO_RACE_PREFIX}open-${String(index + 1).padStart(2, '0')}`,
      creatorId: creator.id,
      raceType: template.raceType,
      format: template.format,
      targetValue: template.targetValue,
      splitValue: template.splitValue,
      intervalCount: template.intervalCount,
      restSeconds: template.restSeconds,
      maxParticipants: template.raceType === 'duel' ? 2 : 8,
      warmupStartTime: now + (index + 2) * 180_000,
      createdAt,
      state: 'open',
      participantUserIds: participants.map((user) => user.id),
    };

    insertRace(race);
  }
}

function upsertPersonalBests(store: Map<string, PersonalBestCandidate>): void {
  for (const [key, candidate] of store.entries()) {
    const [userId] = key.split('|');
    queries.upsertPersonalBest.run(
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

  const numeric = date.replace(/-/g, '').split('').reduce((sum, char) => sum + Number(char), 0);
  const templates = [
    { format: 'distance' as const, targetValue: 2000, title: 'Daily 2K', description: 'Set your fastest 2,000m time today.' },
    { format: 'distance' as const, targetValue: 5000, title: 'Steady 5K', description: 'Hold pace through a long piece.' },
    { format: 'time' as const, targetValue: 1200, title: '20-Minute Grind', description: 'Row as far as possible in 20 minutes.' },
    { format: 'distance' as const, targetValue: 1000, title: 'One-K Burner', description: 'Sprint a sharp 1,000m effort.' },
    { format: 'distance' as const, targetValue: 6000, title: 'Strength 6K', description: 'A long aerobic race with consequences.' },
    { format: 'time' as const, targetValue: 900, title: '15-Minute Push', description: 'Fifteen minutes to hold form under pressure.' },
  ];
  const template = templates[numeric % templates.length];
  const challengeId = `demo-challenge-${date}`;
  queries.insertDailyChallenge.run(
    challengeId,
    date,
    template.format,
    template.targetValue,
    null,
    null,
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
      const isDistanceBased =
        challenge.format === 'distance' || challenge.format === 'interval_distance';
      const resultTime = isDistanceBased
        ? Math.round((distanceForRace(challenge.format, challenge.target_value, challenge.interval_count) / 500) * (103 + index * 1.4))
        : null;
      const resultDistance = isDistanceBased
        ? null
        : 5_900 - index * 105 - daysAgo * 12;

      queries.upsertWodEntry.run(
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

function rebuildAchievements(
  rankedUsers: UserRow[],
  statsByUserId: Map<string, UserStats & { demotion_shield: number }>,
  wodCompletions: Map<string, number>,
): void {
  for (const user of rankedUsers) {
    const stats = statsByUserId.get(user.id);
    if (!stats) continue;

    const personalBests = queries.getPersonalBests.all(user.id) as Array<{
      best_time?: number;
      target_value: number;
    }>;

    const fastest2k = personalBests.find(
      (record) => record.target_value === 2000 && typeof record.best_time === 'number',
    );
    const furthestDistance = personalBests.reduce((max, record) => {
      return Math.max(max, record.target_value);
    }, 0);

    checkAchievements(user.id, {
      stats,
      totalPbs: personalBests.length,
      raceDistance: furthestDistance,
      isTwoKSubSeven: typeof fastest2k?.best_time === 'number' && fastest2k.best_time < 420,
      wodCompletions: wodCompletions.get(user.id) ?? 0,
      highestTier: stats.tier as LeagueTier,
    });
  }
}

async function run(): Promise<void> {
  const initialUsers = getUsers();
  const selfUser = pickSelfUser(initialUsers);

  db.transaction(() => {
    cleanupPreviousDemoData(initialUsers.map((user) => user.id));
    seedAchievementDefinitions();
  })();

  const otherUsers = await ensureDemoUsers(selfUser);
  const rankedUsers = reorderUsersAroundSelf(selfUser, otherUsers);

  db.transaction(() => {
    const statsByUserId = upsertStatsForUsers(rankedUsers);
    const { personalBestStore, historyRaceIds } = seedHistoricalRaces(rankedUsers, selfUser);
    seedOpenRaces(rankedUsers, selfUser);
    upsertPersonalBests(personalBestStore);
    const wodCompletions = insertWodEntries(rankedUsers, historyRaceIds);
    rebuildAchievements(rankedUsers, statsByUserId, wodCompletions);
  })();

  const counts = {
    users: db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL`,
    ).get().count,
    openRaces: db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM races WHERE id LIKE '${DEMO_RACE_PREFIX}open-%'`,
    ).get().count,
    finishedRaces: db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM races WHERE id LIKE '${DEMO_RACE_PREFIX}history-%'`,
    ).get().count,
    canceledRaces: db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM races WHERE id LIKE '${DEMO_RACE_PREFIX}canceled-%'`,
    ).get().count,
    dailyChallenges: db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM daily_challenges`,
    ).get().count,
    wodEntries: db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM wod_entries`,
    ).get().count,
  };

  console.log(JSON.stringify({
    ok: true,
    selfUser: {
      id: selfUser.id,
      username: selfUser.username,
    },
    otherActiveUsers: TARGET_OTHER_USERS,
    counts,
  }, null, 2));
}

run().catch((error) => {
  console.error(
    error instanceof Error ? `[seed-demo-data] ${error.message}` : '[seed-demo-data] unknown error',
  );
  process.exit(1);
}).finally(() => {
  db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
});
