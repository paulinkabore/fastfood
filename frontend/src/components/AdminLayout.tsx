import { ChangePasswordButton } from './ChangePassword';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function AdminLayout({ title, children }: { title: string; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh pb-16">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-brand-600">Administration</p>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {user && <span className="hidden text-sm text-stone-500 sm:inline">{user.fullName}</span>}
            <ChangePasswordButton className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-600" />
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
      </header>
      <main className="mx-auto max-w-5xl space-y-6 p-4">{children}</main>
    </div>
  );
}