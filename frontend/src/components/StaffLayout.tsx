import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { authRequest, useAuth } from '../lib/auth';

// Les pages de gestion disponibles : une ligne s'ajoute à chaque nouvel écran
const PAGES = [
  { to: '/gestion', label: 'Accueil', end: true },
  { to: '/gestion/commandes', label: 'Commandes', end: false },
  { to: '/gestion/tables', label: 'Tables & QR', end: false },
  { to: '/gestion/menu', label: 'Menu', end: false },
  { to: '/gestion/stock', label: 'Stock', end: false },
  { to: '/gestion/personnel', label: 'Personnel', end: false },
];

// Les écrans du personnel déjà existants
const SCREENS = [
  { to: '/cuisine', label: 'Cuisine' },
  { to: '/caisse', label: 'Caisse' },
  { to: '/service', label: 'Service' },
];

export function StaffLayout({
  restaurantId,
  title,
  children,
}: {
  restaurantId: string;
  title: string;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authRequest<{ restaurant: { name: string } }>(`/restaurants/${restaurantId}/info`)
      .then((d) => {
        if (!cancelled) setName(d.restaurant.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const pill = ({ isActive }: { isActive: boolean }) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
      isActive ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
    }`;

  return (
    <div className="min-h-dvh pb-16">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-brand-600">
              {name ?? 'Restaurant'}
            </p>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {user && <span className="hidden text-sm text-stone-500 sm:inline">{user.fullName}</span>}
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/connexion', { replace: true });
              }}
              className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-600"
            >
              Déconnexion
            </button>
          </div>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3">
          {PAGES.map((p) => (
            <NavLink key={p.to} to={p.to} end={p.end} className={pill}>
              {p.label}
            </NavLink>
          ))}
          <span className="mx-1 w-px shrink-0 bg-stone-200" />
          {SCREENS.map((s) => (
            <NavLink key={s.to} to={s.to} className="shrink-0 rounded-full px-3 py-2 text-sm font-medium text-stone-500 hover:text-stone-900">
              {s.label} ↗
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 p-4">{children}</main>
    </div>
  );
}