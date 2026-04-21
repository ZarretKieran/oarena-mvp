import { getStoredUser } from '../api';
import { onWsMessage, sendWs } from '../ws';
import { navigate } from '../router';
import { onErgData, setRaceId, isErgConnected, connectErg, resetRaceFlow, syncRaceCountdown } from '../erg';
import type { ServerMessage, RaceConfig, RaceFormat } from '../../../shared/types';

function formatPace(seconds: number): string {
  if (!seconds || seconds <= 0 || seconds > 999) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}

function formatTime(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDistance(meters: number): string {
  return Math.floor(meters).toLocaleString();
}

export function renderRace(container: HTMLElement, raceId: string): void {
  const user = getStoredUser();
  setRaceId(raceId);

  // Join room (in case we came from a page refresh)
  sendWs({ type: 'join_room', race_id: raceId });

  // Race config (populated from race_state messages)
  let raceFormat: RaceFormat | null = null;
  let targetValue = 0;
  let splitValue = 500;
  let intervalCount: number | undefined;
  let restSeconds: number | undefined;
  let creatorId: string | null = null;

  // Local PM5 data
  let myData = {
    elapsed_time: 0,
    distance: 0,
    current_pace: 0,
    average_pace: 0,
    stroke_rate: 0,
    heart_rate: 0,
    watts: 0,
    calories: 0,
    stroke_count: 0,
  };

  // Standings from server
  let standings: Array<{
    user_id: string;
    username: string;
    distance: number;
    pace: number;
    stroke_rate: number;
    heart_rate: number;
    position: number;
  }> = [];

  let raceFinished = false;
  let exitNotification = '';

  container.innerHTML = `
    <div class="screen race-screen">
      <div id="race-content"></div>
    </div>
  `;

  const contentEl = container.querySelector('#race-content') as HTMLElement;

  // Listen for local PM5 data
  onErgData((data) => {
    myData = {
      elapsed_time: data.elapsed_time ?? myData.elapsed_time,
      distance: data.distance ?? myData.distance,
      current_pace: data.current_pace ?? myData.current_pace,
      average_pace: data.average_pace ?? myData.average_pace,
      stroke_rate: data.stroke_rate ?? myData.stroke_rate,
      heart_rate: data.heart_rate ?? myData.heart_rate,
      watts: data.watts ?? myData.watts,
      calories: data.calories ?? myData.calories,
      stroke_count: data.stroke_count ?? myData.stroke_count,
    };
    renderContent();
  });

  // Listen for server messages
  const unsub = onWsMessage((msg: ServerMessage) => {
    if (msg.type === 'standings' && msg.race_id === raceId) {
      standings = [...msg.standings];
      renderContent();
    }

    if (msg.type === 'race_result' && msg.race_id === raceId) {
      raceFinished = true;
      cleanup();
      navigate(`results/${raceId}`);
    }

    if (msg.type === 'race_state' && msg.race_id === raceId) {
      if (msg.format) raceFormat = msg.format;
      if (msg.target_value !== undefined) targetValue = msg.target_value;
      if (msg.split_value !== undefined) splitValue = msg.split_value;
      if (msg.interval_count !== undefined) intervalCount = msg.interval_count;
      if (msg.rest_seconds !== undefined) restSeconds = msg.rest_seconds;
      if (msg.creator_id) creatorId = msg.creator_id;

      const config = currentRaceConfig();
      if (config && msg.state === 'countdown' && msg.countdown !== undefined) {
        syncRaceCountdown(config, msg.countdown).catch((err) => {
          console.warn('[race] PM5 countdown sync failed', err);
        });
      } else if (config && msg.state === 'racing') {
        syncRaceCountdown(config, 0).catch((err) => {
          console.warn('[race] PM5 race start sync failed', err);
        });
      } else if (msg.state !== 'countdown') {
        resetRaceFlow();
      }

      if (msg.state === 'finished' || msg.state === 'canceled') {
        raceFinished = true;
        cleanup();
        navigate(`results/${raceId}`);
      }
    }

    if (msg.type === 'participant_exited' && msg.race_id === raceId) {
      exitNotification = `${msg.username} has left the race (DNF)`;
      renderContent();
      // Clear notification after 5 seconds
      setTimeout(() => {
        exitNotification = '';
        renderContent();
      }, 5000);
    }
  });

  function cleanup() {
    unsub();
    onErgData(() => {}); // clear callback
    resetRaceFlow();
  }

  function exitRace() {
    if (!confirm('Exit this race? You will receive a DNF.')) return;
    sendWs({ type: 'exit_race', race_id: raceId });
    cleanup();
    setRaceId(null);
    navigate('feed');
  }

  function renderContent() {
    const myPosition = standings.find(s => s.user_id === user?.id)?.position ?? '-';

    // Countdown display: show remaining distance/time instead of accumulated
    const displayDistance = (raceFormat === 'distance' && targetValue > 0)
      ? Math.max(0, targetValue - myData.distance)
      : myData.distance;
    const displayTime = (raceFormat === 'time' && targetValue > 0)
      ? Math.max(0, targetValue - myData.elapsed_time)
      : myData.elapsed_time;

    const distanceLabel = (raceFormat === 'distance' && targetValue > 0) ? 'Remaining' : 'Distance';
    const timeLabel = (raceFormat === 'time' && targetValue > 0) ? 'Remaining' : 'Time';

    contentEl.innerHTML = `
      ${exitNotification ? `
        <div class="exit-notification" style="background:var(--red); color:white; padding:8px 12px; border-radius:8px; text-align:center; margin-bottom:12px; font-size:0.85rem">
          ${exitNotification}
        </div>
      ` : ''}

      <div class="race-position">
        <span class="position-label">Position</span>
        <span class="position-value">${myPosition}</span>
        <span class="position-total">/ ${standings.length || '-'}</span>
      </div>

      <div class="metrics-grid">
        <div class="metric-box">
          <div class="metric-label">${timeLabel}</div>
          <div class="metric-value large">${formatTime(displayTime)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">${distanceLabel}</div>
          <div class="metric-value large">${formatDistance(displayDistance)}m</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Pace /500m</div>
          <div class="metric-value">${formatPace(myData.current_pace)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Avg Pace</div>
          <div class="metric-value">${formatPace(myData.average_pace)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Stroke Rate</div>
          <div class="metric-value">${myData.stroke_rate} spm</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Heart Rate</div>
          <div class="metric-value">${myData.heart_rate || '--'} bpm</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Watts</div>
          <div class="metric-value">${myData.watts}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Calories</div>
          <div class="metric-value">${myData.calories}</div>
        </div>
      </div>

      ${!isErgConnected() ? `
        <div class="card" style="margin-top:12px; text-align:center">
          <p style="color:var(--yellow); margin-bottom:8px">PM5 not connected</p>
          <button class="btn-primary" id="reconnect-erg-btn">Reconnect PM5</button>
        </div>
      ` : ''}

      <div class="standings-section">
        <h3 style="font-size:0.85rem; color:var(--text-dim); margin: 16px 0 8px">Live Standings</h3>
        <table class="standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Athlete</th>
              <th>${(raceFormat === 'distance' && targetValue > 0) ? 'Remaining' : 'Distance'}</th>
              <th>Pace</th>
              <th>S/M</th>
            </tr>
          </thead>
          <tbody>
            ${standings.map(s => {
              const standingsDist = (raceFormat === 'distance' && targetValue > 0)
                ? Math.max(0, targetValue - s.distance)
                : s.distance;
              return `
              <tr class="${s.user_id === user?.id ? 'self-row' : ''} ${s.position === 1 ? 'pos-1' : s.position === 2 ? 'pos-2' : ''}">
                <td>${s.position}</td>
                <td>${s.username}${s.user_id === user?.id ? ' (you)' : ''}</td>
                <td>${formatDistance(standingsDist)}m</td>
                <td>${formatPace(s.pace)}</td>
                <td>${s.stroke_rate}</td>
              </tr>
            `}).join('')}
            ${standings.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:var(--text-dim)">Waiting for data...</td></tr>' : ''}
          </tbody>
        </table>
      </div>

      <div style="margin-top:20px; text-align:center">
        <button class="btn-secondary" id="exit-race-btn" style="color:var(--red); border-color:var(--red)">Exit Race (DNF)</button>
      </div>

      ${creatorId === user?.id ? `
        <div style="margin-top:16px; text-align:center; padding:12px; border:1px dashed var(--yellow); border-radius:8px">
          <p style="color:var(--yellow); font-size:0.75rem; margin-bottom:8px">[TESTING] Complete race with dummy data</p>
          <button class="btn-secondary" id="force-finish-btn" style="color:var(--yellow); border-color:var(--yellow)">Force Finish Race</button>
        </div>
      ` : ''}
    `;

    // Reconnect button
    const reconnectBtn = contentEl.querySelector('#reconnect-erg-btn');
    if (reconnectBtn) {
      reconnectBtn.addEventListener('click', async () => {
        try {
          await connectErg();
          renderContent();
        } catch (err: any) {
          alert('PM5 reconnect failed: ' + err.message);
        }
      });
    }

    // Exit race button
    const exitBtn = contentEl.querySelector('#exit-race-btn');
    if (exitBtn) {
      exitBtn.addEventListener('click', exitRace);
    }

    // Force finish button (testing only)
    const forceBtn = contentEl.querySelector('#force-finish-btn');
    if (forceBtn) {
      forceBtn.addEventListener('click', () => {
        if (!confirm('[TEST] Force finish this race with dummy data?')) return;
        sendWs({ type: 'force_finish', race_id: raceId });
      });
    }
  }

  function currentRaceConfig(): RaceConfig | null {
    if (!raceFormat || !targetValue) return null;

    return {
      format: raceFormat,
      target_value: targetValue,
      split_value: splitValue,
      interval_count: intervalCount,
      rest_seconds: restSeconds,
    };
  }

  renderContent();
  window.addEventListener('hashchange', cleanup, { once: true });
}
