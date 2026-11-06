import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

// Une seule connexion partagée par toute l'application
export function getSocket(): Socket {
  if (!socket) socket = io({ path: '/api/socket.io', transports: ['websocket', 'polling'] });
  return socket;
}