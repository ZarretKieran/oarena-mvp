import { expect, test } from 'bun:test';
import type { UserStats } from '../../shared/types';
import { buildRankedOverview } from '../routes/leaderboard';

type LeaderboardRow = {
  id: string;
  username: string;
  elo: number;
  tier: UserStats['tier'];
  division: number;
  lp: number;
  wins: number;
  losses: number;
  total_races: number;
  current_streak: number;
  best_streak: number;
};

type ProfileRow = {
  id: string;
  elo: number;
  tier: UserStats['tier'];
  division: number;
  lp: number;
  wins: number;
  losses: number;
  total_races: number;
  total_meters: number;
  total_time: number;
  current_streak: number;
  best_streak: number;
  placement_races: number;
};

function makeRow(id: string, username: string, elo: number, currentStreak = 0): LeaderboardRow {
  return {
    id,
    username,
    elo,
    tier: 'club',
    division: 4,
    lp: Math.max(0, Math.min(100, elo - 950)),
    wins: 10,
    losses: 6,
    total_races: 16,
    current_streak: currentStreak,
    best_streak: currentStreak + 2,
  };
}

function makeProfile(row: LeaderboardRow, overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: row.id,
    elo: row.elo,
    tier: row.tier,
    division: row.division,
    lp: row.lp,
    wins: row.wins,
    losses: row.losses,
    total_races: row.total_races,
    total_meters: 50000,
    total_time: 7200,
    current_streak: row.current_streak,
    best_streak: row.best_streak,
    placement_races: row.total_races,
    ...overrides,
  };
}

test('buildRankedOverview returns podium, nearby slice, and actionable insight around the current user', () => {
  const rows = [
    makeRow('u1', 'alpha', 1200, 2),
    makeRow('u2', 'bravo', 1188, 4),
    makeRow('u3', 'charlie', 1176, 6),
    makeRow('u4', 'delta', 1168, 1),
    makeRow('u5', 'echo', 1160, 3),
    makeRow('u6', 'foxtrot', 1140, 5),
  ];

  const overview = buildRankedOverview(rows, [rows[5], rows[2], rows[1]], makeProfile(rows[3], { lp: 82 }));

  expect(overview.me.rank).toBe(4);
  expect(overview.podium.map((entry) => entry.username)).toEqual(['alpha', 'bravo', 'charlie']);
  expect(overview.nearby.map((entry) => entry.username)).toEqual(['bravo', 'charlie', 'delta', 'echo', 'foxtrot']);
  expect(overview.top).toHaveLength(6);
  expect(overview.surging.map((entry) => entry.username)).toEqual(['foxtrot', 'charlie', 'bravo']);
  expect(overview.insight.promotion_state).toBe('promotion_pressure');
  expect(overview.insight.target_user?.username).toBe('charlie');
  expect(overview.insight.target_user?.elo_gap).toBe(8);
  expect(overview.insight.threat_user?.username).toBe('echo');
  expect(overview.insight.elo_to_next_rank).toBe(8);
});

test('buildRankedOverview handles rank edges and threat-based status correctly', () => {
  const rows = [
    makeRow('u1', 'alpha', 1210, 0),
    makeRow('u2', 'bravo', 1202, 1),
    makeRow('u3', 'charlie', 1194, 7),
  ];

  const topOverview = buildRankedOverview(rows, [rows[2], rows[1]], makeProfile(rows[0], { lp: 20 }));
  expect(topOverview.me.rank).toBe(1);
  expect(topOverview.nearby.map((entry) => entry.username)).toEqual(['alpha', 'bravo', 'charlie']);
  expect(topOverview.insight.target_user).toBeUndefined();
  expect(topOverview.insight.threat_user?.username).toBe('bravo');
  expect(topOverview.insight.promotion_state).toBe('hold_your_line');

  const bottomOverview = buildRankedOverview(rows, [rows[2], rows[1]], makeProfile(rows[2], { lp: 12 }));
  expect(bottomOverview.me.rank).toBe(3);
  expect(bottomOverview.nearby.map((entry) => entry.username)).toEqual(['alpha', 'bravo', 'charlie']);
  expect(bottomOverview.insight.target_user?.username).toBe('bravo');
  expect(bottomOverview.insight.threat_user).toBeUndefined();
  expect(bottomOverview.insight.promotion_state).toBe('climbing_steadily');
});
