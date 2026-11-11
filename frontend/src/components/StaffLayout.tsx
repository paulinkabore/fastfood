import { ChangePasswordButton } from './ChangePassword';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { authRequest, useAuth } from '../lib/auth';
import { BRAND_NAME, showRestaurantName } from '../lib/brand';
import { Logo } from './Logo';

type IconProps = { className?: string };

const icon = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
} as const;

const ChartIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);
const ReceiptIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6" />
  </svg>
);
const MenuBookIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 5-3 8h3v10V3z" />
  </svg>
);
const QrIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v.01M14 20h3M20 17v3" />
  </svg>
);
const BoxIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />
  </svg>
);
const UsersIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6" />
  </svg>
);
const TruckIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
  </svg>
);
const SpeakerIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M4 9v6h4l5 4V5L8 9H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
  </svg>
);
const FlameIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z" />
  </svg>
);
const WalletIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zM16 14.5h.01" />
  </svg>
);
const BellIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 21h4" />
  </svg>
);
const BurgerIcon = ({ className = 'h-6 w-6' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
const CloseIcon = ({ className = 'h-6 w-6' }: IconProps) => (
  <svg {...icon} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

type Item = { to: string; label: string; Icon: (p: IconProps) => ReactNode };

// Toutes les fonctionnalités du gérant, regroupées ici
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: 'Pilotage',
    items: [
      { to: '/gestion/statistiques', label: 'Statistiques', Icon: ChartIcon },
      { to: '/gestion/commandes', label: 'Commandes du jour', Icon: ReceiptIcon },
    ],
  },
  {
    label: 'Restaurant',
    items: [
      { to: '/gestion/menu', label: 'Menu et produits', Icon: MenuBookIcon },
      { to: '/gestion/tables', label: 'Tables & QR', Icon: QrIcon },
      { to: '/gestion/livraison', label: 'Livraison', Icon: TruckIcon },
      { to: '/gestion/stock', label: 'Stock', Icon: BoxIcon },
      { to: '/gestion/personnel', label: 'Personnel', Icon: UsersIcon },
    ],
  },
  {
    label: 'Consultation',
    items: [
      { to: '/cuisine', label: 'Cuisine', Icon: FlameIcon },
      { to: '/caisse', label: 'Caisse', Icon: WalletIcon },
      { to: '/serveur', label: 'Serveur', Icon: BellIcon },
      { to: '/annonces', label: 'Annonces vocales', Icon: SpeakerIcon },
    ],
  },
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
  const location = useLocation();
  const [name, setName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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

  // Le menu se referme après chaque navigation
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Échap referme le menu ; le fond ne défile pas pendant qu'il est ouvert
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition lg:py-2.5 ${
      isActive
        ? 'bg-brand-50 text-brand-600 shadow-sm ring-1 ring-brand-100'
        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
    }`;

  const restaurant = name ?? 'Restaurant';

  return (
    <div className="min-h-dvh lg:pl-64">
      {open && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-stone-900/40 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        id="menu-gestion"
        aria-label="Menu de gestion"
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-stone-200/70 bg-white transition-[transform,visibility] duration-200 lg:w-64 lg:visible lg:translate-x-0 ${
          open ? 'visible translate-x-0 shadow-2xl' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="h-11 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                {showRestaurantName(restaurant) ? restaurant : BRAND_NAME}
              </p>
              <p className="text-xs text-stone-500">Espace gérant</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            className="grid h-10 w-10 place-items-center rounded-full text-stone-500 hover:bg-stone-100 lg:hidden"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {GROUPS.map((g) => (
            <div key={g.label}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest text-stone-400">
                {g.label}
              </p>
              <div className="space-y-1">
                {g.items.map(({ to, label, Icon }) => (
                  <NavLink key={to} to={to} className={link}>
                    <Icon className="h-5 w-5 shrink-0" />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-stone-100 p-3">
          {user && (
            <p className="mb-2 truncate px-3 text-sm text-stone-500">{user.fullName}</p>
          )}
          <ChangePasswordButton className="mb-2 w-full rounded-xl px-3 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-100 lg:py-2.5" />
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/connexion', { replace: true });
            }}
            className="w-full rounded-xl bg-stone-100 px-3 py-3 text-sm font-medium text-stone-700 transition hover:bg-stone-200 lg:py-2.5"
          >
            Déconnexion
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={open}
            aria-controls="menu-gestion"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-700 transition active:scale-95 lg:hidden"
          >
            <BurgerIcon />
          </button>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-widest text-brand-600">
              {restaurant}
            </p>
            <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 pb-16">{children}</main>
    </div>
  );
}
