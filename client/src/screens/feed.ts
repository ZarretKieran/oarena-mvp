import { listRaces, createRace, joinRace, getStoredUser } from '../api';
import { navigate } from '../router';

function formatTarget(format: string, value: number): string {
  if (format === 'distance') return `${value}m`;
  const m = Math.floor(value / 60);
  const s = value % 60;
  return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

function formatWarmupTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = ts - now;

  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (diff < 0) return `Started ${dateStr} ${timeStr}`;
  if (diff < 3600000) return `In ${Math.ceil(diff / 60000)} min`;
  if (diff < 86400000) return `Today ${timeStr}`;
  return `${dateStr} ${timeStr}`;
}

function renderRaceCard(race: any, currentUserId: string): string {
  const isCreator = race.creator_id === currentUserId;
  const isFull = race.participant_count >= race.max_participants;
  const canJoin = !isCreator && !isFull && race.state === 'open';
  const isJoined = false; // TODO: track from participant list

  return `
    <div class="card race-card" data-race-id="${race.id}">
      <div class="card-header">
        <span class="card-title">${race.creator_username}'s Race</span>
        <div>
          <span class="badge badge-${race.race_type}">${race.race_type}</span>
          <span class="badge badge-${race.format}">${race.format}</span>
        </div>
      </div>
      <div class="race-card-details">
        <div class="race-card-target">${formatTarget(race.format, race.target_value)}</div>
        <div class="race-card-meta">
          <span>${formatWarmupTime(race.warmup_start_time)}</span>
          <span>${race.participant_count}/${race.max_participants} joined</span>
        </div>
      </div>
      <div class="race-card-actions">
        ${canJoin ? `<button class="btn-primary join-btn" data-race-id="${race.id}">Join Race</button>` : ''}
        ${isCreator || isFull ? `<button class="btn-primary lobby-btn" data-race-id="${race.id}">View Lobby</button>` : ''}
        ${isFull && !isCreator ? `<span class="race-card-full">Full</span>` : ''}
      </div>
    </div>
  `;
}

