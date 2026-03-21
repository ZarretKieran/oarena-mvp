import type { ServerWebSocket } from 'bun';

export interface WsData {
  userId: string;
  username: string;
  raceId: string | null;
}

// Map of race_id → set of connected sockets
const rooms = new Map<string, Set<ServerWebSocket<WsData>>>();

export function joinRoom(raceId: string, ws: ServerWebSocket<WsData>): void {
  let room = rooms.get(raceId);
  if (!room) {
    room = new Set();
    rooms.set(raceId, room);
  }
  room.add(ws);
  ws.data.raceId = raceId;
}

export function leaveRoom(ws: ServerWebSocket<WsData>): void {
  const raceId = ws.data.raceId;
  if (!raceId) return;
  const room = rooms.get(raceId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) rooms.delete(raceId);
  }
  ws.data.raceId = null;
}

export function broadcastToRoom(raceId: string, message: string, exclude?: ServerWebSocket<WsData>): void {
  const room = rooms.get(raceId);
  if (!room) return;
  for (const ws of room) {
    if (ws !== exclude) {
      ws.send(message);
    }
  }
}

export function sendToRoom(raceId: string, message: string): void {
  broadcastToRoom(raceId, message);
}

export function getRoomSockets(raceId: string): Set<ServerWebSocket<WsData>> {
  return rooms.get(raceId) ?? new Set();
}

export function sendToUser(raceId: string, userId: string, message: string): void {
  const room = rooms.get(raceId);
  if (!room) return;
  for (const ws of room) {
    if (ws.data.userId === userId) {
      ws.send(message);
      return;
    }
  }
}
