import { db } from '../db';
import { getActiveRace, activateRace } from './state-machine';

const POLL_INTERVAL_MS = 5_000;

export function startScheduler(): void {
  setInterval(checkRaces, POLL_INTERVAL_MS);
  console.log('[scheduler] Started, polling every 5s');
}

const findDueRaces = db.prepare<{ id: string }, []>(
  `SELECT id FROM races
   WHERE state = 'open' AND warmup_start_time <= ?`
);

function checkRaces(): void {
  const now = Date.now();
  // Re-bind with current time each poll
  const dueRaces = db.prepare<{ id: string }, [number]>(
    `SELECT id FROM races WHERE state = 'open' AND warmup_start_time <= ?`
  ).all(now);

  for (const row of dueRaces) {
    if (!getActiveRace(row.id)) {
      console.log(`[scheduler] Activating race ${row.id}`);
      activateRace(row.id);
    }
  }
}
