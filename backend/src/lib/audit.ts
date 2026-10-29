import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export const audit = (entry: {
  userId: string;
  restaurantId?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
}) => prisma.auditLog.create({ data: entry });