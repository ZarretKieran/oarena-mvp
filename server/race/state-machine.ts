import type { ServerWebSocket } from 'bun';
import type { WsData } from '../ws/rooms';
import type { ClientMessage, RaceState, Participant } from '../../shared/types';
import type { ActiveRace, LiveParticipant } from './types';
import { sendToRoom, getRoomSockets } from '../ws/rooms';
import { queries } from '../db';

// ── Constants ──

const MIN_WARMUP_MS = 10 * 1000;        // 10s for testing (prod: 5 * 60 * 1000)
const MAX_WARMUP_MS = 30 * 60 * 1000;   // 30 minutes
const LATE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min late → DQ
const READY_CHECK_MS = 30 * 1000;        // 30 seconds to confirm
const COUNTDOWN_SECONDS = 60;
const PROGRAM_PM5_AT = 15;               // program PM5 at T-15s
const STANDINGS_INTERVAL_MS = 500;

// ── In-memory store ──

const activeRaces = new Map<string, ActiveRace>();

export function getActiveRace(raceId: string): ActiveRace | undefined {
  return activeRaces.get(raceId);
}

export function setActiveRace(raceId: string, race: ActiveRace): void {
  activeRaces.set(raceId, race);
}

export function removeActiveRace(raceId: string): void {
  const race = activeRaces.get(raceId);
  if (race) {
    if (race.countdownTimer) clearTimeout(race.countdownTimer);
    if (race.warmupTimer) clearTimeout(race.warmupTimer);
    if (race.readyCheckTimer) clearTimeout(race.readyCheckTimer);
    if (race.standingsInterval) clearInterval(race.standingsInterval);
    activeRaces.delete(raceId);
  }
}

export function getAllActiveRaces(): Map<string, ActiveRace> {
  return activeRaces;
}

// ── Broadcast helpers ──

function broadcastRaceState(race: ActiveRace, countdown?: number): void {
  const participants: Participant[] = [];
  for (const p of race.participants.values()) {
    participants.push({
      user_id: p.userId,
      username: p.username,
      status: p.status,
    });
  }

  const msg = JSON.stringify({
    type: 'race_state',
    race_id: race.id,
    state: race.state,
    countdown,
    participants,
    format: race.config.format,
    target_value: race.config.target_value,
    creator_id: race.creatorId,
  });

  sendToRoom(race.id, msg);
}

function broadcastStandings(race: ActiveRace): void {
  const entries = [...race.participants.values()]
    .filter((p) => p.status === 'racing' || p.status === 'finished' || p.status === 'dnf')
    .sort((a, b) => {
      // Distance race: more distance = higher position
      if (race.config.format === 'distance') return b.distance - a.distance;
      // Time race: more distance = higher position
      return b.distance - a.distance;
    });

  const standings = entries.map((p, i) => ({
    user_id: p.userId,
    username: p.username,
    distance: p.distance,
    pace: p.averagePace,
    stroke_rate: p.strokeRate,
    heart_rate: p.heartRate,
    position: i + 1,
  }));

  sendToRoom(race.id, JSON.stringify({
    type: 'standings',
    race_id: race.id,
    standings,
  }));
}

// ── State transition: activate race (OPEN → WARMUP) ──

