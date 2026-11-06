import { app } from '../backend/src/app';

// Vercel appelle cette fonction pour toutes les routes /api/*.
// Express conserve les routes existantes sous /api/v1.
export default app;
