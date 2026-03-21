import { getRace, getStoredUser } from '../api';
import { sendWs, onWsMessage } from '../ws';
import { navigate } from '../router';
import { connectErg, isErgConnected, programWorkout, setRaceId, onErgState } from '../erg';
import type { ServerMessage, Participant, RaceState, RaceConfig } from '../../../shared/types';

function formatTarget(format: string, value: number): string {
  if (format === 'distance') return `${value}m`;
  const m = Math.floor(value / 60);
  const s = value % 60;
  return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'warmup_confirmed': return '<span class="status-dot waiting"></span>';
    case 'ready': return '<span class="status-dot connected"></span>';
    case 'racing': return '<span class="status-dot connected"></span>';
    case 'disqualified': return '<span class="status-dot disconnected"></span>';
    default: return '<span class="status-dot disconnected"></span>';
  }
}

export function renderLobby(container: HTMLElement, raceId: string): void {
  const user = getStoredUser();
  let ergConnected = isErgConnected();
  let raceConfig: RaceConfig | null = null;

  container.innerHTML = `
    <div class="screen lobby-screen">
      <button class="btn-secondary back-btn">&larr; Back to Feed</button>
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
  let participants: Participant[] = [];
  let countdownValue: number | null = null;
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  // Set the race ID for erg data relay
  setRaceId(raceId);

  // Join the WS room
  sendWs({ type: 'join_room', race_id: raceId });

  // Track PM5 connection state changes
  onErgState((connected) => {
    ergConnected = connected;
    renderContent();
  });

  const unsub = onWsMessage((msg: ServerMessage) => {
    if (msg.type === 'race_state' && msg.race_id === raceId) {
      raceState = msg.state;
      participants = [...msg.participants];
      if (msg.countdown !== undefined) {
        startCountdown(msg.countdown);
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
      programWorkout(msg.config);
      renderContent();
    }

    if (msg.type === 'participant_exited' && msg.race_id === raceId) {
      // Race state broadcast will update the participants list automatically
    }
  });

  function cleanup() {
    unsub();
    if (countdownInterval) clearInterval(countdownInterval);
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

    contentEl.innerHTML = `
      <div class="lobby-header">
        <h2>${formatTarget(raceFormat, raceTarget)} Race</h2>
        <span class="badge badge-${raceState === 'open' ? 'time' : 'distance'}">${raceState.replace('_', ' ')}</span>
      </div>

      <div class="erg-status card">
        <div class="card-header">
          <span>PM5 Connection</span>
          <span class="status-dot ${ergConnected ? 'connected' : 'disconnected'}"></span>
        </div>
        ${!ergConnected ? `
          <button class="btn-primary" id="connect-erg-btn">Connect PM5</button>
        ` : `
          <p style="color:var(--green); font-size:0.85rem">Connected</p>
        `}
      </div>

      ${countdownValue !== null && raceState === 'countdown' ? `
        <div class="countdown ${countdownValue <= 15 ? 'warning' : ''} ${countdownValue <= 3 ? 'go' : ''}">
          ${countdownValue}
        </div>
        <p style="text-align:center; color:var(--text-dim)">
          ${countdownValue > 15 ? 'Race starting soon...' : 'PM5 being programmed — do nothing!'}
        </p>
      ` : ''}

      ${raceState === 'warmup' || raceState === 'ready_check' ? `
        <div class="warmup-controls">
          ${myStatus === 'joined' ? `
            <p>Confirm you are on your erg and ready to warm up.</p>
            <button class="btn-primary" id="warmup-confirm-btn">Start Warmup</button>
          ` : myStatus === 'warmup_confirmed' ? `
            <p style="color:var(--green)">Warming up... Click ready when you're done.</p>
            <button class="btn-primary" id="ready-btn">I'm Ready</button>
          ` : myStatus === 'ready' ? `
            <p style="color:var(--green)">You're ready! Waiting for others...</p>
          ` : `
            <p style="color:var(--red)">Disqualified</p>
          `}
        </div>
      ` : ''}

      ${raceState === 'open' ? `
        <p style="color:var(--text-dim); text-align:center">
          Waiting for warmup start time...
        </p>
      ` : ''}

      <div class="participants-list">
        <h3>Participants</h3>
        ${participants.map(p => `
          <div class="participant-row ${p.user_id === user?.id ? 'self-row' : ''}">
            ${statusIcon(p.status)}
            <span class="participant-name">${p.username}</span>
            <span class="participant-status">${p.status.replace('_', ' ')}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Bind PM5 connect
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

    // Bind warmup confirm
    const warmupBtn = contentEl.querySelector('#warmup-confirm-btn');
    if (warmupBtn) {
      warmupBtn.addEventListener('click', () => {
        sendWs({ type: 'warmup_confirm', race_id: raceId });
      });
    }

    // Bind ready
    const readyBtn = contentEl.querySelector('#ready-btn');
    if (readyBtn) {
      readyBtn.addEventListener('click', () => {
        sendWs({ type: 'ready', race_id: raceId });
      });
    }
  }

  loadRace();
  window.addEventListener('hashchange', cleanup, { once: true });
}
