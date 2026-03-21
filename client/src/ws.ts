import type { ServerMessage, ClientMessage } from '../../shared/types';

type MessageHandler = (msg: ServerMessage) => void;

let socket: WebSocket | null = null;
let handlers: MessageHandler[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let token: string | null = null;

export function connectWs(authToken: string): void {
  token = authToken;
  doConnect();
}

function doConnect(): void {
  if (!token) return;

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`;

  socket = new WebSocket(url);

  socket.onopen = () => {
    console.log('[ws] connected');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  socket.onmessage = (ev) => {
    try {
      const msg: ServerMessage = JSON.parse(ev.data);
      for (const h of handlers) h(msg);
    } catch (e) {
      console.error('[ws] bad message', e);
    }
  };

  socket.onclose = () => {
    console.log('[ws] disconnected, reconnecting in 2s...');
    socket = null;
    reconnectTimer = setTimeout(doConnect, 2000);
  };

  socket.onerror = (e) => {
    console.error('[ws] error', e);
  };
}

export function disconnectWs(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  token = null;
  if (socket) {
    socket.close();
    socket = null;
  }
}

export function sendWs(msg: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export function onWsMessage(handler: MessageHandler): () => void {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter((h) => h !== handler);
  };
}

export function isWsConnected(): boolean {
  return socket?.readyState === WebSocket.OPEN;
}
