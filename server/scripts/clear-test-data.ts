import { db } from '../db';

function count(table: string): number {
  return db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table} WHERE is_test = 1`).get().count;
}

function main(): void {
  const before = {
    users: count('users'),
    races: count('races'),
    participants: count('race_participants'),
    stats: count('user_stats'),
    personalBests: count('personal_bests'),
    userAchievements: count('user_achievements'),
    dailyChallenges: count('daily_challenges'),
    wodEntries: count('wod_entries'),
  };

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

  const after = {
    users: count('users'),
    races: count('races'),
    participants: count('race_participants'),
    stats: count('user_stats'),
    personalBests: count('personal_bests'),
    userAchievements: count('user_achievements'),
    dailyChallenges: count('daily_challenges'),
    wodEntries: count('wod_entries'),
  };

  console.log(JSON.stringify({ ok: true, before, after }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? `[clear-test-data] ${error.message}` : '[clear-test-data] Unknown error',
  );
  process.exit(1);
} finally {
  db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
}
