import { getRace, getStoredUser } from '../api';
import { onWsMessage } from '../ws';
import { navigate } from '../router';
import { setRaceId } from '../erg';
import type { ServerMessage, RaceResult } from '../../../shared/types';

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
  const tenths = Math.floor((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}

function placementClass(p: number): string {
  if (p === 1) return 'gold';
  if (p === 2) return 'silver';
  if (p === 3) return 'bronze';
  return '';
}

function placementLabel(p: number): string {
  if (p === 1) return '1st';
  if (p === 2) return '2nd';
  if (p === 3) return '3rd';
  return `${p}th`;
}

export function renderResults(container: HTMLElement, raceId: string): void {
  const user = getStoredUser();
  setRaceId(null); // Stop sending erg data

  container.innerHTML = `
    <div class="screen results-screen">
      <div id="results-content">
        <p class="placeholder">Loading results...</p>
      </div>
      <button class="btn-primary" id="back-to-feed" style="margin-top:16px">Back to Feed</button>
    </div>
  `;

  container.querySelector('#back-to-feed')!.addEventListener('click', () => navigate('feed'));

  const contentEl = container.querySelector('#results-content') as HTMLElement;
  let results: RaceResult[] = [];
  let raceCanceled = false;

  // Listen for late-arriving results
  const unsub = onWsMessage((msg: ServerMessage) => {
    if (msg.type === 'race_result' && msg.race_id === raceId) {
      results = [...msg.results];
      renderContent();
    }
  });

  async function loadResults() {
    try {
      const data = await getRace(raceId);

      if (data.race.state === 'canceled') {
        raceCanceled = true;
        renderContent();
        return;
      }

      // Build results from participant data
      const finishedParticipants = data.participants
        .filter((p: any) => p.placement !== null)
        .sort((a: any, b: any) => (a.placement ?? 999) - (b.placement ?? 999));

      results = finishedParticipants.map((p: any) => ({
        user_id: p.user_id,
        username: p.username,
        placement: p.placement ?? 0,
        final_time: p.final_time ?? 0,
        final_distance: p.final_distance ?? 0,
        final_avg_pace: p.final_avg_pace ?? 0,
        final_calories: p.final_calories ?? 0,
        final_stroke_count: p.final_stroke_count ?? 0,
      }));

      renderContent();
    } catch (err: any) {
      contentEl.innerHTML = `<p class="error">${err.message}</p>`;
    }
  }

  function renderContent() {
    if (raceCanceled) {
      contentEl.innerHTML = `
        <div class="results-header">
          <p class="results-placement" style="color:var(--red)">Canceled</p>
          <p class="results-label">This race was canceled</p>
        </div>
      `;
      return;
    }

    if (results.length === 0) {
      contentEl.innerHTML = '<p class="placeholder">No results yet...</p>';
      return;
    }

    const myResult = results.find(r => r.user_id === user?.id);
    const myPlacement = myResult?.placement ?? 0;

    contentEl.innerHTML = `
      <div class="results-header">
        ${myResult ? `
          <p class="results-placement ${placementClass(myPlacement)}">${placementLabel(myPlacement)}</p>
          <p class="results-label">
            ${formatTime(myResult.final_time)} &middot;
            ${Math.floor(myResult.final_distance)}m &middot;
            ${formatPace(myResult.final_avg_pace)} avg
          </p>
        ` : `
          <p class="results-label">Race Complete</p>
        `}
      </div>

      <div class="card">
        <h3 style="margin-bottom:8px">Final Standings</h3>
        ${results.map(r => `
          <div class="result-row ${r.user_id === user?.id ? 'self-row' : ''}">
            <span class="result-pos ${placementClass(r.placement)}">${placementLabel(r.placement)}</span>
            <span class="result-name">${r.username}</span>
            <span class="result-stat">${formatTime(r.final_time)} / ${formatPace(r.final_avg_pace)}</span>
          </div>
        `).join('')}
      </div>

      ${myResult ? `
        <div class="card" style="margin-top:12px">
          <h3 style="margin-bottom:8px">Your Stats</h3>
          <div class="metrics-grid">
            <div class="metric-box">
              <div class="metric-label">Time</div>
              <div class="metric-value">${formatTime(myResult.final_time)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Distance</div>
              <div class="metric-value">${Math.floor(myResult.final_distance)}m</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Avg Pace</div>
              <div class="metric-value">${formatPace(myResult.final_avg_pace)}</div>
            </div>
            <div class="metric-box">
              <div class="metric-label">Calories</div>
              <div class="metric-value">${myResult.final_calories}</div>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }

  loadResults();
  window.addEventListener('hashchange', () => unsub(), { once: true });
}