export function activateRace(raceId: string): void {
  const dbRace = queries.getRaceById.get(raceId);
  if (!dbRace || dbRace.state !== 'open') return;

  const dbParticipants = queries.getParticipants.all(raceId);

  const participants = new Map<string, LiveParticipant>();
  for (const p of dbParticipants) {
    participants.set(p.user_id, {
      userId: p.user_id,
      username: p.username,
      status: 'joined',
      distance: 0,
      pace: 0,
      strokeRate: 0,
      heartRate: 0,
      elapsedTime: 0,
      averagePace: 0,
      watts: 0,
      calories: 0,
      strokeCount: 0,
      workoutState: 0,
      lastUpdate: Date.now(),
    });
  }

  const race: ActiveRace = {
    id: raceId,
    creatorId: dbRace.creator_id,
    state: 'warmup',
    config: {
      format: dbRace.format,
      target_value: dbRace.target_value,
      split_value: dbRace.split_value,
      interval_count: dbRace.interval_count ?? undefined,
      rest_seconds: dbRace.rest_seconds ?? undefined,
    },
    warmupStartTime: dbRace.warmup_start_time,
    maxParticipants: dbRace.max_participants,
    raceType: dbRace.race_type,
    participants,
    countdownTimer: null,
    warmupTimer: null,
    readyCheckTimer: null,
    standingsInterval: null,
  };

  setActiveRace(raceId, race);
  queries.updateRaceState.run('warmup', raceId);
  race.state = 'warmup';

  console.log(`[race] ${raceId} → WARMUP (${participants.size} participants)`);

  // Set timer for max warmup → ready check
  race.warmupTimer = setTimeout(() => {
    if (race.state === 'warmup') {
      startReadyCheck(race);
    }
  }, MAX_WARMUP_MS);

  // Set timer for late DQ check (5 min after warmup start)
  setTimeout(() => {
    checkLateParticipants(race);
  }, LATE_THRESHOLD_MS);

  broadcastRaceState(race);
}

// ── Late check: DQ participants who haven't confirmed ──

function checkLateParticipants(race: ActiveRace): void {
  if (race.state !== 'warmup') return;

  let dqCount = 0;
  for (const p of race.participants.values()) {
    if (p.status === 'joined') {
      p.status = 'disqualified';
      queries.updateParticipantStatus.run('disqualified', race.id, p.userId);
      dqCount++;
      console.log(`[race] ${race.id}: DQ ${p.username} (late to warmup)`);
    }
  }

  if (dqCount > 0) {
    if (shouldCancel(race)) {
      cancelRace(race);
    } else {
      broadcastRaceState(race);
      checkAllReady(race);
    }
  }
}

// ── WARMUP → READY_CHECK (max warmup elapsed) ──

function startReadyCheck(race: ActiveRace): void {
  if (race.state !== 'warmup') return;

  race.state = 'ready_check';
  queries.updateRaceState.run('ready_check', race.id);
  console.log(`[race] ${race.id} → READY_CHECK`);

  broadcastRaceState(race);

  // 30s to confirm readiness
  race.readyCheckTimer = setTimeout(() => {
    if (race.state !== 'ready_check') return;

    // DQ anyone not ready
    for (const p of race.participants.values()) {
      if (p.status === 'warmup_confirmed') {
        p.status = 'disqualified';
        queries.updateParticipantStatus.run('disqualified', race.id, p.userId);
        console.log(`[race] ${race.id}: DQ ${p.username} (not ready in time)`);
      }
    }

    if (shouldCancel(race)) {
      cancelRace(race);
    } else {
      startCountdown(race);
    }
  }, READY_CHECK_MS);
}

// ── Check if all active participants are ready → start countdown ──

function checkAllReady(race: ActiveRace): void {
  if (race.state !== 'warmup' && race.state !== 'ready_check') return;

  const active = getActiveParticipants(race);
  if (active.length < 2) {
    cancelRace(race);
    return;
  }

  const allReady = active.every((p) => p.status === 'ready');
  if (!allReady) return;

  // Check minimum warmup time
  const warmupElapsed = Date.now() - race.warmupStartTime;
  if (warmupElapsed < MIN_WARMUP_MS) {
    // Not enough warmup time yet — wait
    const remaining = MIN_WARMUP_MS - warmupElapsed;
    setTimeout(() => {
      // Re-check: participants may have changed
      if (race.state === 'warmup' || race.state === 'ready_check') {
        const stillAllReady = getActiveParticipants(race).every(p => p.status === 'ready');
        if (stillAllReady) startCountdown(race);
      }
    }, remaining);
    return;
  }

  startCountdown(race);
}

// ── COUNTDOWN (60s) ──

