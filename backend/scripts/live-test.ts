import { io } from 'socket.io-client';

// Usage : npx tsx scripts/live-test.ts <jeton_de_connexion> <id_du_restaurant>
const [, , accessToken, restaurantId] = process.argv;

const socket = io('http://localhost:4000', { auth: { token: accessToken } });

socket.on('connect', () => {
  console.log('Connecté au temps réel');
  socket.emit('staff:join', { restaurantId }, (res: unknown) => {
    console.log('Salle du restaurant :', res);
  });
});

socket.on('connect_error', (err) => {
  console.error('Connexion refusée :', err.message);
  process.exit(1);
});

socket.on('order:created', ({ order }) => {
  console.log(`NOUVELLE commande #${order.number} (${order.totalFcfa} FCFA)`);
});

socket.on('order:updated', ({ order }) => {
  console.log(`Commande #${order.number} -> ${order.status}`);
});