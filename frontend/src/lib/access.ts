import type { StaffUser } from './types';

// Écran d'accueil de chacun : gérant, caissier, serveur, cuisinier
export const homeFor = (u: StaffUser) => {
  if (u.globalRole === 'SUPER_ADMIN') return '/admin';
  const roles = u.memberships.map((m) => m.role);
  if (roles.includes('MANAGER')) return '/gestion';
  if (roles.includes('CASHIER')) return '/caisse';
  if (roles.includes('WAITER')) return '/serveur';
  return '/cuisine';
};

type Who = Pick<StaffUser, 'globalRole' | 'memberships'>;

// Cet utilisateur a-t-il le droit d'ouvrir cette adresse ? (même règle que les écrans)
export function canOpen(u: Who, path: string): boolean {
  if (u.globalRole === 'SUPER_ADMIN') return path.startsWith('/admin');
  const roles = u.memberships.map((m) => m.role);
  const any = (...allowed: string[]) => roles.some((r) => allowed.includes(r));
  if (path.startsWith('/gestion')) return any('MANAGER');
  if (path.startsWith('/caisse')) return any('MANAGER', 'CASHIER');
  if (path.startsWith('/cuisine')) return any('MANAGER', 'COOK');
  if (path.startsWith('/serveur') || path.startsWith('/service')) return any('MANAGER', 'WAITER');
  if (path.startsWith('/annonces')) return roles.length > 0;
  if (path.startsWith('/admin')) return false;
  return true;
}

// Après connexion : l'écran demandé avant la connexion, seulement s'il est permis, sinon l'accueil du rôle
export const landingFor = (u: StaffUser, from?: string) =>
  from && canOpen(u, from) ? from : homeFor(u);