function startCountdown(race: ActiveRace): void {
  // Clear warmup/ready_check timers
  if (race.warmupTimer) { clearTimeout(race.warmupTimer); race.warmupTimer = null; }
  if (race.readyCheckTimer) { clearTimeout(race.readyCheckTimer); race.readyCheckTimer = null; }

  race.state = 'countdown';
  queries.updateRaceState.run('countdown', race.id);
  console.log(`[race] ${race.id} → COUNTDOWN (${COUNTDOWN_SECONDS}s)`);

  let remaining = COUNTDOWN_SECONDS;
  broadcastRaceState(race, remaining);

  const tick = () => {
    remaining--;

    // Program PM5 at T-15s
    if (remaining === PROGRAM_PM5_AT) {
      sendToRoom(race.id, JSON.stringify({
        type: 'program_workout',
        config: race.config,
      }));
      console.log(`[race] ${race.id}: PM5 program sent (T-${PROGRAM_PM5_AT}s)`);
    }

    if (remaining <= 0) {
      if (race.countdownTimer) { clearTimeout(race.countdownTimer); race.countdownTimer = null; }
      startRacing(race);
      return;
    }

    broadcastRaceState(race, remaining);
    race.countdownTimer = setTimeout(tick, 1000);
  };

  race.countdownTimer = setTimeout(tick, 1000);
}

// ── RACING ──

function startRacing(race: ActiveRace): void {
  race.state = 'racing';
  queries.updateRaceState.run('racing', race.id);
  console.log(`[race] ${race.id} → RACING`);

  // Set all active participants to 'racing'
  for (const p of race.participants.values()) {
    if (p.status === 'ready') {
      p.status = 'racing';
      queries.updateParticipantStatus.run('racing', race.id, p.userId);
    }
  }

  broadcastRaceState(race);

  // Start standings broadcast interval
  race.standingsInterval = setInterval(() => {
    if (race.state === 'racing') {
      broadcastStandings(race);
    } else {
      if (race.standingsInterval) clearInterval(race.standingsInterval);
    }
  }, STANDINGS_INTERVAL_MS);
}

// ── FINISHED ──

function finishRace(race: ActiveRace): void {
  race.state = 'finished';
  queries.updateRaceState.run('finished', race.id);
  if (race.standingsInterval) { clearInterval(race.standingsInterval); race.standingsInterval = null; }
  console.log(`[race] ${race.id} → FINISHED`);

  // Compute placements
  const finished = [...race.participants.values()]
    .filter((p) => p.status === 'finished');

  // Sort by completion: distance-based → lowest elapsed_time; time-based → most distance
  const isDistanceBased = race.config.format === 'distance' || race.config.format === 'interval_distance';
  if (isDistanceBased) {
    finished.sort((a, b) => a.elapsedTime - b.elapsedTime);
  } else {
    finished.sort((a, b) => b.distance - a.distance);
  }

  const results = finished.map((p, i) => {
    const placement = i + 1;
    queries.updateParticipantResult.run(
      p.elapsedTime, p.distance, p.averagePace,
      p.calories, p.strokeCount, placement, 'finished',
      race.id, p.userId
    );
    return {
      user_id: p.userId,
      username: p.username,
      placement,
      final_time: p.elapsedTime,
      final_distance: p.distance,
      final_avg_pace: p.averagePace,
      final_calories: p.calories,
      final_stroke_count: p.strokeCount,
    };
  });

  // Also store DQ'd participants (DNF already stored at exit time)
  for (const p of race.participants.values()) {
    if (p.status === 'disqualified') {
      queries.updateParticipantResult.run(
        null, null, null, null, null, null, 'disqualified',
        race.id, p.userId
      );
    }
  }

  // Add DNF participants to results (after finishers, no placement)
  const dnfParticipants = [...race.participants.values()]
    .filter((p) => p.status === 'dnf');
  for (const p of dnfParticipants) {
    results.push({
      user_id: p.userId,
      username: p.username,
      placement: 0,
      final_time: p.elapsedTime,
      final_distance: p.distance,
      final_avg_pace: p.averagePace,
      final_calories: p.calories,
      final_stroke_count: p.strokeCount,
    });
  }

  sendToRoom(race.id, JSON.stringify({
    type: 'race_result',
    race_id: race.id,
    results,
  }));

  broadcastRaceState(race);
  removeActiveRace(race.id);
}

