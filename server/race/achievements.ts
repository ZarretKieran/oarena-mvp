import type { AchievementDef, LeagueTier, PersonalBest, UserAchievement, UserStats } from '../../shared/types';
import { queries } from '../db';

const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_race', name: 'First Stroke', description: 'Complete your first race.', icon: 'figure.rower', category: 'participation', threshold: 1 },
  { id: 'ten_races', name: 'Ten Down', description: 'Complete 10 races.', icon: 'flag.checkered', category: 'participation', threshold: 10 },
  { id: 'first_win', name: 'First Blood', description: 'Win your first race.', icon: 'trophy', category: 'racing', threshold: 1 },
  { id: 'ten_wins', name: 'Closer', description: 'Win 10 races.', icon: 'rosette', category: 'racing', threshold: 10 },
  { id: 'fifty_wins', name: 'Veteran', description: 'Win 50 races.', icon: 'medal', category: 'racing', threshold: 50 },
  { id: 'five_streak', name: 'Hot Streak', description: 'Win 5 races in a row.', icon: 'flame', category: 'racing', threshold: 5 },
  { id: 'first_pb', name: 'Personal Best', description: 'Set your first personal best.', icon: 'sparkles', category: 'improvement', threshold: 1 },
  { id: 'five_pbs', name: 'PB Machine', description: 'Set 5 personal bests.', icon: 'bolt', category: 'improvement', threshold: 5 },
  { id: 'ten_k', name: '10K Club', description: 'Row 10,000 total meters.', icon: 'point.topleft.down.curvedto.point.bottomright.up', category: 'distance', threshold: 10000 },
  { id: 'hundred_k', name: 'Century', description: 'Row 100,000 total meters.', icon: 'infinity', category: 'distance', threshold: 100000 },
  { id: 'marathon', name: 'Marathoner', description: 'Finish a marathon-length race.', icon: 'figure.run', category: 'distance', threshold: 42195 },
  { id: 'sub7_2k', name: 'Sub-7 Club', description: 'Row a 2k in under 7:00.', icon: 'clock.badge.checkmark', category: 'improvement', threshold: 420 },
  { id: 'first_wod', name: 'WOD Rookie', description: 'Complete your first WOD.', icon: 'calendar', category: 'wod', threshold: 1 },
  { id: 'five_wods', name: 'WOD Warrior', description: 'Complete 5 WODs.', icon: 'calendar.badge.plus', category: 'wod', threshold: 5 },
  { id: 'reach_club', name: 'Club Tier', description: 'Reach Club tier.', icon: 'figure.rower.circle', category: 'ladder', threshold: 1 },
  { id: 'reach_elite', name: 'Elite Tier', description: 'Reach Elite tier.', icon: 'star.circle', category: 'ladder', threshold: 1 },
  { id: 'reach_olympic', name: 'Olympic Tier', description: 'Reach Olympic tier.', icon: 'laurel.leading', category: 'ladder', threshold: 1 },
];

export interface AchievementContext {
  readonly stats: UserStats;
  readonly totalPbs: number;
  readonly raceDistance: number;
  readonly isTwoKSubSeven: boolean;
  readonly wodCompletions: number;
  readonly highestTier: LeagueTier;
}

export function seedAchievementDefinitions(): void {
  for (const achievement of ACHIEVEMENTS) {
    queries.insertAchievementDef.run(
      achievement.id,
      achievement.name,
      achievement.description,
      achievement.icon,
      achievement.category,
      achievement.threshold,
    );
  }
}

function tierReached(current: LeagueTier, target: LeagueTier): boolean {
  const order: LeagueTier[] = ['novice', 'club', 'varsity', 'elite', 'olympic', 'world_class'];
  return order.indexOf(current) >= order.indexOf(target);
}

function targetProgress(id: string, context: AchievementContext): number {
  switch (id) {
    case 'first_race':
    case 'ten_races':
      return context.stats.total_races;
    case 'first_win':
    case 'ten_wins':
    case 'fifty_wins':
      return context.stats.wins;
    case 'five_streak':
      return context.stats.best_streak;
    case 'first_pb':
    case 'five_pbs':
      return context.totalPbs;
    case 'ten_k':
    case 'hundred_k':
      return Math.floor(context.stats.total_meters);
    case 'marathon':
      return Math.floor(context.raceDistance);
    case 'sub7_2k':
      return context.isTwoKSubSeven ? 1 : 0;
    case 'first_wod':
    case 'five_wods':
      return context.wodCompletions;
    case 'reach_club':
      return tierReached(context.highestTier, 'club') ? 1 : 0;
    case 'reach_elite':
      return tierReached(context.highestTier, 'elite') ? 1 : 0;
    case 'reach_olympic':
      return tierReached(context.highestTier, 'olympic') ? 1 : 0;
    default:
      return 0;
  }
}

export function checkAchievements(userId: string, context: AchievementContext): string[] {
  const unlocked: string[] = [];

  for (const achievement of ACHIEVEMENTS) {
    const progress = targetProgress(achievement.id, context);
    const unlockedAt = progress >= achievement.threshold ? Date.now() : null;
    const previous = queries.getUserAchievement.get(userId, achievement.id) as UserAchievement | null;

    queries.upsertUserAchievement.run(
      userId,
      achievement.id,
      progress,
      previous?.unlocked_at ?? unlockedAt,
    );

    if (!previous?.unlocked_at && unlockedAt) {
      unlocked.push(achievement.id);
    }
  }

  return unlocked;
}

export function countPersonalBests(personalBests: PersonalBest[]): number {
  return personalBests.length;
}
