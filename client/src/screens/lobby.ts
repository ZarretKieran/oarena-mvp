import { getRace, getStoredUser } from '../api';
import { sendWs, onWsMessage } from '../ws';
import { navigate } from '../router';
import { connectErg, isErgConnected, programWorkout, resetRaceFlow, setRaceId, onErgState, syncRaceCountdown } from '../erg';
import type { ServerMessage, Participant, RaceState, RaceConfig } from '../../../shared/types';

function formatTarget(format: string, value: number): string {
  if (format === 'distance') return `${value.toLocaleString()}m`;
  const m = Math.floor(value / 60);
  const s = value % 60;
  return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

function formatWarmupTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = ts - now;
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff < 0) return `Started at ${timeStr}`;
  if (diff < 60000) return `Starting in < 1 min`;
  if (diff < 3600000) return `Starting in ${Math.ceil(diff / 60000)} min`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${timeStr}`;
}

function stateStyle(state: string): { label: string; color: string; bg: string } {
  switch (state) {
    case 'open': return { label: 'Waiting', color: '#fff', bg: 'var(--blue)' };
    case 'warmup': return { label: 'Warmup', color: '#000', bg: 'var(--yellow)' };
    case 'ready_check': return { label: 'Ready Check', color: '#fff', bg: 'var(--orange)' };
    case 'countdown': return { label: 'Countdown', color: '#fff', bg: 'var(--orange)' };
    case 'racing': return { label: 'Racing', color: '#fff', bg: 'var(--red)' };
    default: return { label: state, color: '#fff', bg: 'var(--surface)' };
  }
}

function participantStatusBadge(status: string, isSelf: boolean): string {
  const selfLabel = isSelf ? ' (you)' : '';
  switch (status) {
    case 'joined':
      return `<span style="color:var(--blue);font-size:0.75rem">Joined${selfLabel}</span>`;
    case 'warmup_confirmed':
      return `<span style="color:var(--yellow);font-size:0.75rem">Warming Up${selfLabel}</span>`;
    case 'ready':
      return `<span style="color:var(--green);font-size:0.75rem;font-weight:600">Ready${selfLabel}</span>`;
    case 'racing':
      return `<span style="color:var(--orange);font-size:0.75rem">Racing${selfLabel}</span>`;
    case 'disqualified':
      return `<span style="color:var(--red);font-size:0.75rem">DQ${selfLabel}</span>`;
    case 'dnf':
      return `<span style="color:var(--red);font-size:0.75rem">DNF${selfLabel}</span>`;
    default:
      return `<span style="color:var(--text-dim);font-size:0.75rem">${status}${selfLabel}</span>`;
  }
}

function participantDot(status: string): string {
  const colors: Record<string, string> = {
    joined: 'var(--blue)',
    warmup_confirmed: 'var(--yellow)',
    ready: 'var(--green)',
    racing: 'var(--orange)',
    finished: 'var(--green)',
    disqualified: 'var(--red)',
    dnf: 'var(--red)',
  };
  const color = colors[status] || 'var(--text-dim)';
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>`;
}