// ── CANCELED ──

function cancelRace(race: ActiveRace): void {
  race.state = 'canceled';
  queries.updateRaceState.run('canceled', race.id);
  console.log(`[race] ${race.id} → CANCELED`);

  broadcastRaceState(race);
  removeActiveRace(race.id);
}

// ── Helpers ──

function getActiveParticipants(race: ActiveRace): LiveParticipant[] {
  return [...race.participants.values()].filter(
    (p) => p.status !== 'disqualified' && p.status !== 'dnf'
  );
}

function shouldCancel(race: ActiveRace): boolean {
  const active = getActiveParticipants(race);
  if (race.raceType === 'duel') return active.length < 2;
  return active.length < 2;
}

function checkRaceCompletion(race: ActiveRace): void {
  if (race.state !== 'racing') return;

  const racing = [...race.participants.values()].filter(
    (p) => p.status === 'racing'
  );

  // If no one left racing, finish
  if (racing.length === 0) {
    finishRace(race);
  }
}

// ── Message handlers ──

export function handleRaceMessage(
  ws: ServerWebSocket<WsData>,
  msg: ClientMessage
): void {
  const raceId = ws.data.raceId;
  if (!raceId) return;

  switch (msg.type) {
    case 'warmup_confirm':
      handleWarmupConfirm(raceId, ws.data.userId, ws.data.username);
      break;
    case 'ready':
      handleReady(raceId, ws.data.userId);
      break;
    case 'race_data':
      handleRaceData(raceId, ws.data.userId, msg.data);
      break;
    case 'exit_race':
      handleExitRace(raceId, ws.data.userId, ws.data.username);
      break;
    case 'force_finish':
      handleForceFinish(raceId, ws.data.userId);
      break;
  }
}

function handleWarmupConfirm(raceId: string, userId: string, username: string): void {
  const race = activeRaces.get(raceId);
  if (!race || race.state !== 'warmup') return;

  const participant = race.participants.get(userId);
  if (!participant || participant.status !== 'joined') return;

  participant.status = 'warmup_confirmed';
  queries.updateParticipantStatus.run('warmup_confirmed', raceId, userId);
  console.log(`[race] ${raceId}: ${username} confirmed warmup`);

  broadcastRaceState(race);
}

function handleReady(raceId: string, userId: string): void {
  const race = activeRaces.get(raceId);
  if (!race) return;
  if (race.state !== 'warmup' && race.state !== 'ready_check') return;

  const participant = race.participants.get(userId);
  if (!participant || participant.status !== 'warmup_confirmed') return;

  participant.status = 'ready';
  queries.updateParticipantStatus.run('ready', raceId, userId);
  console.log(`[race] ${raceId}: ${participant.username} is ready`);

  broadcastRaceState(race);
  checkAllReady(race);
}

function handleRaceData(raceId: string, userId: string, data: any): void {
  const race = activeRaces.get(raceId);
  if (!race || race.state !== 'racing') return;

  const participant = race.participants.get(userId);
  if (!participant || participant.status !== 'racing') return;

  // Update live data
  participant.distance = data.distance ?? participant.distance;
  participant.pace = data.current_pace ?? participant.pace;
  participant.averagePace = data.average_pace ?? participant.averagePace;
  participant.strokeRate = data.stroke_rate ?? participant.strokeRate;
  participant.heartRate = data.heart_rate ?? participant.heartRate;
  participant.watts = data.watts ?? participant.watts;
  participant.calories = data.calories ?? participant.calories;
  participant.strokeCount = data.stroke_count ?? participant.strokeCount;
  participant.elapsedTime = data.elapsed_time ?? participant.elapsedTime;
  participant.workoutState = data.workout_state ?? participant.workoutState;
  participant.lastUpdate = Date.now();

  // Check if this participant finished
  const isFinished = checkParticipantFinished(race, participant);
  if (isFinished) {
    participant.status = 'finished';
    queries.updateParticipantStatus.run('finished', raceId, userId);
    console.log(`[race] ${raceId}: ${participant.username} FINISHED`);
    checkRaceCompletion(race);
  }
}

