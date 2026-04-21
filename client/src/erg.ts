// @ts-nocheck — erg-talk types resolved via alias
import { PM5, WebBluetoothTransport } from 'erg-talk';
import { sendWs } from './ws';
import type { RaceConfig } from '../../shared/types';

let pm5Instance: any = null;
let dataThrottleTimer: ReturnType<typeof setTimeout> | null = null;
let currentRaceId: string | null = null;
let onDataCallback: ((data: any) => void) | null = null;
let onStateCallback: ((connected: boolean) => void) | null = null;
let preparedRaceSignature: string | null = null;
let armedRaceSignature: string | null = null;
let startedRaceSignature: string | null = null;

const THROTTLE_MS = 500;
const ARM_RACE_AT_SECONDS = 15;

function toWorkoutConfig(config: RaceConfig) {
  switch (config.format) {
    case 'distance':
      return {
        type: 'distance',
        meters: config.target_value,
        splitMeters: config.split_value,
      };
    case 'time':
      return {
        type: 'time',
        totalSeconds: config.target_value,
        splitSeconds: config.split_value,
      };
    case 'interval_distance':
      return {
        type: 'interval_distance',
        meters: config.target_value,
        restSeconds: config.rest_seconds ?? 60,
        count: config.interval_count ?? 1,
      };
    case 'interval_time':
      return {
        type: 'interval_time',
        workSeconds: config.target_value,
        restSeconds: config.rest_seconds ?? 30,
        count: config.interval_count ?? 1,
      };
    default:
      throw new Error(`Unsupported race format: ${config.format}`);
  }
}

function raceSignature(config: RaceConfig): string {
  return JSON.stringify(config);
}

function clearRaceSyncState(): void {
  preparedRaceSignature = null;
  armedRaceSignature = null;
  startedRaceSignature = null;
}

export function isErgConnected(): boolean {
  return pm5Instance?.connected ?? false;
}

export async function connectErg(): Promise<void> {
  if (pm5Instance?.connected) return;

  const transport = new WebBluetoothTransport();
  pm5Instance = new PM5(transport);

  pm5Instance.on('data', (data: any) => {
    // Relay to local UI callback
    if (onDataCallback) onDataCallback(data);

    // Throttled relay to server
    if (!dataThrottleTimer && currentRaceId) {
      dataThrottleTimer = setTimeout(() => {
        dataThrottleTimer = null;
      }, THROTTLE_MS);

      sendWs({
        type: 'race_data',
        race_id: currentRaceId,
        data: {
          elapsed_time: data.elapsed_time,
          distance: data.distance,
          current_pace: data.current_pace,
          average_pace: data.average_pace,
          stroke_rate: data.stroke_rate,
          heart_rate: data.heart_rate,
          watts: data.watts,
          calories: data.calories,
          stroke_count: data.stroke_count,
          workout_state: data.workout_state,
        },
      });
    }
  });

  pm5Instance.on('disconnected', () => {
    clearRaceSyncState();
    if (onStateCallback) onStateCallback(false);
  });

  await pm5Instance.connect();
  if (onStateCallback) onStateCallback(true);
}

export async function disconnectErg(): Promise<void> {
  if (pm5Instance?.connected) {
    await pm5Instance.disconnect();
  }
  pm5Instance = null;
  clearRaceSyncState();
}

export async function programWorkout(config: RaceConfig): Promise<void> {
  if (!pm5Instance?.connected) {
    console.warn('[erg] Cannot program — PM5 not connected');
    return;
  }

  if (config.format === 'distance') {
    await pm5Instance.programDistance(config.target_value, config.split_value);
  } else {
    await pm5Instance.programTime(config.target_value, config.split_value);
  }
  console.log(`[erg] Programmed: ${config.format} ${config.target_value}`);
}

export async function syncRaceCountdown(config: RaceConfig, countdown: number): Promise<void> {
  if (!pm5Instance?.connected) return;

  const signature = raceSignature(config);
  const workoutConfig = toWorkoutConfig(config);

  if (preparedRaceSignature !== signature) {
    await pm5Instance.prepareRaceWorkout(workoutConfig);
    preparedRaceSignature = signature;
    armedRaceSignature = null;
    startedRaceSignature = null;
    console.log(`[erg] Prepared race workout: ${config.format} ${config.target_value}`);
  }

  if (countdown <= ARM_RACE_AT_SECONDS && armedRaceSignature !== signature) {
    await pm5Instance.armRaceStart(workoutConfig);
    armedRaceSignature = signature;
    console.log(`[erg] Armed PM5 race start at T-${Math.max(countdown, 0)}s`);
  }

  if (countdown <= 0 && startedRaceSignature !== signature) {
    await pm5Instance.triggerRaceStart(workoutConfig);
    startedRaceSignature = signature;
    console.log('[erg] Triggered PM5 race start');
  }
}

export async function endWorkout(): Promise<void> {
  if (pm5Instance?.connected) {
    await pm5Instance.endWorkout();
  }
}

export function resetRaceFlow(): void {
  clearRaceSyncState();
  if (pm5Instance?.connected) {
    pm5Instance.resetRaceFlow();
  }
}

export function setRaceId(raceId: string | null): void {
  currentRaceId = raceId;
  if (!raceId) {
    resetRaceFlow();
  }
}

export function onErgData(cb: (data: any) => void): void {
  onDataCallback = cb;
}

export function onErgState(cb: (connected: boolean) => void): void {
  onStateCallback = cb;
}
