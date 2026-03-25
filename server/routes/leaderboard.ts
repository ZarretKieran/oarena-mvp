import { Hono } from 'hono';
import type { LeaderboardEntry, RankedOverview, RankedOverviewCompetitor, RankedOverviewInsight, UserStats } from '../../shared/types';
import { authMiddleware } from '../auth';
import { queries } from '../db';

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

const leaderboard = new Hono();

leaderboard.use('*', authMiddleware);

function toLeaderboardEntries(rows: LeaderboardRow[], offset = 0): LeaderboardEntry[] {
  return rows.map((row, index) => ({
    user_id: row.id,
    username: row.username,
    elo: row.elo,
    tier: row.tier,
    division: row.division,
    lp: row.lp,
    wins: row.wins,
    losses: row.losses,
    total_races: row.total_races,
    current_streak: row.current_streak,
    best_streak: row.best_streak,
    rank: offset + index + 1,
  }));
}

function toRankedCompetitor(entry: LeaderboardEntry, me: UserStats): RankedOverviewCompetitor {
  return {
    user_id: entry.user_id,
    username: entry.username,
    rank: entry.rank,
    elo: entry.elo,
    tier: entry.tier,
    division: entry.division,
    current_streak: entry.current_streak,
    elo_gap: Math.abs(entry.elo - me.elo),
  };
}

function buildInsight(me: UserStats, targetUser?: LeaderboardEntry, threatUser?: LeaderboardEntry): RankedOverviewInsight {
  const threatGap = threatUser ? Math.abs(me.elo - threatUser.elo) : null;
  const promotionState: RankedOverviewInsight['promotion_state'] =
    me.lp >= 75
      ? 'promotion_pressure'
      : threatGap !== null && threatGap <= 20
        ? 'hold_your_line'
        : 'climbing_steadily';

  return {
    promotion_state: promotionState,
    elo_to_next_rank: targetUser ? Math.max(0, targetUser.elo - me.elo) : null,
    target_user: targetUser ? toRankedCompetitor(targetUser, me) : undefined,
    threat_user: threatUser ? toRankedCompetitor(threatUser, me) : undefined,
  };
}

export function buildRankedOverview(
  leaderboardRows: LeaderboardRow[],
  surgingRows: LeaderboardRow[],
  profile: ProfileRow,
): RankedOverview {
  const leaderboard = toLeaderboardEntries(leaderboardRows);
  const myIndex = leaderboard.findIndex((entry) => entry.user_id == profile.id);
  const meEntry = myIndex >= 0 ? leaderboard[myIndex] : {
    user_id: profile.id,
    username: 'You',
    elo: profile.elo,
    tier: profile.tier,
    division: profile.division,
    lp: profile.lp,
    wins: profile.wins,
    losses: profile.losses,
    total_races: profile.total_races,
    current_streak: profile.current_streak,
    best_streak: profile.best_streak,
    rank: leaderboard.length + 1,
  };

  const me: UserStats = {
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
    rank: meEntry.rank,
  };

  const nearbyStart = Math.max(0, myIndex - 2);
  const nearbyEnd = myIndex >= 0 ? Math.min(leaderboard.length, myIndex + 3) : Math.min(5, leaderboard.length);
  const nearby = leaderboard.slice(nearbyStart, nearbyEnd);
  const targetUser = myIndex > 0 ? leaderboard[myIndex - 1] : undefined;
  const threatUser = myIndex >= 0 && myIndex + 1 < leaderboard.length ? leaderboard[myIndex + 1] : undefined;
  const rankLookup = new Map(leaderboard.map((entry) => [entry.user_id, entry]));
  const surging = surgingRows
    .map((row) => rankLookup.get(row.id))
    .filter((entry): entry is LeaderboardEntry => entry !== undefined);

  return {
    me,
    podium: leaderboard.slice(0, 3),
    nearby,
    top: leaderboard.slice(0, 25),
    surging,
    insight: buildInsight(me, targetUser, threatUser),
  };
}

leaderboard.get('/overview', (c) => {
  const userId = c.get('userId') as string;
  queries.ensureUserStats.run(userId);

  const profile = queries.getUserProfile.get(userId) as ProfileRow | null;
  if (!profile) {
    return c.json({ error: 'User not found' }, 404);
  }

  const rows = queries.getLeaderboardFull.all() as LeaderboardRow[];
  const surgingRows = queries.getSurgingLeaderboard.all(10) as LeaderboardRow[];
  const overview = buildRankedOverview(rows, surgingRows, profile);

  return c.json(overview);
});

leaderboard.get('/', (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? '25')));
  const offset = Math.max(0, Number(c.req.query('offset') ?? '0'));
  const rows = queries.getLeaderboard.all(limit, offset) as LeaderboardRow[];

  return c.json({
    leaderboard: toLeaderboardEntries(rows, offset),
    limit,
    offset,
  });
});

export { leaderboard };
