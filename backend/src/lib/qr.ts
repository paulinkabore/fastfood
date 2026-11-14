import QRCode from 'qrcode';
import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { Request, RequestHandler } from 'express';
import { env } from '../config/env';

// 24 octets aléatoires = 32 caractères impossibles à deviner
export const newQrToken = () => crypto.randomBytes(24).toString('base64url');

// Les liens des QR codes utilisent l'adresse par laquelle le gérant est en train d'utiliser le site :
// ils suivent donc automatiquement un changement d'adresse (nom de domaine).
const baseStore = new AsyncLocalStorage<string>();

const requestBase = (req: Request): string | undefined => {
  const host = req.get('host');
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return undefined;
  return `${req.protocol}://${host}`;
};

export const withRequestBase: RequestHandler = (req, _res, next) => {
  const base = requestBase(req);
  if (base) baseStore.run(base, next);
  else next();
};

export const qrUrl = (token: string) =>
  `${(baseStore.getStore() ?? env.PUBLIC_APP_URL).replace(/\/$/, '')}/q/${token}`;

export const qrPng = (token: string, width = 600) =>
  QRCode.toBuffer(qrUrl(token), {
    type: 'png',
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
  });