import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

interface SocketAuth {
  token?: string;
  roomSlug?: string;
}

export function createSocket(auth: SocketAuth): Socket {
  // 每次建立新連線前先斷開舊的
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(window.location.origin, {
    auth,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
