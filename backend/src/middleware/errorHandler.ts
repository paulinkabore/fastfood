import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Données invalides',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Cette valeur existe déjà' } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Élément introuvable' } });
      return;
    }
  }
  console.error(err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
  });
};