function openCreateModal(container: HTMLElement, onCreated: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3>Create Race</h3>
      <form id="create-race-form">
        <div class="form-group">
          <label>Race Type</label>
          <select id="cr-type">
            <option value="duel">Duel (1v1)</option>
            <option value="group">Group</option>
          </select>
        </div>
        <div class="form-group" id="cr-max-group" style="display:none">
          <label>Max Participants</label>
          <input type="number" id="cr-max" value="4" min="2" max="20" />
        </div>
        <div class="form-group">
          <label>Format</label>
          <select id="cr-format">
            <option value="distance">Distance</option>
            <option value="time">Time</option>
          </select>
        </div>
        <div class="form-group" id="cr-dist-group">
          <label>Distance (meters)</label>
          <input type="number" id="cr-distance" value="2000" min="100" step="100" />
        </div>
        <div class="form-group" id="cr-time-group" style="display:none">
          <label>Time (minutes)</label>
          <input type="number" id="cr-time" value="30" min="1" />
        </div>
        <div class="form-group">
          <label>Warmup Start Time</label>
          <input type="datetime-local" id="cr-warmup" required />
        </div>
        <button type="submit" class="btn-primary" id="cr-submit">Create Race</button>
        <button type="button" class="btn-secondary" id="cr-cancel">Cancel</button>
        <p id="cr-error" class="error"></p>
      </form>
    </div>
  `;

  container.appendChild(overlay);

  // Set default warmup time to 15 min from now
  const warmupInput = overlay.querySelector('#cr-warmup') as HTMLInputElement;
  const defaultTime = new Date(Date.now() + 15 * 60000);
  warmupInput.value = defaultTime.toISOString().slice(0, 16);

  // Toggle format fields
  const formatSelect = overlay.querySelector('#cr-format') as HTMLSelectElement;
  const distGroup = overlay.querySelector('#cr-dist-group') as HTMLElement;
  const timeGroup = overlay.querySelector('#cr-time-group') as HTMLElement;
  formatSelect.addEventListener('change', () => {
    distGroup.style.display = formatSelect.value === 'distance' ? '' : 'none';
    timeGroup.style.display = formatSelect.value === 'time' ? '' : 'none';
  });

  // Toggle max participants for group
  const typeSelect = overlay.querySelector('#cr-type') as HTMLSelectElement;
  const maxGroup = overlay.querySelector('#cr-max-group') as HTMLElement;
  typeSelect.addEventListener('change', () => {
    maxGroup.style.display = typeSelect.value === 'group' ? '' : 'none';
  });

  // Cancel
  overlay.querySelector('#cr-cancel')!.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Submit
  const form = overlay.querySelector('#create-race-form') as HTMLFormElement;
  const errorEl = overlay.querySelector('#cr-error') as HTMLElement;
  const submitBtn = overlay.querySelector('#cr-submit') as HTMLButtonElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;

    try {
      const format = formatSelect.value as 'distance' | 'time';
      const targetValue = format === 'distance'
        ? parseInt((overlay.querySelector('#cr-distance') as HTMLInputElement).value)
        : parseInt((overlay.querySelector('#cr-time') as HTMLInputElement).value) * 60;

      const warmupTime = new Date(warmupInput.value).getTime();
      if (warmupTime < Date.now()) {
        throw new Error('Warmup time must be in the future');
      }

      const params: any = {
        race_type: typeSelect.value,
        format,
        target_value: targetValue,
        warmup_start_time: warmupTime,
      };

      if (typeSelect.value === 'group') {
        params.max_participants = parseInt((overlay.querySelector('#cr-max') as HTMLInputElement).value);
      }

      const result = await createRace(params);
      overlay.remove();
      onCreated();
      // Go to lobby for the created race
      navigate(`lobby/${result.race.id}`);
    } catch (err: any) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

export function renderFeed(container: HTMLElement): void {
  const user = getStoredUser();

  container.innerHTML = `
    <div class="screen feed-screen">
      <div class="feed-header">
        <h2>Races</h2>
        <div class="feed-header-right">
          <span class="user-label">${user?.username ?? ''}</span>
          <button class="btn-secondary nav-history-btn">History</button>
          <button class="btn-secondary nav-logout-btn">Logout</button>
        </div>
      </div>
      <div id="race-list" class="race-list">
        <p class="placeholder">Loading races...</p>
      </div>
      <button class="fab" id="create-race-fab">+</button>
    </div>
  `;

  // Logout
  container.querySelector('.nav-logout-btn')!.addEventListener('click', () => {
    localStorage.removeItem('oarena_token');
    localStorage.removeItem('oarena_user');
    navigate('');
  });

  // History
  container.querySelector('.nav-history-btn')!.addEventListener('click', () => {
    navigate('history');
  });

  const raceListEl = container.querySelector('#race-list') as HTMLElement;

  async function loadRaces() {
    try {
      const data = await listRaces();
      if (data.races.length === 0) {
        raceListEl.innerHTML = '<p class="placeholder">No races yet. Create one!</p>';
        return;
      }
      raceListEl.innerHTML = data.races
        .map((r: any) => renderRaceCard(r, user?.id ?? ''))
        .join('');

      // Bind join buttons
      raceListEl.querySelectorAll('.join-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          const raceId = (e.target as HTMLElement).dataset.raceId!;
          try {
            await joinRace(raceId);
            navigate(`lobby/${raceId}`);
          } catch (err: any) {
            alert(err.message);
          }
        });
      });

      // Bind lobby buttons
      raceListEl.querySelectorAll('.lobby-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const raceId = (e.target as HTMLElement).dataset.raceId!;
          navigate(`lobby/${raceId}`);
        });
      });
    } catch (err: any) {
      raceListEl.innerHTML = `<p class="error">${err.message}</p>`;
    }
  }

  loadRaces();

  // Create race FAB
  container.querySelector('#create-race-fab')!.addEventListener('click', () => {
    openCreateModal(container, loadRaces);
  });
}
