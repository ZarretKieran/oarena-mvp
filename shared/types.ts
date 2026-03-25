// ── Race domain types (shared between client and server) ──

export type RaceType = 'duel' | 'group';
export type RaceFormat = 'distance' | 'time' | 'interval_distance' | 'interval_time';
export type LeagueTier = 'novice' | 'club' | 'varsity' | 'elite' | 'olympic' | 'world_class';

export type RaceState =
  | 'open'
  | 'warmup'
  | 'ready_check'
  | 'countdown'
  | 'racing'
  | 'finished'
  | 'canceled';

export type ParticipantStatus =
  | 'joined'
  | 'warmup_confirmed'
  | 'ready'
  | 'racing'
  | 'finished'
  | 'disqualified'
  | 'dnf';

export interface RaceConfig {
  readonly format: RaceFormat;
  readonly target_value: number;  // meters (distance/interval_distance) or seconds (time/interval_time)
  readonly split_value: number;   // split meters or split seconds
  readonly interval_count?: number;  // number of intervals (e.g., 5)
  readonly rest_seconds?: number;    // rest between intervals in seconds (e.g., 60)
}

export interface LeagueInfo {
  readonly elo: number;
  readonly tier: LeagueTier;
  readonly division: number;
  readonly lp: number;
}

export interface UserStats extends LeagueInfo {
  readonly user_id: string;
  readonly wins: number;
  readonly losses: number;
  readonly total_races: number;
  readonly total_meters: number;
  readonly total_time: number;
  readonly current_streak: number;
  readonly best_streak: number;
  readonly placement_races: number;
  readonly rank?: number;
}

export interface PersonalBest {
  readonly user_id: string;
  readonly format: RaceFormat;
  readonly target_value: number;
  readonly interval_count?: number;
  readonly rest_seconds?: number;
  readonly best_time?: number;
  readonly best_distance?: number;
  readonly best_pace?: number;
  readonly race_id: string;
  readonly achieved_at: number;
}

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly category: string;
  readonly threshold: number;
}

export interface UserAchievement {
  readonly achievement_id: string;
  readonly progress: number;
  readonly unlocked_at?: number;
  readonly definition?: AchievementDef;
}

export interface UserProfile {
  readonly user: {
    readonly id: string;
    readonly username: string;
    readonly created_at: number;
  };
  readonly stats: UserStats;
}

export interface LeaderboardEntry extends LeagueInfo {
  readonly user_id: string;
  readonly username: string;
  readonly wins: number;
  readonly losses: number;
  readonly total_races: number;
  readonly current_streak: number;
  readonly best_streak: number;
  readonly rank: number;
}

export interface RankedOverviewCompetitor {
  readonly user_id: string;
  readonly username: string;
  readonly rank: number;
  readonly elo: number;
  readonly tier: LeagueTier;
  readonly division: number;
  readonly current_streak: number;
  readonly elo_gap: number;
}

export interface RankedOverviewInsight {
  readonly promotion_state: 'promotion_pressure' | 'hold_your_line' | 'climbing_steadily';
  readonly elo_to_next_rank: number | null;
  readonly target_user?: RankedOverviewCompetitor;
  readonly threat_user?: RankedOverviewCompetitor;
}

export interface RankedOverview {
  readonly me: UserStats;
  readonly podium: ReadonlyArray<LeaderboardEntry>;
  readonly nearby: ReadonlyArray<LeaderboardEntry>;
  readonly top: ReadonlyArray<LeaderboardEntry>;
  readonly surging: ReadonlyArray<LeaderboardEntry>;
  readonly insight: RankedOverviewInsight;
}

export interface DailyChallenge {
  readonly id: string;
  readonly date: string;
  readonly format: RaceFormat;
  readonly target_value: number;
  readonly interval_count?: number;
  readonly rest_seconds?: number;
  readonly title: string;
  readonly description: string;
}

export interface WodEntry {
  readonly challenge_id: string;
  readonly user_id: string;
  readonly username: string;
  readonly result_time?: number;
  readonly result_distance?: number;
  readonly completed_at: number;
}

