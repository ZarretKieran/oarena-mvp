import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = mkdtempSync(join(tmpdir(), 'oarena-progression-'));
process.env.DB_PATH = join(testDir, 'progression-test.db');

const { queries } = await import('../db');
const { calculateEloChanges, applyLpChange } = await import('../race/elo');
const { seedAchievementDefinitions } = await import('../race/achievements');

beforeAll(() => {
  seedAchievementDefinitions();
});

function insertFinishedRace(id: string, userId: string, format: 'distance' | 'time', targetValue: number) {
  queries.insertRace.run(
    id,
    userId,
    'duel',
    format,
    targetValue,
    format === 'distance' ? 500 : 300,
    Date.now() + 60_000,
    2,
    Date.now(),
    null,
    null,
  );
  queries.insertParticipant.run(id, userId, Date.now());
  queries.updateRaceState.run('finished', id);
  queries.updateParticipantResult.run(
    format === 'distance' ? 420 : 1200,
    format === 'distance' ? targetValue : 5000,
    105,
    100,
    200,
    1,
    'finished',
    id,
    userId,
  );
}

describe('elo progression', () => {
  test('duel winner gains rating and loser loses rating', () => {
    const [winner, loser] = calculateEloChanges([
      { userId: 'winner', elo: 1000, placementRaces: 0, placement: 1, status: 'finished' },
      { userId: 'loser', elo: 1000, placementRaces: 0, placement: 2, status: 'finished' },
    ]);

    expect(winner.eloDelta).toBeGreaterThan(0);
    expect(loser.eloDelta).toBeLessThan(0);
    expect(winner.newElo).toBeGreaterThan(loser.newElo);
  });

  test('multiplayer standings reward higher finish', () => {
    const results = calculateEloChanges([
      { userId: 'u1', elo: 1000, placementRaces: 5, placement: 1, status: 'finished' },
      { userId: 'u2', elo: 1000, placementRaces: 5, placement: 2, status: 'finished' },
      { userId: 'u3', elo: 1000, placementRaces: 5, placement: 3, status: 'finished' },
    ]);

    const deltas = Object.fromEntries(results.map((result) => [result.userId, result.eloDelta]));
    expect(deltas.u1).toBeGreaterThan(deltas.u2);
    expect(deltas.u2).toBeGreaterThan(deltas.u3);
  });

  test('lp change promotes after crossing 100', () => {
    const next = applyLpChange({
      elo: 1090,
      tier: 'club',
      division: 4,
      lp: 90,
      demotionShield: 0,
    }, 18);

    expect(next.isPromotion).toBeTrue();
    expect(next.division).toBe(3);
    expect(next.lp).toBe(8);
  });
});

describe('progression persistence', () => {
  test('achievement definitions are seeded', () => {
    const defs = queries.listAchievementDefs.all();
    expect(defs.length).toBeGreaterThanOrEqual(16);
    expect(defs.some((item: any) => item.id === 'first_win')).toBeTrue();
  });

  test('personal best rows upsert and replace previous marks', () => {
    queries.insertUser.run('pb-user', 'pb_user', 'hash', Date.now());
    insertFinishedRace('race-1', 'pb-user', 'distance', 2000);
    insertFinishedRace('race-2', 'pb-user', 'distance', 2000);
    queries.upsertPersonalBest.run(
      'pb-user',
      'distance',
      2000,
      0,
      0,
      430,
      2000,
      107.5,
      'race-1',
      Date.now(),
    );
    queries.upsertPersonalBest.run(
      'pb-user',
      'distance',
      2000,
      0,
      0,
      420,
      2000,
      105,
      'race-2',
      Date.now(),
    );

    const pb = queries.getPersonalBest.get('pb-user', 'distance', 2000, 0, 0);
    expect(pb.best_time).toBe(420);
    expect(pb.race_id).toBe('race-2');
  });

  test('daily challenge and wod entry persist cleanly', () => {
    queries.insertUser.run('wod-user', 'wod_user', 'hash', Date.now());
    insertFinishedRace('wod-race-1', 'wod-user', 'distance', 5000);
    insertFinishedRace('wod-race-2', 'wod-user', 'distance', 5000);
    queries.insertDailyChallenge.run(
      'wod-1',
      '2026-03-24',
      'distance',
      5000,
      null,
      null,
      'Steady 5K',
      'Settle in and hold your pace through 5,000m.',
    );

    queries.upsertWodEntry.run('wod-1', 'wod-user', 'wod-race-1', 1100, 5000, Date.now());
    queries.upsertWodEntry.run('wod-1', 'wod-user', 'wod-race-2', 1095, 5000, Date.now());

    const entry = queries.getWodEntry.get('wod-1', 'wod-user');
    expect(entry.result_time).toBe(1095);
    expect(entry.race_id).toBe('wod-race-2');
  });
});

test('cleanup temp db', () => {
  expect(testDir.length).toBeGreaterThan(0);
});

process.on('exit', () => {
  rmSync(testDir, { recursive: true, force: true });
});
