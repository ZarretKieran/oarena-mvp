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
    created_at INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS races (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL REFERENCES users(id),
    race_type TEXT NOT NULL CHECK(race_type IN ('duel', 'group')),
    format TEXT NOT NULL CHECK(format IN ('distance', 'time')),
    target_value INTEGER NOT NULL,
    split_value INTEGER NOT NULL,
    warmup_start_time INTEGER NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 2,
    state TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  )
`);

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
    PRIMARY KEY (race_id, user_id)
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_races_state ON races(state, warmup_start_time)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_participants_user ON race_participants(user_id)`);

// ── Prepared queries ──

export const queries = {
  // Users
  insertUser: db.prepare<void, [string, string, string, number]>(
    'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ),
  getUserByUsername: db.prepare<
    { id: string; username: string; password_hash: string; created_at: number },
    [string]
  >('SELECT * FROM users WHERE username = ?'),
  getUserById: db.prepare<
    { id: string; username: string; created_at: number },
    [string]
  >('SELECT id, username, created_at FROM users WHERE id = ?'),

  // Races
  insertRace: db.prepare<void, [string, string, string, string, number, number, number, number, number]>(
    `INSERT INTO races (id, creator_id, race_type, format, target_value, split_value, warmup_start_time, max_participants, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  getRaceById: db.prepare<any, [string]>('SELECT * FROM races WHERE id = ?'),
  listOpenRaces: db.prepare<any, []>(
    `SELECT r.*, u.username as creator_username,
       (SELECT COUNT(*) FROM race_participants WHERE race_id = r.id) as participant_count
     FROM races r
     JOIN users u ON u.id = r.creator_id
     WHERE r.state IN ('open', 'warmup', 'ready_check', 'countdown', 'racing')
     ORDER BY r.warmup_start_time ASC`
  ),
  updateRaceState: db.prepare<void, [string, string]>(
    'UPDATE races SET state = ? WHERE id = ?'
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
};

export { db };
