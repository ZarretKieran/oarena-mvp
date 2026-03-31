import { Database } from 'bun:sqlite';
import { join } from 'path';

const DB_PATH = process.env.DB_PATH || join(import.meta.dir, '..', 'oarena.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');

// ── Schema migration ──

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    is_test INTEGER NOT NULL DEFAULT 0
  )
`);

try {
  db.run(`ALTER TABLE users ADD COLUMN deleted_at INTEGER`);
} catch (_) { /* column already exists */ }
try {
  db.run(`ALTER TABLE users ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

db.run(`
  CREATE TABLE IF NOT EXISTS races (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL REFERENCES users(id),
    race_type TEXT NOT NULL CHECK(race_type IN ('duel', 'group')),
    format TEXT NOT NULL CHECK(format IN ('distance', 'time', 'interval_distance', 'interval_time')),
    target_value INTEGER NOT NULL,
    split_value INTEGER NOT NULL,
    warmup_start_time INTEGER NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 2,
    state TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    interval_count INTEGER,
    rest_seconds INTEGER,
    is_test INTEGER NOT NULL DEFAULT 0
  )
`);

// Migration: add interval columns if they don't exist (for existing DBs)
try {
  db.run(`ALTER TABLE races ADD COLUMN interval_count INTEGER`);
} catch (_) { /* column already exists */ }
try {
  db.run(`ALTER TABLE races ADD COLUMN rest_seconds INTEGER`);
} catch (_) { /* column already exists */ }
try {
  db.run(`ALTER TABLE races ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

db.run(`
  CREATE TABLE IF NOT EXISTS race_participants (
    race_id TEXT NOT NULL REFERENCES races(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'joined',
    final_time REAL,
    final_distance REAL,
    final_avg_pace REAL,
    final_calories INTEGER,
    final_stroke_count INTEGER,
    placement INTEGER,
    joined_at INTEGER NOT NULL,
    is_test INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (race_id, user_id)
  )
`);
try {
  db.run(`ALTER TABLE race_participants ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

db.run(`
  CREATE TABLE IF NOT EXISTS user_stats (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    elo INTEGER NOT NULL DEFAULT 1000,
    tier TEXT NOT NULL DEFAULT 'club',
    division INTEGER NOT NULL DEFAULT 4,
    lp INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    total_races INTEGER NOT NULL DEFAULT 0,
    total_meters REAL NOT NULL DEFAULT 0,
    total_time REAL NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    placement_races INTEGER NOT NULL DEFAULT 0,
    demotion_shield INTEGER NOT NULL DEFAULT 0,
    is_test INTEGER NOT NULL DEFAULT 0
  )
`);
try {
  db.run(`ALTER TABLE user_stats ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

db.run(`
  CREATE TABLE IF NOT EXISTS personal_bests (
    user_id TEXT NOT NULL REFERENCES users(id),
    format TEXT NOT NULL,
    target_value INTEGER NOT NULL,
    interval_count INTEGER NOT NULL DEFAULT 0,
    rest_seconds INTEGER NOT NULL DEFAULT 0,
    best_time REAL,
    best_distance REAL,
    best_pace REAL,
    race_id TEXT NOT NULL REFERENCES races(id),
    achieved_at INTEGER NOT NULL,
    is_test INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, format, target_value, interval_count, rest_seconds)
  )
`);
try {
  db.run(`ALTER TABLE personal_bests ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

db.run(`
  CREATE TABLE IF NOT EXISTS achievements_def (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    category TEXT NOT NULL,
    threshold INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id TEXT NOT NULL REFERENCES users(id),
    achievement_id TEXT NOT NULL REFERENCES achievements_def(id),
    progress INTEGER NOT NULL DEFAULT 0,
    unlocked_at INTEGER,
    is_test INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, achievement_id)
  )
`);
try {
  db.run(`ALTER TABLE user_achievements ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

db.run(`
  CREATE TABLE IF NOT EXISTS daily_challenges (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    format TEXT NOT NULL,
    target_value INTEGER NOT NULL,
    interval_count INTEGER,
    rest_seconds INTEGER,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    is_test INTEGER NOT NULL DEFAULT 0
  )
`);
try {
  db.run(`ALTER TABLE daily_challenges ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

db.run(`
  CREATE TABLE IF NOT EXISTS wod_entries (
    challenge_id TEXT NOT NULL REFERENCES daily_challenges(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    race_id TEXT NOT NULL REFERENCES races(id),
    result_time REAL,
    result_distance REAL,
    completed_at INTEGER NOT NULL,
    is_test INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (challenge_id, user_id)
  )
`);
try {
  db.run(`ALTER TABLE wod_entries ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`);
} catch (_) { /* column already exists */ }

db.run(`
  CREATE TABLE IF NOT EXISTS waitlist_signups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    source TEXT,
    created_at INTEGER NOT NULL
  )
`);

try {
  db.run(`ALTER TABLE waitlist_signups ADD COLUMN name TEXT NOT NULL DEFAULT ''`);
} catch (_) { /* column already exists */ }

db.run(`CREATE INDEX IF NOT EXISTS idx_races_state ON races(state, warmup_start_time)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_participants_user ON race_participants(user_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_user_stats_elo ON user_stats(elo DESC)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_wod_entries_challenge ON wod_entries(challenge_id, completed_at DESC)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_waitlist_signups_created_at ON waitlist_signups(created_at DESC)`);

// ── Prepared queries ──

export const queries = {
  // Users
  insertUser: db.prepare<void, [string, string, string, number]>(
    'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ),
  getUserByUsername: db.prepare<
    { id: string; username: string; password_hash: string; created_at: number },
    [string]
  >('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL'),
  getUserById: db.prepare<
    { id: string; username: string; created_at: number },
    [string]
  >('SELECT id, username, created_at FROM users WHERE id = ? AND deleted_at IS NULL'),
  softDeleteUser: db.prepare<void, [string, string, number, string]>(
    'UPDATE users SET username = ?, password_hash = ?, deleted_at = ? WHERE id = ?'
  ),
  deleteUserStats: db.prepare<void, [string]>(
    'DELETE FROM user_stats WHERE user_id = ?'
  ),
  deleteUserPersonalBests: db.prepare<void, [string]>(
    'DELETE FROM personal_bests WHERE user_id = ?'
  ),
  deleteUserAchievements: db.prepare<void, [string]>(
    'DELETE FROM user_achievements WHERE user_id = ?'
  ),
  deleteUserWodEntries: db.prepare<void, [string]>(
    'DELETE FROM wod_entries WHERE user_id = ?'
  ),
  deleteUserRaceParticipations: db.prepare<void, [string]>(
    'DELETE FROM race_participants WHERE user_id = ?'
  ),
  cancelActiveRacesByCreator: db.prepare<void, [string]>(
    `UPDATE races
     SET state = 'canceled'
     WHERE creator_id = ?
       AND state IN ('open', 'warmup', 'ready_check', 'countdown', 'racing')`
  ),

  // Races
  insertRace: db.prepare<void, [string, string, string, string, number, number, number, number, number, number | null, number | null]>(
    `INSERT INTO races (id, creator_id, race_type, format, target_value, split_value, warmup_start_time, max_participants, created_at, interval_count, rest_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  getRaceById: db.prepare<any, [string]>('SELECT * FROM races WHERE id = ?'),
  listOpenRaces: db.prepare<any, [string]>(
    `SELECT r.*, u.username as creator_username,
       (SELECT COUNT(*) FROM race_participants WHERE race_id = r.id) as participant_count,
       (SELECT COUNT(*) FROM race_participants WHERE race_id = r.id AND user_id = ?) as is_joined,
       COALESCE(us.elo, 1000) as creator_elo,
       COALESCE(us.tier, 'club') as creator_tier,
       COALESCE(us.division, 4) as creator_division,
       COALESCE(us.lp, 0) as creator_lp
     FROM races r
     JOIN users u ON u.id = r.creator_id
     LEFT JOIN user_stats us ON us.user_id = r.creator_id
     WHERE r.state IN ('open', 'warmup', 'ready_check', 'countdown', 'racing')
     ORDER BY r.warmup_start_time ASC`
  ),
  updateRaceState: db.prepare<void, [string, string]>(
    'UPDATE races SET state = ? WHERE id = ?'
  ),
  deleteRaceParticipants: db.prepare<void, [string]>(
    'DELETE FROM race_participants WHERE race_id = ?'
  ),
  deleteRaceById: db.prepare<void, [string]>(
    'DELETE FROM races WHERE id = ?'
  ),

  // Participants
  insertParticipant: db.prepare<void, [string, string, number]>(
    'INSERT INTO race_participants (race_id, user_id, joined_at) VALUES (?, ?, ?)'
  ),
  getParticipants: db.prepare<any, [string]>(
    `SELECT rp.*, u.username FROM race_participants rp
     JOIN users u ON u.id = rp.user_id
     WHERE rp.race_id = ?`
  ),
  getParticipantCount: db.prepare<{ count: number }, [string]>(
    'SELECT COUNT(*) as count FROM race_participants WHERE race_id = ?'
  ),
  isParticipant: db.prepare<{ count: number }, [string, string]>(
    'SELECT COUNT(*) as count FROM race_participants WHERE race_id = ? AND user_id = ?'
  ),
  updateParticipantStatus: db.prepare<void, [string, string, string]>(
    'UPDATE race_participants SET status = ? WHERE race_id = ? AND user_id = ?'
  ),
  updateParticipantResult: db.prepare<void, [number | null, number | null, number | null, number | null, number | null, number | null, string, string, string]>(
    `UPDATE race_participants SET final_time = ?, final_distance = ?, final_avg_pace = ?,
     final_calories = ?, final_stroke_count = ?, placement = ?, status = ?
     WHERE race_id = ? AND user_id = ?`
  ),

  // History
  getUserRaces: db.prepare<any, [string]>(
    `SELECT r.*, u.username as creator_username, rp.placement, rp.final_time,
       rp.final_distance, rp.final_avg_pace, rp.status as participant_status,
       (SELECT COUNT(*) FROM race_participants WHERE race_id = r.id) as participant_count
     FROM race_participants rp
     JOIN races r ON r.id = rp.race_id
     JOIN users u ON u.id = r.creator_id
     WHERE rp.user_id = ? AND r.state IN ('finished', 'canceled')
     ORDER BY r.created_at DESC`
  ),

  // Progression
  getUserStats: db.prepare<any, [string]>(
    `SELECT * FROM user_stats WHERE user_id = ?`
  ),
  ensureUserStats: db.prepare<void, [string]>(
    `INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)`
  ),
  updateUserStats: db.prepare<void, [number, string, number, number, number, number, number, number, number, number, number, number, number, string]>(
    `UPDATE user_stats
     SET elo = ?, tier = ?, division = ?, lp = ?, wins = ?, losses = ?, total_races = ?,
         total_meters = ?, total_time = ?, current_streak = ?, best_streak = ?,
         placement_races = ?, demotion_shield = ?
     WHERE user_id = ?`
  ),
  getLeaderboard: db.prepare<any, [number, number]>(
    `SELECT u.id, u.username, us.elo, us.tier, us.division, us.lp, us.wins, us.losses,
            us.total_races, us.current_streak, us.best_streak
     FROM user_stats us
     JOIN users u ON u.id = us.user_id
     ORDER BY us.elo DESC, us.total_races DESC, u.created_at ASC
     LIMIT ? OFFSET ?`
  ),
  getLeaderboardFull: db.prepare<any, []>(
    `SELECT u.id, u.username, us.elo, us.tier, us.division, us.lp, us.wins, us.losses,
            us.total_races, us.current_streak, us.best_streak
     FROM user_stats us
     JOIN users u ON u.id = us.user_id
     ORDER BY us.elo DESC, us.total_races DESC, u.created_at ASC`
  ),
  getSurgingLeaderboard: db.prepare<any, [number]>(
    `SELECT u.id, u.username, us.elo, us.tier, us.division, us.lp, us.wins, us.losses,
            us.total_races, us.current_streak, us.best_streak
     FROM user_stats us
     JOIN users u ON u.id = us.user_id
     ORDER BY us.current_streak DESC, us.elo DESC, us.total_races DESC, u.created_at ASC
     LIMIT ?`
  ),
  getUserLeaderboardRank: db.prepare<{ rank: number }, [number, number, string, string]>(
    `SELECT COUNT(*) + 1 as rank
     FROM user_stats
     WHERE elo > ?
        OR (elo = ? AND user_id != ? AND total_races > (SELECT total_races FROM user_stats WHERE user_id = ?))`
  ),
  getPersonalBests: db.prepare<any, [string]>(
    `SELECT * FROM personal_bests WHERE user_id = ? ORDER BY achieved_at DESC`
  ),
  getPersonalBest: db.prepare<any, [string, string, number, number, number]>(
    `SELECT * FROM personal_bests
     WHERE user_id = ? AND format = ? AND target_value = ? AND interval_count = ? AND rest_seconds = ?`
  ),
  upsertPersonalBest: db.prepare<void, [string, string, number, number, number, number | null, number | null, number | null, string, number]>(
    `INSERT INTO personal_bests (
       user_id, format, target_value, interval_count, rest_seconds,
       best_time, best_distance, best_pace, race_id, achieved_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, format, target_value, interval_count, rest_seconds) DO UPDATE SET
       best_time = excluded.best_time,
       best_distance = excluded.best_distance,
       best_pace = excluded.best_pace,
       race_id = excluded.race_id,
       achieved_at = excluded.achieved_at`
  ),
  listAchievementDefs: db.prepare<any, []>(
    `SELECT * FROM achievements_def ORDER BY category ASC, threshold ASC, id ASC`
  ),
  getAchievementDef: db.prepare<any, [string]>(
    `SELECT * FROM achievements_def WHERE id = ?`
  ),
  insertAchievementDef: db.prepare<void, [string, string, string, string, string, number]>(
    `INSERT OR IGNORE INTO achievements_def (id, name, description, icon, category, threshold)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  getUserAchievements: db.prepare<any, [string]>(
    `SELECT ua.user_id, ua.achievement_id, ua.progress, ua.unlocked_at,
            ad.name, ad.description, ad.icon, ad.category, ad.threshold
     FROM user_achievements ua
     JOIN achievements_def ad ON ad.id = ua.achievement_id
     WHERE ua.user_id = ?
     ORDER BY ua.unlocked_at IS NULL ASC, ua.unlocked_at DESC, ad.category ASC, ad.threshold ASC`
  ),
  getUserAchievement: db.prepare<any, [string, string]>(
    `SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?`
  ),
  upsertUserAchievement: db.prepare<void, [string, string, number, number | null]>(
    `INSERT INTO user_achievements (user_id, achievement_id, progress, unlocked_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, achievement_id) DO UPDATE SET
       progress = excluded.progress,
       unlocked_at = COALESCE(user_achievements.unlocked_at, excluded.unlocked_at)`
  ),
  getWodToday: db.prepare<any, [string]>(
    `SELECT * FROM daily_challenges WHERE date = ?`
  ),
  listRecentWodChallenges: db.prepare<any, [number]>(
    `SELECT * FROM daily_challenges
     ORDER BY date DESC
     LIMIT ?`
  ),
  insertDailyChallenge: db.prepare<void, [string, string, string, number, number | null, number | null, string, string]>(
    `INSERT OR IGNORE INTO daily_challenges (
       id, date, format, target_value, interval_count, rest_seconds, title, description
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  getWodLeaderboard: db.prepare<any, [string]>(
    `SELECT we.challenge_id, we.user_id, u.username, we.result_time, we.result_distance, we.completed_at
     FROM wod_entries we
     JOIN users u ON u.id = we.user_id
     WHERE we.challenge_id = ?
     ORDER BY
       CASE WHEN we.result_time IS NULL THEN 1 ELSE 0 END ASC,
       we.result_time ASC,
       we.result_distance DESC,
       we.completed_at ASC`
  ),
  getWodEntry: db.prepare<any, [string, string]>(
    `SELECT * FROM wod_entries WHERE challenge_id = ? AND user_id = ?`
  ),
  countUserWodEntries: db.prepare<{ count: number }, [string]>(
    `SELECT COUNT(*) as count FROM wod_entries WHERE user_id = ?`
  ),
  upsertWodEntry: db.prepare<void, [string, string, string, number | null, number | null, number]>(
    `INSERT INTO wod_entries (challenge_id, user_id, race_id, result_time, result_distance, completed_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(challenge_id, user_id) DO UPDATE SET
       race_id = excluded.race_id,
       result_time = excluded.result_time,
       result_distance = excluded.result_distance,
       completed_at = excluded.completed_at`
  ),
  getRaceParticipantByUser: db.prepare<any, [string, string]>(
    `SELECT rp.*, r.format, r.target_value, r.interval_count, r.rest_seconds, r.state
     FROM race_participants rp
     JOIN races r ON r.id = rp.race_id
     WHERE rp.race_id = ? AND rp.user_id = ?`
  ),
  getUserProfile: db.prepare<any, [string]>(
    `SELECT u.id, u.username, u.created_at,
            COALESCE(us.elo, 1000) as elo,
            COALESCE(us.tier, 'club') as tier,
            COALESCE(us.division, 4) as division,
            COALESCE(us.lp, 0) as lp,
            COALESCE(us.wins, 0) as wins,
            COALESCE(us.losses, 0) as losses,
            COALESCE(us.total_races, 0) as total_races,
            COALESCE(us.total_meters, 0) as total_meters,
            COALESCE(us.total_time, 0) as total_time,
            COALESCE(us.current_streak, 0) as current_streak,
            COALESCE(us.best_streak, 0) as best_streak,
            COALESCE(us.placement_races, 0) as placement_races
     FROM users u
     LEFT JOIN user_stats us ON us.user_id = u.id
     WHERE u.id = ?`
  ),
  getRaceByIdForWod: db.prepare<any, [string, string]>(
    `SELECT r.id, r.state, r.format, r.target_value, r.interval_count, r.rest_seconds,
            rp.user_id, rp.final_time, rp.final_distance, rp.final_avg_pace, rp.status
     FROM races r
     JOIN race_participants rp ON rp.race_id = r.id
     WHERE r.id = ? AND rp.user_id = ?`
  ),
  insertWaitlistSignup: db.prepare<void, [string, string, string, string | null, number]>(
    `INSERT OR IGNORE INTO waitlist_signups (id, name, email, source, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ),
  getWaitlistSignupByEmail: db.prepare<any, [string]>(
    `SELECT * FROM waitlist_signups WHERE email = ?`
  ),
};

export { db };