export function renderLobby(container: HTMLElement, raceId: string): void {
  const user = getStoredUser();
  let ergConnected = isErgConnected();
  let raceConfig: RaceConfig | null = null;
  let warmupStartTime = 0;

  container.innerHTML = `
    <div class="screen lobby-screen">
      <button class="btn-secondary back-btn" style="margin-bottom:12px">&larr; Back to Races</button>
      <div id="lobby-content">
        <p class="placeholder">Loading race...</p>
      </div>
    </div>
  `;

  container.querySelector('.back-btn')!.addEventListener('click', () => navigate('feed'));

  const contentEl = container.querySelector('#lobby-content') as HTMLElement;
  let raceState: RaceState = 'open';
  let raceFormat = '';
  let raceTarget = 0;
  let raceSplitValue = 500;
  let raceIntervalCount: number | undefined;
  let raceRestSeconds: number | undefined;
  let raceType = '';
  let maxParticipants = 2;
  let creatorUsername = '';
  let participants: Participant[] = [];
  let countdownValue: number | null = null;
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  setRaceId(raceId);
  sendWs({ type: 'join_room', race_id: raceId });

  onErgState((connected) => {
    ergConnected = connected;
    renderContent();
  });

  const unsub = onWsMessage((msg: ServerMessage) => {
    if (msg.type === 'race_state' && msg.race_id === raceId) {
      raceState = msg.state;
      participants = [...msg.participants];
      if (msg.format) raceFormat = msg.format;
      if (msg.target_value !== undefined) raceTarget = msg.target_value;
      if (msg.split_value !== undefined) raceSplitValue = msg.split_value;
      if (msg.interval_count !== undefined) raceIntervalCount = msg.interval_count;
      if (msg.rest_seconds !== undefined) raceRestSeconds = msg.rest_seconds;
      if (msg.countdown !== undefined) {
        startCountdown(msg.countdown);
      }

      const liveConfig = currentRaceConfig();
      if (liveConfig && msg.state === 'countdown' && msg.countdown !== undefined) {
        syncRaceCountdown(liveConfig, msg.countdown).catch((err) => {
          console.warn('[lobby] PM5 countdown sync failed', err);
        });
      } else if (liveConfig && msg.state === 'racing') {
        syncRaceCountdown(liveConfig, 0).catch((err) => {
          console.warn('[lobby] PM5 race start sync failed', err);
        });
      } else if (msg.state !== 'countdown') {
        resetRaceFlow();
      }

      renderContent();

      if (msg.state === 'racing') {
        cleanup();
        navigate(`race/${raceId}`);
      }
      if (msg.state === 'finished' || msg.state === 'canceled') {
        cleanup();
        navigate(`results/${raceId}`);
      }
    }

    if (msg.type === 'program_workout') {
      raceConfig = msg.config;
      programWorkout(msg.config).catch((err) => {
        console.warn('[lobby] PM5 fallback program failed', err);
      });
      renderContent();
    }
  });

  function cleanup() {
    unsub();
    if (countdownInterval) clearInterval(countdownInterval);
    resetRaceFlow();
  }

  function startCountdown(seconds: number) {
    countdownValue = seconds;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      if (countdownValue !== null && countdownValue > 0) {
        countdownValue--;
        renderContent();
        if (countdownValue <= 0) {
          if (countdownInterval) clearInterval(countdownInterval);
        }
      }
    }, 1000);
  }

  async function loadRace() {
    try {
      const data = await getRace(raceId);
      raceState = data.race.state;
      raceFormat = data.race.format;
      raceTarget = data.race.target_value;
      raceSplitValue = data.race.split_value ?? raceSplitValue;
      raceIntervalCount = data.race.interval_count ?? raceIntervalCount;
      raceRestSeconds = data.race.rest_seconds ?? raceRestSeconds;
      raceType = data.race.race_type;
      maxParticipants = data.race.max_participants;
      creatorUsername = data.race.creator_username ?? '';
      warmupStartTime = data.race.warmup_start_time;
      participants = data.participants.map((p: any) => ({
        user_id: p.user_id,
        username: p.username,
        status: p.status,
      }));
      renderContent();
    } catch (err: any) {
      contentEl.innerHTML = `<p class="error">${err.message}</p>`;
    }
  }

  function renderContent() {
    const myStatus = participants.find(p => p.user_id === user?.id)?.status ?? 'joined';
    const ss = stateStyle(raceState);

    // Action prompt for the user
    let actionHtml = '';
    if (raceState === 'open') {
      actionHtml = `
        <div class="card" style="border-left:3px solid var(--blue);margin-bottom:12px">
          <p style="color:var(--blue);font-weight:600;margin:0">Waiting for warmup time</p>
          <p style="color:var(--text-dim);font-size:0.8rem;margin:4px 0 0">🕐 ${formatWarmupTime(warmupStartTime)}</p>
        </div>
      `;
    } else if (raceState === 'warmup' || raceState === 'ready_check') {
      if (myStatus === 'joined') {
        actionHtml = `
          <div class="card" style="border-left:3px solid var(--yellow);margin-bottom:12px">
            <p style="color:var(--yellow);font-weight:600;margin:0 0 8px">Step 1: Confirm you're on your erg</p>
            <button class="btn-primary" id="warmup-confirm-btn" style="background:var(--yellow);color:#000;width:100%">Confirm Warmup</button>
          </div>
        `;
      } else if (myStatus === 'warmup_confirmed') {
        actionHtml = `
          <div class="card" style="border-left:3px solid var(--green);margin-bottom:12px">
            <p style="color:var(--green);font-weight:600;margin:0 0 8px">Step 2: Mark ready when done warming up</p>
            <button class="btn-primary" id="ready-btn" style="background:var(--green);color:#000;width:100%">I'm Ready</button>
          </div>
        `;
      } else if (myStatus === 'ready') {
        actionHtml = `
          <div class="card" style="border-left:3px solid var(--green);margin-bottom:12px">
            <p style="color:var(--green);font-weight:600;margin:0">You're ready!</p>
            <p style="color:var(--text-dim);font-size:0.8rem;margin:4px 0 0">Waiting for all participants to ready up...</p>
          </div>
        `;
      } else {
        actionHtml = `
          <div class="card" style="border-left:3px solid var(--red);margin-bottom:12px">
            <p style="color:var(--red);font-weight:600;margin:0">Disqualified</p>
          </div>
        `;
      }
    }

    contentEl.innerHTML = `
      <div class="lobby-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <h2 style="margin:0">${formatTarget(raceFormat, raceTarget)}</h2>
          <p style="color:var(--text-dim);font-size:0.8rem;margin:2px 0 0">${raceType.toUpperCase()} ${raceFormat.toUpperCase()}${creatorUsername ? ` — by ${creatorUsername}` : ''}</p>
        </div>
        <span style="display:inline-block;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:600;color:${ss.color};background:${ss.bg}">${ss.label}</span>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="status-dot ${ergConnected ? 'connected' : 'disconnected'}"></span>
            <span style="font-size:0.85rem">${ergConnected ? 'PM5 Connected' : 'PM5 Not Connected'}</span>
          </div>
          ${!ergConnected ? `<button class="btn-primary" id="connect-erg-btn" style="font-size:0.8rem;padding:6px 12px">Connect PM5</button>` : ''}
        </div>
      </div>

      ${countdownValue !== null && raceState === 'countdown' ? `
        <div class="countdown ${countdownValue <= 15 ? 'warning' : ''} ${countdownValue <= 3 ? 'go' : ''}">
          ${countdownValue}
        </div>
        <p style="text-align:center;color:var(--text-dim);margin-bottom:12px">
          ${countdownValue > 15 ? 'Race is about to begin. Stop rowing and hold ready.' : countdownValue > 0 ? 'PM5 race start is armed. Wait for ATTENTION... GO!' : 'GO!'}
        </p>
      ` : ''}

      ${actionHtml}

      <div class="card">
        <h3 style="font-size:0.85rem;color:var(--text-dim);margin:0 0 8px">Participants (${participants.length}/${maxParticipants})</h3>
        ${participants.map(p => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;${p.user_id === user?.id ? 'font-weight:600' : ''}">
            <div style="display:flex;align-items:center">
              ${participantDot(p.status)}
              <span style="font-size:0.85rem">${p.username}</span>
            </div>
            ${participantStatusBadge(p.status, p.user_id === user?.id)}
          </div>
        `).join('')}
        ${participants.length === 0 ? '<p style="color:var(--text-dim);font-size:0.85rem;text-align:center">No participants yet</p>' : ''}
      </div>

      ${warmupStartTime > 0 ? `
        <p style="text-align:center;color:var(--text-dim);font-size:0.75rem;margin-top:12px">
          Warmup: ${formatWarmupTime(warmupStartTime)}
        </p>
      ` : ''}
    `;

    // Bind buttons
    const ergBtn = contentEl.querySelector('#connect-erg-btn');
    if (ergBtn) {
      ergBtn.addEventListener('click', async () => {
        try {
          await connectErg();
          ergConnected = true;
          renderContent();
        } catch (err: any) {
          alert('PM5 connect failed: ' + err.message);
        }
      });
    }

    const warmupBtn = contentEl.querySelector('#warmup-confirm-btn');
    if (warmupBtn) {
      warmupBtn.addEventListener('click', () => {
        sendWs({ type: 'warmup_confirm', race_id: raceId });
      });
    }

    const readyBtn = contentEl.querySelector('#ready-btn');
    if (readyBtn) {
      readyBtn.addEventListener('click', () => {
        sendWs({ type: 'ready', race_id: raceId });
      });
    }
  }

  function currentRaceConfig(): RaceConfig | null {
    if (!raceFormat || !raceTarget) return null;

    return {
      format: raceFormat as RaceConfig['format'],
      target_value: raceTarget,
      split_value: raceSplitValue,
      interval_count: raceIntervalCount,
      rest_seconds: raceRestSeconds,
    };
  }

  loadRace();
  window.addEventListener('hashchange', cleanup, { once: true });
}
