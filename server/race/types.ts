import type { RaceState, ParticipantStatus, RaceConfig } from '../../shared/types';

export interface LiveParticipant {
  userId: string;
  username: string;
  status: ParticipantStatus;
  distance: number;
  pace: number;
  strokeRate: number;
  heartRate: number;
  elapsedTime: number;
  averagePace: number;
  watts: number;
  calories: number;
  strokeCount: number;
  workoutState: number;
  lastUpdate: number; // timestamp of last data
}

export interface ActiveRace {
  id: string;
  creatorId: string;
  state: RaceState;
  config: RaceConfig;
  warmupStartTime: number;
  maxParticipants: number;
  raceType: 'duel' | 'group';
  participants: Map<string, LiveParticipant>;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  warmupTimer: ReturnType<typeof setTimeout> | null;
  readyCheckTimer: ReturnType<typeof setTimeout> | null;
  standingsInterval: ReturnType<typeof setInterval> | null;
}
