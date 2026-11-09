// Temps réel (Socket.IO) : désactivé sur Vercel, qui ne peut pas héberger notre serveur WebSocket.
// Les écrans se rafraîchissent alors toutes les 5 secondes au lieu de recevoir les commandes en direct.
export const REALTIME = import.meta.env.VITE_REALTIME !== 'false';
export const POLL_MS = REALTIME ? 60_000 : 5_000;
