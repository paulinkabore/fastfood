import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { generatePassword } from '../../features/admin/admin';
import { ASSIGNABLE, ROLE_INFO, type StaffRole } from '../../features/staff/staff';
import { Sheet } from '../Sheet';
import { CheckIcon, CloseIcon } from '../icons';

const field =
  'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

export function StaffSheet({
  restaurantId,
  onClose,
  onCreated,
}: {
  restaurantId: string;
  onClose: () => void;
  onCreated: (name: string, role: StaffRole) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('CASHIER');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (busy) return;
    const mail = email.trim().toLowerCase();
    if (fullName.trim().length < 2) return setError('Le nom doit contenir au moins 2 caractères');
    if (!/^\S+@\S+\.\S+$/.test(mail)) return setError('Adresse email invalide');
    if (password.length < 10 || password.length > 72) {
      return setError('Le mot de passe doit contenir entre 10 et 72 caractères');
    }

    setBusy(true);
    setError(null);
    try {
      await authRequest(`/restaurants/${restaurantId}/staff`, {
        method: 'POST',
        body: JSON.stringify({ email: mail, fullName: fullName.trim(), role, password }),
      });
      // Succès : la boîte se ferme et la page affiche la notification
      onCreated(fullName.trim(), role);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet label="Nouvel employé" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Nouvel employé</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-600"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-stone-700">Rôle</p>
          <div className="space-y-2">
            {ASSIGNABLE.map((r) => {
              const info = ROLE_INFO[r];
              const on = role === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex w-full items-start gap-3 rounded-2xl border-2 p-3.5 text-left transition ${
                    on ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition ${
                      on ? 'border-brand-500 bg-brand-500 text-white' : 'border-stone-300'
                    }`}
                  >
                    {on && <CheckIcon className="h-3.5 w-3.5" />}
                  </span>
                  <span>
                    <span className="block font-medium">{info.label}</span>
                    <span className="block text-sm text-stone-500">{info.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nom complet"
          aria-label="Nom complet"
          maxLength={100}
          className={field}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="off"
          placeholder="Email (c’est l’identifiant de connexion)"
          aria-label="Email"
          className={field}
        />
        <div className="flex flex-wrap gap-2">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Mot de passe (10 caractères minimum)"
            aria-label="Mot de passe"
            className={`${field} min-w-48 flex-1 ${showPw ? 'font-mono' : ''}`}
          />
          <button
            type="button"
            onClick={() => {
              setPassword(generatePassword());
              setShowPw(true);
            }}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-stone-700 ring-1 ring-stone-200"
          >
            Générer
          </button>
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-stone-700 ring-1 ring-stone-200"
          >
            {showPw ? 'Masquer' : 'Afficher'}
          </button>
        </div>

        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}
      </div>

      <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy}
          className="w-full rounded-2xl bg-brand-500 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Création…' : 'Créer le compte'}
        </button>
      </div>
    </Sheet>
  );
}