// ── Race domain types (shared between client and server) ──

export type RaceType = 'duel' | 'group';
export type RaceFormat = 'distance' | 'time';

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
  | 'disqualified';

export interface RaceConfig {
  readonly format: RaceFormat;
  readonly target_value: number;  // meters (distance) or seconds (time)
  readonly split_value: number;   // split meters or split seconds
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

export type ClientMessage = WsWarmupConfirm | WsReady | WsRaceData | WsJoinRoom;

// Server → Client
export interface WsRaceState {
  readonly type: 'race_state';
  readonly race_id: string;
  readonly state: RaceState;
  readonly countdown?: number;
  readonly participants: ReadonlyArray<Participant>;
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
  | WsError;
