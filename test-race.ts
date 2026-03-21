// End-to-end test: simulates two users through full race lifecycle via WS
const BASE = 'http://localhost:3001';

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers as any },
  });
  return res.json();
}

function connectWs(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:3001/ws?token=${token}`);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}

// Collects all messages; waitFor scans history + future
function createMsgCollector(ws: WebSocket) {
  const msgs: any[] = [];
  const waiters: Array<{ type: string; resolve: (m: any) => void; reject: (e: Error) => void }> = [];

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data as string);
    msgs.push(msg);
    // Check waiters
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (msg.type === waiters[i].type) {
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });

  return {
    waitFor(type: string, timeoutMs = 120000): Promise<any> {
      // Check history first
      const existing = msgs.find(m => m.type === type);
      if (existing) {
        msgs.splice(msgs.indexOf(existing), 1);
        return Promise.resolve(existing);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
        waiters.push({
          type,
          resolve: (m) => { clearTimeout(timer); resolve(m); },
          reject,
        });
      });
    },
    // Wait for a message with a specific state
    waitForState(state: string, timeoutMs = 330000): Promise<any> {
      const existing = msgs.find(m => m.type === 'race_state' && m.state === state);
      if (existing) {
        msgs.splice(msgs.indexOf(existing), 1);
        return Promise.resolve(existing);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for state=${state}`)), timeoutMs);
        const handler = (ev: MessageEvent) => {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === 'race_state' && msg.state === state) {
            clearTimeout(timer);
            ws.removeEventListener('message', handler);
            resolve(msg);
          }
        };
        ws.addEventListener('message', handler);
      });
    },
    all: msgs,
  };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== 1. Registering users ===');
  const r1 = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: 'test_alice', password: 'test123' }) });
  const r2 = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: 'test_bob', password: 'test123' }) });
  const t1 = r1.token, t2 = r2.token;
  console.log('  OK');

  console.log('=== 2. Creating race (100m, warmup in 7s) ===');
  const soon = Date.now() + 7000;
  const cr = await api('/api/races', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t1}` } as any,
    body: JSON.stringify({ race_type: 'duel', format: 'distance', target_value: 100, warmup_start_time: soon }),
  });
  const raceId = cr.race.id;
  console.log(`  Race: ${raceId}`);

  console.log('=== 3. Bob joins ===');
  await api(`/api/races/${raceId}/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t2}` } as any,
  });
  console.log('  OK');

  console.log('=== 4. WebSocket connect ===');
  const ws1 = await connectWs(t1);
  const ws2 = await connectWs(t2);
  const c1 = createMsgCollector(ws1);
  const c2 = createMsgCollector(ws2);

  ws1.send(JSON.stringify({ type: 'join_room', race_id: raceId }));
  ws2.send(JSON.stringify({ type: 'join_room', race_id: raceId }));
  await sleep(500);
  console.log('  OK');

  console.log('=== 5. Waiting for WARMUP ===');
  const warmupMsg = await c1.waitForState('warmup');
  console.log(`  State: ${warmupMsg.state}, participants: ${warmupMsg.participants.length}`);

  console.log('=== 6. Both confirm warmup ===');
  ws1.send(JSON.stringify({ type: 'warmup_confirm', race_id: raceId }));
  await sleep(300);
  ws2.send(JSON.stringify({ type: 'warmup_confirm', race_id: raceId }));
  await sleep(500);

  // Verify via API
  const detail = await api(`/api/races/${raceId}`, { headers: { Authorization: `Bearer ${t1}` } as any });
  const statuses = detail.participants.map((p: any) => `${p.username}:${p.status}`);
  console.log(`  Participants: ${statuses.join(', ')}`);

  console.log('=== 7. Both click ready ===');
  ws1.send(JSON.stringify({ type: 'ready', race_id: raceId }));
  await sleep(200);
  ws2.send(JSON.stringify({ type: 'ready', race_id: raceId }));

  console.log('  Waiting for countdown (min 5 min warmup)...');
  const countdownMsg = await c1.waitForState('countdown', 330000);
  console.log(`  State: ${countdownMsg.state}, countdown: ${countdownMsg.countdown}`);

  console.log('=== 8. Waiting for PM5 program (T-15s) ===');
  const programMsg = await c1.waitFor('program_workout', 60000);
  console.log(`  Config: ${programMsg.config.format} ${programMsg.config.target_value}m split=${programMsg.config.split_value}m`);

  console.log('=== 9. Waiting for RACING ===');
  const racingMsg = await c1.waitForState('racing', 60000);
  console.log(`  State: ${racingMsg.state}`);

  console.log('=== 10. Simulating race data ===');
  for (let d = 10; d <= 100; d += 10) {
    ws1.send(JSON.stringify({
      type: 'race_data', race_id: raceId,
      data: { elapsed_time: d * 2, distance: d, current_pace: 120, average_pace: 120, stroke_rate: 28, heart_rate: 160, watts: 200, calories: d, stroke_count: d, workout_state: 1 },
    }));
    ws2.send(JSON.stringify({
      type: 'race_data', race_id: raceId,
      data: { elapsed_time: d * 2.5, distance: d * 0.8, current_pace: 140, average_pace: 140, stroke_rate: 26, heart_rate: 155, watts: 170, calories: d, stroke_count: d, workout_state: 1 },
    }));
    await sleep(100);
  }
  console.log('  Alice crossed 100m (should finish)');

  // Wait for standings
  const standingsMsg = await c2.waitFor('standings', 5000);
  console.log(`  Standings: ${standingsMsg.standings.map((s: any) => `${s.username}:${Math.round(s.distance)}m(#${s.position})`).join(', ')}`);

  console.log('=== 11. Bob finishes ===');
  ws2.send(JSON.stringify({
    type: 'race_data', race_id: raceId,
    data: { elapsed_time: 300, distance: 100, current_pace: 140, average_pace: 140, stroke_rate: 26, heart_rate: 155, watts: 170, calories: 100, stroke_count: 100, workout_state: 1 },
  }));
  await sleep(1000);

  console.log('=== 12. Waiting for race_result ===');
  const resultMsg = await c1.waitFor('race_result', 5000);
  console.log('  Results:');
  for (const r of resultMsg.results) {
    console.log(`    ${r.placement}. ${r.username} — ${r.final_time}s, ${r.final_distance}m`);
  }

  console.log('=== 13. Checking history ===');
  const hist = await api('/api/history', { headers: { Authorization: `Bearer ${t1}` } as any });
  console.log(`  History: ${hist.races.length} race(s), placement=${hist.races[0]?.placement}`);

  ws1.close();
  ws2.close();
  console.log('\n=== ALL TESTS PASSED ===');
  process.exit(0);
}

main().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
