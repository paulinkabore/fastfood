import { useState } from 'react';
import { ApiError } from '../lib/api';
import { authRequest, setAccessToken, useAuth } from '../lib/auth';
import { minPasswordFor } from '../lib/passwordPolicy';
import { Sheet } from './Sheet';
import { CloseIcon } from './icons';

const field =
  'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

function ChangePasswordSheet({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const min = minPasswordFor(user);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async () => {
    if (busy) return;
    if (next.length < min) return setError(`Le nouveau mot de passe doit faire ${min} caractères au moins`);
    if (next !== again) return setError('Les deux nouveaux mots de passe ne sont pas identiques');
    setBusy(true);
    setError(null);
    try {
      const r = await authRequest<{ accessToken: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setAccessToken(r.accessToken);
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet label="Changer mon mot de passe" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Changer mon mot de passe</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-600"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
        {done ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
            Mot de passe modifié. Vos autres appareils devront se reconnecter.
          </p>
        ) : (
          <>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Mot de passe actuel"
              aria-label="Mot de passe actuel"
              autoComplete="current-password"
              className={field}
            />
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder={`Nouveau mot de passe (${min} caractères minimum)`}
              aria-label="Nouveau mot de passe"
              autoComplete="new-password"
              maxLength={72}
              className={field}
            />
            <input
              type="password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              placeholder="Répétez le nouveau mot de passe"
              aria-label="Répétez le nouveau mot de passe"
              autoComplete="new-password"
              maxLength={72}
              className={field}
            />
            {error && (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
            )}
          </>
        )}
      </div>
      <div className="border-t border-stone-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={done ? onClose : () => void save()}
          disabled={busy}
          className="w-full rounded-2xl bg-brand-500 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-500/30 transition active:scale-[0.98] disabled:opacity-60"
        >
          {done ? 'Fermer' : busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Sheet>
  );
}

// Bouton + fenêtre : à placer à côté de « Déconnexion »
export function ChangePasswordButton({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Mot de passe
      </button>
      {open && <ChangePasswordSheet onClose={() => setOpen(false)} />}
    </>
  );
}
