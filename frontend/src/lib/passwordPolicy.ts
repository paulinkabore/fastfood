import type { StaffUser } from './types';

// 10 caractères pour le gérant et l'administration, 6 pour le reste du personnel
export const MIN_PASSWORD_MANAGER = 10;
export const MIN_PASSWORD_STAFF = 6;

export const minPasswordFor = (u: Pick<StaffUser, 'globalRole' | 'memberships'> | null) =>
  u && (u.globalRole === 'SUPER_ADMIN' || u.memberships.some((m) => m.role === 'MANAGER'))
    ? MIN_PASSWORD_MANAGER
    : MIN_PASSWORD_STAFF;
