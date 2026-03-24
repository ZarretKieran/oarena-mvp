import type { LeagueTier, ParticipantStatus } from '../../shared/types';

export const DEFAULT_ELO = 1000;
export const DEFAULT_TIER: LeagueTier = 'club';
export const DEFAULT_DIVISION = 4;
export const DEFAULT_LP = 0;

export interface RatingParticipant {
  readonly userId: string;
  readonly elo: number;
  readonly placementRaces: number;
  readonly placement: number;
  readonly status: ParticipantStatus;
}

export interface LeagueState {
  readonly elo: number;
  readonly tier: LeagueTier;
  readonly division: number;
  readonly lp: number;
  readonly demotionShield: number;
}

export interface EloChange {
  readonly userId: string;
  readonly oldElo: number;
  readonly newElo: number;
  readonly eloDelta: number;
}

export interface LpChangeResult {
  readonly tier: LeagueTier;
  readonly division: number;
  readonly lp: number;
  readonly demotionShield: number;
  readonly isPromotion: boolean;
  readonly isDemotion: boolean;
}

const TIER_ORDER: LeagueTier[] = ['novice', 'club', 'varsity', 'elite', 'olympic', 'world_class'];

const TIER_MIN_ELO: Record<LeagueTier, number> = {
  novice: 0,
  club: 800,
  varsity: 1100,
  elite: 1400,
  olympic: 1700,
  world_class: 2000,
};

function getKFactor(completedRaces: number): number {
  if (completedRaces < 10) return 64;
  if (completedRaces < 30) return 40;
  return 24;
}

function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

function compareParticipants(a: RatingParticipant, b: RatingParticipant): number {
  if (a.status === 'finished' && b.status !== 'finished') return -1;
  if (a.status !== 'finished' && b.status === 'finished') return 1;

  if (a.placement === b.placement) return 0;
  if (a.placement === 0) return 1;
  if (b.placement === 0) return -1;
  return a.placement - b.placement;
}

function actualScore(a: RatingParticipant, b: RatingParticipant): number {
  const comparison = compareParticipants(a, b);
  if (comparison < 0) return 1;
  if (comparison > 0) return 0;
  return 0.5;
}

export function eloToTierDivision(elo: number): { tier: LeagueTier; division: number } {
  if (elo >= TIER_MIN_ELO.world_class) return { tier: 'world_class', division: 1 };
  if (elo >= TIER_MIN_ELO.olympic) return tierDivisionWithinTier('olympic', elo);
  if (elo >= TIER_MIN_ELO.elite) return tierDivisionWithinTier('elite', elo);
  if (elo >= TIER_MIN_ELO.varsity) return tierDivisionWithinTier('varsity', elo);
  if (elo >= TIER_MIN_ELO.club) return tierDivisionWithinTier('club', elo);
  return tierDivisionWithinTier('novice', elo);
}

function tierDivisionWithinTier(tier: LeagueTier, elo: number): { tier: LeagueTier; division: number } {
  if (tier === 'world_class') return { tier, division: 1 };
  const floor = TIER_MIN_ELO[tier];
  const nextTier = TIER_ORDER[TIER_ORDER.indexOf(tier) + 1];
  const ceiling = nextTier ? TIER_MIN_ELO[nextTier] : floor + 400;
  const span = Math.max(ceiling - floor, 1);
  const ratio = Math.max(0, Math.min(0.9999, (elo - floor) / span));
  const division = 4 - Math.min(3, Math.floor(ratio * 4));
  return { tier, division };
}

export function calculateEloChanges(participants: RatingParticipant[]): EloChange[] {
  if (participants.length < 2) {
    return participants.map((participant) => ({
      userId: participant.userId,
      oldElo: participant.elo,
      newElo: participant.elo,
      eloDelta: 0,
    }));
  }

  return participants.map((participant) => {
    let deltaAccumulator = 0;
    let comparisons = 0;

    for (const opponent of participants) {
      if (opponent.userId === participant.userId) continue;
      const expected = expectedScore(participant.elo, opponent.elo);
      const actual = actualScore(participant, opponent);
      deltaAccumulator += getKFactor(participant.placementRaces) * (actual - expected);
      comparisons += 1;
    }

    const eloDelta = comparisons > 0 ? Math.round(deltaAccumulator / comparisons) : 0;
    const newElo = Math.max(0, participant.elo + eloDelta);

    return {
      userId: participant.userId,
      oldElo: participant.elo,
      newElo,
      eloDelta: newElo - participant.elo,
    };
  });
}

function divisionScore(tier: LeagueTier, division: number): number {
  return TIER_ORDER.indexOf(tier) * 4 + (4 - division);
}

function scoreToTierDivision(score: number): { tier: LeagueTier; division: number } {
  const normalized = Math.max(0, Math.min(score, TIER_ORDER.length * 4 - 1));
  const tierIndex = Math.floor(normalized / 4);
  const divisionOffset = normalized % 4;
  return {
    tier: TIER_ORDER[tierIndex],
    division: 4 - divisionOffset,
  };
}

export function applyLpChange(current: LeagueState, eloDelta: number): LpChangeResult {
  let score = divisionScore(current.tier, current.division);
  let lp = current.lp + Math.max(-30, Math.min(30, eloDelta));
  let demotionShield = current.demotionShield;
  let isPromotion = false;
  let isDemotion = false;

  while (lp >= 100) {
    lp -= 100;
    score += 1;
    isPromotion = true;
    const next = scoreToTierDivision(score);
    const previousTier = scoreToTierDivision(score - 1).tier;
    if (next.tier !== previousTier) {
      demotionShield = 1;
    }
  }

  while (lp < 0) {
    const currentDivision = scoreToTierDivision(score);
    const atTierFloor = currentDivision.division === 4;
    if (atTierFloor && demotionShield > 0) {
      demotionShield -= 1;
      lp = 0;
      break;
    }
    if (score === 0) {
      lp = 0;
      break;
    }
    lp += 100;
    score -= 1;
    isDemotion = true;
  }

  const next = scoreToTierDivision(score);
  return {
    tier: next.tier,
    division: next.division,
    lp,
    demotionShield,
    isPromotion,
    isDemotion,
  };
}
