import fs from 'fs';
import path from 'path';
import express, { type Express } from 'express';
import type helmet from 'helmet';
import { env } from '../config/env';

// Les images des QR codes sont des « blob: » et le temps réel utilise un WebSocket :
// la politique de sécurité des pages doit les autoriser explicitement
const wsOrigin = env.PUBLIC_APP_URL.replace(/^http/, 'ws').replace(/\/$/, '');

export const helmetOptions: Parameters<typeof helmet>[0] = {
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'img-src': ["'self'", 'data:', 'blob:'],
      'connect-src': ["'self'", wsOrigin],
    },
  },
};

export function setupProduction(app: Express) {
  // Réglages publics lus par les écrans avant de proposer le Mobile Money
  app.get('/api/v1/public/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ mobileMoney: env.PAYMENT_PROVIDER !== 'none' });
  });

  if (!env.SERVE_FRONTEND) return;

  const dist = path.resolve(process.cwd(), env.FRONTEND_DIST);
  const index = path.join(dist, 'index.html');
  if (!fs.existsSync(index)) {
    console.error(`SERVE_FRONTEND=true mais ${index} est introuvable : construisez d'abord le frontend.`);
    process.exit(1);
  }

  // Fichiers construits : ceux du dossier assets ont un nom unique, ils se gardent un an
  app.use(
    express.static(dist, {
      index: false,
      setHeaders: (res, file) => {
        if (file.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // Toute autre adresse d'écran (/gestion/menu, /q/..., etc.) renvoie l'application
  app.use((req, res, next) => {
    if (req.method !== 'GET' || /^\/(api|uploads|socket\.io)(\/|$)/.test(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}