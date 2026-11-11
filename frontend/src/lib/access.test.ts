import { describe, expect, it } from 'vitest';
import { canOpen, homeFor, landingFor } from './access';
import type { StaffUser } from './types';

const user = (role: string | null, globalRole = 'USER'): StaffUser =>
  ({
    globalRole,
    memberships: role ? [{ restaurantId: 'r1', role }] : [],
  }) as unknown as StaffUser;

describe('accès par rôle', () => {
  it('chaque rôle arrive sur son écran', () => {
    expect(homeFor(user('MANAGER'))).toBe('/gestion');
    expect(homeFor(user('CASHIER'))).toBe('/caisse');
    expect(homeFor(user('WAITER'))).toBe('/serveur');
    expect(homeFor(user('COOK'))).toBe('/cuisine');
    expect(homeFor(user(null, 'SUPER_ADMIN'))).toBe('/admin');
  });

  it('un caissier ou un cuisinier ne peut pas ouvrir la gestion', () => {
    expect(canOpen(user('CASHIER'), '/gestion/statistiques')).toBe(false);
    expect(canOpen(user('COOK'), '/gestion/menu')).toBe(false);
    expect(canOpen(user('MANAGER'), '/gestion/menu')).toBe(true);
  });

  it('après une déconnexion du gérant, le caissier arrive à la caisse et non sur la page du gérant', () => {
    expect(landingFor(user('CASHIER'), '/gestion/statistiques')).toBe('/caisse');
    expect(landingFor(user('COOK'), '/gestion/statistiques')).toBe('/cuisine');
    expect(landingFor(user('WAITER'), '/caisse')).toBe('/serveur');
  });

  it('garde l’écran demandé quand il est permis', () => {
    expect(landingFor(user('MANAGER'), '/gestion/stock')).toBe('/gestion/stock');
    expect(landingFor(user('CASHIER'), '/caisse')).toBe('/caisse');
  });
});
