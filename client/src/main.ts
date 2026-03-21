import { isLoggedIn } from './api';
import { connectWs } from './ws';
import { navigate } from './router';
import { renderAuth } from './screens/auth';
import { renderFeed } from './screens/feed';
import { renderLobby } from './screens/lobby';
import { renderRace } from './screens/race';
import { renderResults } from './screens/results';
import { renderHistory } from './screens/history';

export { navigate } from './router';

const app = document.getElementById('app')!;

type Route =
  | { screen: 'auth' }
  | { screen: 'feed' }
  | { screen: 'lobby'; raceId: string }
  | { screen: 'race'; raceId: string }
  | { screen: 'results'; raceId: string }
  | { screen: 'history' };

function parseHash(): Route {
  const hash = location.hash.slice(1) || '';
  const parts = hash.split('/');

  switch (parts[0]) {
    case 'feed':
      return { screen: 'feed' };
    case 'lobby':
      return { screen: 'lobby', raceId: parts[1] || '' };
    case 'race':
      return { screen: 'race', raceId: parts[1] || '' };
    case 'results':
      return { screen: 'results', raceId: parts[1] || '' };
    case 'history':
      return { screen: 'history' };
    default:
      return isLoggedIn() ? { screen: 'feed' } : { screen: 'auth' };
  }
}

function render(): void {
  const route = parseHash();

  // Auth guard
  if (route.screen !== 'auth' && !isLoggedIn()) {
    navigate('');
    return;
  }

  switch (route.screen) {
    case 'auth':
      renderAuth(app, () => {
        const token = localStorage.getItem('oarena_token')!;
        connectWs(token);
        navigate('feed');
      });
      break;
    case 'feed':
      renderFeed(app);
      break;
    case 'lobby':
      renderLobby(app, route.raceId);
      break;
    case 'race':
      renderRace(app, route.raceId);
      break;
    case 'results':
      renderResults(app, route.raceId);
      break;
    case 'history':
      renderHistory(app);
      break;
  }
}

// Connect WS if already logged in
if (isLoggedIn()) {
  const token = localStorage.getItem('oarena_token')!;
  connectWs(token);
}

// Router
window.addEventListener('hashchange', render);
render();
