import { describe, expect, it } from 'vitest';
import { minPasswordFor } from './passwordPolicy';
import type { StaffUser } from './types';

const user = (role: string | null, globalRole = 'USER') =>
  ({ globalRole, memberships: role ? [{ role }] : [] }) as unknown as StaffUser;

describe('longueur minimale du mot de passe', () => {
  it('10 pour le gérant et le super admin', () => {
    expect(minPasswordFor(user('MANAGER'))).toBe(10);
    expect(minPasswordFor(user(null, 'SUPER_ADMIN'))).toBe(10);
  });

  it('6 pour le reste du personnel', () => {
    expect(minPasswordFor(user('CASHIER'))).toBe(6);
    expect(minPasswordFor(user('COOK'))).toBe(6);
    expect(minPasswordFor(user('WAITER'))).toBe(6);
  });
});
