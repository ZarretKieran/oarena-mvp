const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('oarena_token');
}

export function setToken(token: string): void {
  localStorage.setItem('oarena_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('oarena_token');
}

export function getStoredUser(): { id: string; username: string } | null {
  const raw = localStorage.getItem('oarena_user');
  return raw ? JSON.parse(raw) : null;
}

export function setStoredUser(user: { id: string; username: string }): void {
  localStorage.setItem('oarena_user', JSON.stringify(user));
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

// Auth
export async function register(username: string, password: string) {
  const data = await request<{ token: string; user: { id: string; username: string } }>(
    '/auth/register',
    { method: 'POST', body: JSON.stringify({ username, password }) }
  );
  setToken(data.token);
  setStoredUser(data.user);
  return data.user;
}

export async function login(username: string, password: string) {
  const data = await request<{ token: string; user: { id: string; username: string } }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ username, password }) }
  );
  setToken(data.token);
  setStoredUser(data.user);
  return data.user;
}

// Races
export async function listRaces() {
  return request<{ races: any[] }>('/races');
}

export async function createRace(params: {
  race_type: string;
  format: string;
  target_value: number;
  split_value?: number;
  warmup_start_time: number;
  max_participants?: number;
}) {
  return request<{ race: any }>('/races', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function joinRace(raceId: string) {
  return request<{ participants: any[] }>(`/races/${raceId}/join`, { method: 'POST' });
}

export async function getRace(raceId: string) {
  return request<{ race: any; participants: any[] }>(`/races/${raceId}`);
}

// History
export async function getHistory() {
  return request<{ races: any[] }>('/history');
}
