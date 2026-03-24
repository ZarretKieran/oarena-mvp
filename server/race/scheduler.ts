import type { RaceFormat } from '../../shared/types';
import { db, queries } from '../db';
import { getActiveRace, activateRace } from './state-machine';
import { seedAchievementDefinitions } from './achievements';

const POLL_INTERVAL_MS = 5_000;
const WOD_CHECK_INTERVAL_MS = 60 * 60 * 1000;

interface WodTemplate {
  readonly format: RaceFormat;
  readonly targetValue: number;
  readonly intervalCount?: number;
  readonly restSeconds?: number;
  readonly title: string;
  readonly description: string;
}

const WOD_TEMPLATES: WodTemplate[] = [
  { format: 'distance', targetValue: 2000, title: 'Daily 2K', description: 'Set your fastest 2,000m time today.' },
  { format: 'distance', targetValue: 5000, title: 'Steady 5K', description: 'Settle in and hold your pace through 5,000m.' },
  { format: 'time', targetValue: 1200, title: '20-Minute Grind', description: 'Row as far as you can in 20 minutes.' },
  { format: 'distance', targetValue: 1000, title: 'One-K Burner', description: 'Sprint a hard 1,000m effort.' },
  { format: 'interval_distance', targetValue: 500, intervalCount: 5, restSeconds: 60, title: 'Power 500s', description: 'Five hard 500m intervals with 60s rest.' },
  { format: 'interval_time', targetValue: 240, intervalCount: 4, restSeconds: 60, title: 'Four by Four', description: 'Four 4-minute pieces with 60s rest.' },
];

export function startScheduler(): void {
  setInterval(checkRaces, POLL_INTERVAL_MS);
  setInterval(ensureTodayWod, WOD_CHECK_INTERVAL_MS);
  seedAchievementDefinitions();
  ensureTodayWod();
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

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function ensureTodayWod(): void {
  const date = todayKey();
  const existing = queries.getWodToday.get(date);
  if (existing) return;

  const template = selectTemplate(date);
  queries.insertDailyChallenge.run(
    crypto.randomUUID(),
    date,
    template.format,
    template.targetValue,
    template.intervalCount ?? null,
    template.restSeconds ?? null,
    template.title,
    template.description,
  );
  console.log(`[scheduler] Created WOD for ${date}: ${template.title}`);
}

function selectTemplate(date: string): WodTemplate {
  const numeric = date.replace(/-/g, '').split('').reduce((sum, char) => sum + Number(char), 0);
  return WOD_TEMPLATES[numeric % WOD_TEMPLATES.length];
}
