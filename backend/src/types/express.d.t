import type { MemberRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; globalRole: 'SUPER_ADMIN' | 'USER' };
      membership?: { restaurantId: string; role: MemberRole };
    }
  }
}

export {};