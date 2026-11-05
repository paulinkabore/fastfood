import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user, ready, logout } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="animate-pulse text-stone-400">Chargement…</p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  }

  if (user.globalRole !== 'SUPER_ADMIN') {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-xs">
          <h1 className="text-xl font-semibold tracking-tight">Accès refusé</h1>
          <p className="mt-2 text-sm text-stone-500">
            Cet écran est réservé au super-administrateur.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-5 rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Changer de compte
          </button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}