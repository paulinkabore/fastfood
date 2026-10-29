import { createServer } from 'http';
import { app } from './app';
import { env } from './config/env';
import { initRealtime } from './lib/realtime';

// Express et Socket.IO partagent le même serveur et le même port
const httpServer = createServer(app);
initRealtime(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`API démarrée sur http://localhost:${env.PORT}`);
});

httpServer.on('error', (err) => {
  console.error('Erreur au démarrage du serveur :', err);
  process.exit(1);
});