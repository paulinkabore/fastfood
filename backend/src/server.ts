import { app } from './app';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log(`API démarrée sur http://localhost:${env.PORT}`);
});

// Affiche clairement les erreurs de démarrage (port déjà utilisé, etc.)
server.on('error', (err) => {
  console.error('Erreur au démarrage du serveur :', err);
  process.exit(1);
});