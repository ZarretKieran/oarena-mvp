import type { ServerWebSocket } from 'bun';
import { verifyJwt } from '../auth';
import { joinRoom, leaveRoom } from './rooms';
import type { WsData } from './rooms';
import type { ClientMessage, Participant } from '../../shared/types';
import { handleRaceMessage, getActiveRace } from '../race/state-machine';

export function createWsHandler() {
  return {
    async open(ws: ServerWebSocket<WsData>) {
      console.log(`[ws] ${ws.data.username} connected`);
    },

    async message(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
      try {
        const msg: ClientMessage = JSON.parse(
          typeof raw === 'string' ? raw : raw.toString()
        );

        if (msg.type === 'join_room') {
          leaveRoom(ws);
          joinRoom(msg.race_id, ws);
          console.log(`[ws] ${ws.data.username} joined room ${msg.race_id}`);

          // Send current race state if the race is active
          const race = getActiveRace(msg.race_id);
          if (race) {
            const participants: Participant[] = [];
            for (const p of race.participants.values()) {
              participants.push({
                user_id: p.userId,
                username: p.username,
                status: p.status,
              });
            }
            ws.send(JSON.stringify({
              type: 'race_state',
              race_id: race.id,
              state: race.state,
              participants,
            }));
          }
          return;
        }

        if (!ws.data.raceId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not in a race room' }));
          return;
        }

        handleRaceMessage(ws, msg);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      }
    },

    close(ws: ServerWebSocket<WsData>) {
      console.log(`[ws] ${ws.data.username} disconnected`);
      leaveRoom(ws);
    },
  };
}

export async function authenticateWsUpgrade(
  req: Request
): Promise<WsData | null> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return null;

  const payload = await verifyJwt(token);
  if (!payload) return null;

  return {
    userId: payload.sub,
    username: payload.username,
    raceId: null,
  };
}
