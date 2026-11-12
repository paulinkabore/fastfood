import type { Request, Response } from 'express';
import { prisma } from './prisma';

// Journal de sécurité : tentatives de connexion échouées, comptes bloqués, requêtes bloquées…
// Stocké dans l'historique existant (entity = 'Security'), consultable par le super admin.

// Évite de remplir la base pendant une attaque : un même événement d'une même adresse n'est noté qu'une fois par 30 s
const recent = new Map<string, number>();
const THROTTLE_MS = 30_000;

export function securityEvent(
  req: Request,
  action: 'LOGIN_FAILED' | 'LOGIN_BLOCKED' | 'RATE_LIMITED' | 'ACCESS_DENIED' | 'ROUTE_PROBE',
  details: Record<string, string | number | null> = {},
) {
  const ip = req.ip ?? 'inconnue';
  const key = `${action}|${ip}|${details.email ?? details.path ?? ''}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - THROTTLE_MS) return;
  recent.set(key, now);
  if (recent.size > 2000) {
    for (const [k, t] of recent) if (t < now - THROTTLE_MS) recent.delete(k);
  }
  void prisma.auditLog
    .create({
      data: {
        action,
        entity: 'Security',
        details: { ip, path: req.originalUrl.split('?')[0].slice(0, 120), ...details },
      },
    })
    .catch(() => undefined);
}

// À utiliser dans express-rate-limit : note l'événement puis répond comme avant
export const rateLimitHandler = (code: string, message: string) => (req: Request, res: Response) => {
  securityEvent(req, 'RATE_LIMITED');
  res.status(429).json({ error: { code, message } });
};