// ── TEST ONLY: Force-finish with dummy data ──

function handleForceFinish(raceId: string, userId: string): void {
  const race = activeRaces.get(raceId);
  if (!race || race.state !== 'racing') return;

  // Only the race creator can force-finish
  if (race.creatorId !== userId) return;

  console.log(`[race] ${raceId}: FORCE FINISH (test) by creator`);

  const isDistance = race.config.format === 'distance' || race.config.format === 'interval_distance';
  const intervalMultiplier = (race.config.format === 'interval_distance' || race.config.format === 'interval_time')
    ? (race.config.interval_count ?? 1) : 1;
  const target = race.config.target_value * intervalMultiplier;

  // Generate dummy data for all racing participants
  let placement = 0;
  for (const p of race.participants.values()) {
    if (p.status !== 'racing') continue;
    placement++;

    // Stagger times/distances so placements differ
    const jitter = placement - 1;

    if (isDistance) {
      // Distance race: all finish the target distance, with staggered times
      p.distance = target;
      p.elapsedTime = 420 + jitter * 15; // ~7min base + 15s per place
      p.averagePace = (p.elapsedTime / (target / 500)); // pace per 500m
    } else {
      // Time race: all race for the target time, with staggered distances
      p.elapsedTime = target;
      p.distance = 2000 - jitter * 80; // ~2000m base - 80m per place
      p.averagePace = (target / (p.distance / 500));
    }

    p.strokeRate = 28 + Math.floor(Math.random() * 6);
    p.heartRate = 155 + Math.floor(Math.random() * 20);
    p.watts = 180 + Math.floor(Math.random() * 60);
    p.calories = Math.floor(p.elapsedTime * 0.25);
    p.strokeCount = Math.floor(p.elapsedTime * p.strokeRate / 60);

    p.status = 'finished';
    queries.updateParticipantStatus.run('finished', raceId, p.userId);
  }

  finishRace(race);
}

function handleExitRace(raceId: string, userId: string, username: string): void {
  const race = activeRaces.get(raceId);
  if (!race) return;

  const participant = race.participants.get(userId);
  if (!participant) return;
  // Only allow exit from active states
  if (participant.status !== 'racing' && participant.status !== 'joined' &&
      participant.status !== 'warmup_confirmed' && participant.status !== 'ready') return;

  participant.status = 'dnf';
  queries.updateParticipantStatus.run('dnf', raceId, userId);
  console.log(`[race] ${raceId}: ${username} exited (DNF)`);

  // Store partial results for DNF participant
  queries.updateParticipantResult.run(
    participant.elapsedTime, participant.distance, participant.averagePace,
    participant.calories, participant.strokeCount, null, 'dnf',
    raceId, userId
  );

  // Notify other participants
  sendToRoom(raceId, JSON.stringify({
    type: 'participant_exited',
    race_id: raceId,
    user_id: userId,
    username,
  }));

  broadcastRaceState(race);

  // Check if race should end or be canceled
  if (race.state === 'racing') {
    checkRaceCompletion(race);
  } else if (shouldCancel(race)) {
    cancelRace(race);
  }
}

function checkParticipantFinished(race: ActiveRace, p: LiveParticipant): boolean {
  const fmt = race.config.format;

  // PM5 workout_state 5 = finished (universal signal for all formats)
  if (p.workoutState === 5) return true;

  if (fmt === 'distance') {
    return p.distance >= race.config.target_value;
  } else if (fmt === 'time') {
    return p.elapsedTime >= race.config.target_value;
  } else if (fmt === 'interval_distance') {
    const totalDist = (race.config.interval_count ?? 1) * race.config.target_value;
    return p.distance >= totalDist;
  } else if (fmt === 'interval_time') {
    const totalWork = (race.config.interval_count ?? 1) * race.config.target_value;
    return p.elapsedTime >= totalWork;
  }
  return false;
}
