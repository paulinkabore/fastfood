import QRCode from 'qrcode';
import crypto from 'crypto';
import { env } from '../config/env';

// 24 octets aléatoires = 32 caractères impossibles à deviner
export const newQrToken = () => crypto.randomBytes(24).toString('base64url');

export const qrUrl = (token: string) =>
  `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/q/${token}`;

export const qrPng = (token: string, width = 600) =>
  QRCode.toBuffer(qrUrl(token), {
    type: 'png',
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
  });