export interface WodHistoryDay {
  readonly challenge: DailyChallenge;
  readonly leaderboard: ReadonlyArray<WodEntry>;
}

export interface RaceProgressionUpdate {
  readonly user_id: string;
  readonly old_elo: number;
  readonly new_elo: number;
  readonly elo_delta: number;
  readonly old_tier: LeagueTier;
  readonly new_tier: LeagueTier;
  readonly old_division: number;
  readonly new_division: number;
  readonly lp_before: number;
  readonly lp_after: number;
  readonly is_promotion: boolean;
  readonly is_demotion: boolean;
  readonly is_personal_best: boolean;
  readonly unlocked_achievement_ids: ReadonlyArray<string>;
}

export interface Race {
  readonly id: string;
  readonly creator_id: string;
  readonly creator_username: string;
  readonly race_type: RaceType;
  readonly format: RaceFormat;
  readonly target_value: number;
  readonly split_value: number;
  readonly warmup_start_time: number; // unix timestamp ms
  readonly max_participants: number;
  readonly state: RaceState;
  readonly created_at: number;
  readonly participant_count: number;
  readonly creator_elo?: number;
  readonly creator_tier?: LeagueTier;
  readonly creator_division?: number;
  readonly creator_lp?: number;
}

export interface Participant {
  readonly user_id: string;
  readonly username: string;
  readonly status: ParticipantStatus;
}

export interface RaceResult {
  readonly user_id: string;
  readonly username: string;
  readonly placement: number;
  readonly final_time: number;
  readonly final_distance: number;
  readonly final_avg_pace: number;
  readonly final_calories: number;
  readonly final_stroke_count: number;
}

// ── WebSocket message types ──

// Client → Server
export interface WsWarmupConfirm {
  readonly type: 'warmup_confirm';
  readonly race_id: string;
}

export interface WsReady {
  readonly type: 'ready';
  readonly race_id: string;
}

export interface WsRaceData {
  readonly type: 'race_data';
  readonly race_id: string;
  readonly data: {
    readonly elapsed_time: number;
    readonly distance: number;
    readonly current_pace: number;
    readonly average_pace: number;
    readonly stroke_rate: number;
    readonly heart_rate: number;
    readonly watts: number;
    readonly calories: number;
    readonly stroke_count: number;
    readonly workout_state: number;
  };
}

export interface WsJoinRoom {
  readonly type: 'join_room';
  readonly race_id: string;
}

export interface WsExitRace {
  readonly type: 'exit_race';
  readonly race_id: string;
}

export interface WsForceFinish {
  readonly type: 'force_finish';
  readonly race_id: string;
}

export type ClientMessage = WsWarmupConfirm | WsReady | WsRaceData | WsJoinRoom | WsExitRace | WsForceFinish;

// Server → Client
export interface WsRaceState {
  readonly type: 'race_state';
  readonly race_id: string;
  readonly state: RaceState;
  readonly countdown?: number;
  readonly participants: ReadonlyArray<Participant>;
  readonly format?: RaceFormat;
  readonly target_value?: number;
  readonly creator_id?: string;
}

export interface WsStandings {
  readonly type: 'standings';
  readonly race_id: string;
  readonly standings: ReadonlyArray<{
    readonly user_id: string;
    readonly username: string;
    readonly distance: number;
    readonly pace: number;
    readonly stroke_rate: number;
    readonly heart_rate: number;
    readonly position: number;
  }>;
}

export interface WsProgramWorkout {
  readonly type: 'program_workout';
  readonly config: RaceConfig;
}

export interface WsRaceResult {
  readonly type: 'race_result';
  readonly race_id: string;
  readonly results: ReadonlyArray<RaceResult>;
  readonly progression_updates?: ReadonlyArray<RaceProgressionUpdate>;
}

export interface WsParticipantExited {
  readonly type: 'participant_exited';
  readonly race_id: string;
  readonly user_id: string;
  readonly username: string;
}

export interface WsError {
  readonly type: 'error';
  readonly message: string;
}

export type ServerMessage =
  | WsRaceState
  | WsStandings
  | WsProgramWorkout
  | WsRaceResult
  | WsParticipantExited
  | WsError;
