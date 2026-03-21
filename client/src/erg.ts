// @ts-nocheck — erg-talk types resolved via alias
import { PM5, WebBluetoothTransport } from 'erg-talk';
import { sendWs } from './ws';
import type { RaceConfig } from '../../shared/types';

let pm5Instance: any = null;
let dataThrottleTimer: ReturnType<typeof setTimeout> | null = null;
let currentRaceId: string | null = null;
let onDataCallback: ((data: any) => void) | null = null;
let onStateCallback: ((connected: boolean) => void) | null = null;

const THROTTLE_MS = 500;

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

export async function endWorkout(): Promise<void> {
  if (pm5Instance?.connected) {
    await pm5Instance.endWorkout();
  }
}

export function setRaceId(raceId: string | null): void {
  currentRaceId = raceId;
}

export function onErgData(cb: (data: any) => void): void {
  onDataCallback = cb;
}

export function onErgState(cb: (connected: boolean) => void): void {
  onStateCallback = cb;
}
