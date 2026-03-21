import { getHistory, getStoredUser } from '../api';
import { navigate } from '../router';

function formatPace(seconds: number): string {
  if (!seconds || seconds <= 0 || seconds > 999) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function placementLabel(p: number | null): string {
  if (!p) return 'DQ';
  if (p === 1) return '1st';
  if (p === 2) return '2nd';
  if (p === 3) return '3rd';
  return `${p}th`;
}

export function renderHistory(container: HTMLElement): void {
  const user = getStoredUser();

  container.innerHTML = `
    <div class="screen history-screen">
      <div class="feed-header">
        <h2>Race History</h2>
        <button class="btn-secondary back-btn">&larr; Feed</button>
      </div>
      <div id="history-list">
        <p class="placeholder">Loading...</p>
      </div>
    </div>
  `;

  container.querySelector('.back-btn')!.addEventListener('click', () => navigate('feed'));

  const listEl = container.querySelector('#history-list') as HTMLElement;

  async function load() {
    try {
      const data = await getHistory();
      if (data.races.length === 0) {
        listEl.innerHTML = '<p class="placeholder">No past races yet.</p>';
        return;
      }

      listEl.innerHTML = data.races.map((r: any) => `
        <div class="card" style="margin-bottom:8px; cursor:pointer" data-race-id="${r.id}">
          <div class="card-header">
            <span class="card-title">${r.format === 'distance' ? r.target_value + 'm' : Math.floor(r.target_value / 60) + ' min'}</span>
            <div>
              <span class="badge badge-${r.race_type}">${r.race_type}</span>
              <span class="badge ${r.state === 'finished' ? 'badge-distance' : 'badge-time'}">${r.state}</span>
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:8px; color:var(--text-dim); font-size:0.85rem">
            <span>${formatDate(r.created_at)}</span>
            <span>${r.participant_status === 'disqualified' ? 'DQ' : r.participant_status === 'dnf' ? 'DNF' : placementLabel(r.placement)}</span>
            ${r.final_avg_pace ? `<span>${formatPace(r.final_avg_pace)} avg</span>` : ''}
          </div>
        </div>
      `).join('');

      // Click to view results
      listEl.querySelectorAll('[data-race-id]').forEach(card => {
        card.addEventListener('click', () => {
          const rid = (card as HTMLElement).dataset.raceId!;
          navigate(`results/${rid}`);
        });
      });
    } catch (err: any) {
      listEl.innerHTML = `<p class="error">${err.message}</p>`;
    }
  }

  load();
}
