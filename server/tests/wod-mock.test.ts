import { expect, test } from 'bun:test';
import { buildMockChallenge, buildMockLeaderboard } from '../routes/wod';

test('buildMockChallenge produces a stable challenge shape for a given date', () => {
  const challenge = buildMockChallenge('2026-03-24');

  expect(challenge.id).toBe('mock-2026-03-24');
  expect(challenge.date).toBe('2026-03-24');
  expect(challenge.title.length).toBeGreaterThan(0);
  expect(challenge.description.length).toBeGreaterThan(0);
});

test('buildMockLeaderboard personalizes the current user and returns sortable results', () => {
  const challenge = buildMockChallenge('2026-03-24');
  const leaderboard = buildMockLeaderboard(challenge, 'user-me', 'zarret');

  expect(leaderboard).toHaveLength(5);
  expect(leaderboard.some((entry) => entry.user_id === 'user-me' && entry.username === 'zarret')).toBe(true);

  if (challenge.format === 'distance' || challenge.format === 'interval_distance') {
    expect(leaderboard.every((entry) => entry.result_time != null)).toBe(true);
    expect(leaderboard.every((entry) => entry.result_distance == null)).toBe(true);
  } else {
    expect(leaderboard.every((entry) => entry.result_distance != null)).toBe(true);
    expect(leaderboard.every((entry) => entry.result_time == null)).toBe(true);
  }
});
