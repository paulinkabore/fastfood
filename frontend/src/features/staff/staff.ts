export type StaffRole = 'CASHIER' | 'COOK' | 'WAITER';
export type AnyRole = 'MANAGER' | StaffRole;

export type StaffMember = {
  userId: string;
  email: string;
  fullName: string;
  role: AnyRole;
  isActive: boolean;
};

export const ASSIGNABLE: StaffRole[] = ['CASHIER', 'COOK', 'WAITER'];

export const ROLE_INFO: Record<AnyRole, { label: string; screen: string; text: string; style: string }> = {
  MANAGER: {
    label: 'Gérant',
    screen: 'Gestion',
    text: 'Gère le restaurant. Compte géré par l’administration.',
    style: 'bg-violet-50 text-violet-700',
  },
  CASHIER: {
    label: 'Caissier',
    screen: 'Caisse',
    text: 'Encaisse, saisit des commandes au comptoir, clôture sa caisse.',
    style: 'bg-sky-50 text-sky-700',
  },
  COOK: {
    label: 'Cuisinier',
    screen: 'Cuisine',
    text: 'Voit les commandes et les fait avancer jusqu’à « prête ».',
    style: 'bg-amber-50 text-amber-700',
  },
  WAITER: {
    label: 'Serveur',
    screen: 'Service',
    text: 'Voit les commandes par table et les marque servies.',
    style: 'bg-emerald-50 text-emerald-700',
  },
};