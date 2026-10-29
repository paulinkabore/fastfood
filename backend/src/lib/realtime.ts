import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from './prisma';
import { verifyAccessToken } from './tokens';
import { orderInclude, presentOrder } from './orderView';

let io: Server | null = null;

const restaurantRoom = (id: string) => `restaurant:${id}`;
const orderRoom = (id: string) => `order:${id}`;

const joinSchema = z.object({ restaurantId: z.string().uuid() });
const subscribeSchema = z.object({ orderId: z.string().uuid() });

type Reply = { ok: boolean; error?: string };
const reply = (ack: unknown, response: Reply) => {
  if (typeof ack === 'function') (ack as (r: Reply) => void)(response);
};

export function initRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

  // Identification : sans jeton = client anonyme ; jeton invalide = refus
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next();
    try {
      const payload = verifyAccessToken(String(token));
      socket.data.userId = payload.sub;
      socket.data.expiresAt = (payload.exp ?? 0) * 1000;
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    // La connexion du personnel est coupée à l'expiration de son jeton
    let timer: NodeJS.Timeout | undefined;
    if (socket.data.expiresAt) {
      const delay = Math.max(socket.data.expiresAt - Date.now(), 0);
      timer = setTimeout(() => socket.disconnect(true), delay);
    }
    socket.on('disconnect', () => {
      if (timer) clearTimeout(timer);
    });

    // Personnel : rejoindre la salle de son restaurant
    socket.on('staff:join', async (raw, ack) => {
      try {
        if (!socket.data.userId) return reply(ack, { ok: false, error: 'UNAUTHENTICATED' });
        const { restaurantId } = joinSchema.parse(raw);
        const membership = await prisma.restaurantMembership.findUnique({
          where: { userId_restaurantId: { userId: socket.data.userId, restaurantId } },
          include: { restaurant: { select: { isActive: true } } },
        });
        if (!membership || !membership.isActive || !membership.restaurant.isActive) {
          return reply(ack, { ok: false, error: 'FORBIDDEN' });
        }
        await socket.join(restaurantRoom(restaurantId));
        reply(ack, { ok: true });
      } catch {
        reply(ack, { ok: false, error: 'INVALID_REQUEST' });
      }
    });

    // Client : suivre sa commande
    socket.on('order:subscribe', async (raw, ack) => {
      try {
        const { orderId } = subscribeSchema.parse(raw);
        if (socket.rooms.size > 10) return reply(ack, { ok: false, error: 'TOO_MANY' });
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { id: true },
        });
        if (!order) return reply(ack, { ok: false, error: 'NOT_FOUND' });
        await socket.join(orderRoom(orderId));
        reply(ack, { ok: true });
      } catch {
        reply(ack, { ok: false, error: 'INVALID_REQUEST' });
      }
    });
  });
}

// Les envois sont lancés APRÈS l'enregistrement en base, et ne bloquent jamais une route
export async function emitOrderCreated(orderId: string) {
  if (!io) return;
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) return;
    io.to(restaurantRoom(order.restaurantId)).emit('order:created', {
      order: presentOrder(order),
    });
  } catch (err) {
    console.error('Temps réel (création) :', err);
  }
}

export async function emitOrderUpdated(orderId: string) {
  if (!io) return;
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) return;
    io.to(restaurantRoom(order.restaurantId))
      .to(orderRoom(order.id))
      .emit('order:updated', { order: presentOrder(order) });
  } catch (err) {
    console.error('Temps réel (mise à jour) :', err);
  }
}