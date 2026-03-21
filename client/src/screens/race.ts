import { getStoredUser } from '../api';
import { onWsMessage, sendWs } from '../ws';
import { navigate } from '../router';
import { onErgData, setRaceId, isErgConnected, connectErg } from '../erg';
import type { ServerMessage } from '../../../shared/types';

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
      if (msg.state === 'finished' || msg.state === 'canceled') {
        raceFinished = true;
        cleanup();
        navigate(`results/${raceId}`);
      }
    }
  });

  function cleanup() {
    unsub();
    onErgData(() => {}); // clear callback
  }

  function renderContent() {
    const myPosition = standings.find(s => s.user_id === user?.id)?.position ?? '-';

    contentEl.innerHTML = `
      <div class="race-position">
        <span class="position-label">Position</span>
        <span class="position-value">${myPosition}</span>
        <span class="position-total">/ ${standings.length || '-'}</span>
      </div>

      <div class="metrics-grid">
        <div class="metric-box">
          <div class="metric-label">Time</div>
          <div class="metric-value large">${formatTime(myData.elapsed_time)}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Distance</div>
          <div class="metric-value large">${formatDistance(myData.distance)}m</div>
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
              <th>Distance</th>
              <th>Pace</th>
              <th>S/M</th>
            </tr>
          </thead>
          <tbody>
            ${standings.map(s => `
              <tr class="${s.user_id === user?.id ? 'self-row' : ''} ${s.position === 1 ? 'pos-1' : s.position === 2 ? 'pos-2' : ''}">
                <td>${s.position}</td>
                <td>${s.username}${s.user_id === user?.id ? ' (you)' : ''}</td>
                <td>${formatDistance(s.distance)}m</td>
                <td>${formatPace(s.pace)}</td>
                <td>${s.stroke_rate}</td>
              </tr>
            `).join('')}
            ${standings.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:var(--text-dim)">Waiting for data...</td></tr>' : ''}
          </tbody>
        </table>
      </div>
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
  }

  renderContent();
  window.addEventListener('hashchange', cleanup, { once: true });
}
