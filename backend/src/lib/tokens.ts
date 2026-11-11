import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export type AccessPayload = { sub: string; role: 'SUPER_ADMIN' | 'USER' };

export const signAccessToken = (payload: AccessPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '15m', algorithm: 'HS256' });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessPayload & jwt.JwtPayload;

// Refresh token = chaîne aléatoire ; seule son empreinte (hash) est stockée en base
export const newRefreshToken = () => crypto.randomBytes(48).toString('hex');
export const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');