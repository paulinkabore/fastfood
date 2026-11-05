import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { generatePassword, type ManagerRow } from '../../features/admin/admin';
import { Sheet } from '../Sheet';
import { CloseIcon } from '../icons';

const field =
  'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

type Revealed = { title: string; email: string; password: string };

export function ManagersSheet({
  restaurant,
  onClose,
  onChanged,
}: {
  restaurant: { id: string; name: string };
  onClose: () => void;
  onChanged: () => void;
}) {
  const base = `/admin/restaurants/${restaurant.id}/managers`;

  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [copied, setCopied] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await authRequest<{ managers: ManagerRow[] }>(base);
      setManagers(d.managers);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(null);
    }
  };

  const pwValid = (p: string) => p.length >= 10 && p.length <= 72;

  const create = () =>
    run('create', async () => {
      const mail = email.trim().toLowerCase();
      if (fullName.trim().length < 2) throw new ApiError(400, 'VALIDATION_ERROR', 'Le nom doit contenir au moins 2 caractères');
      if (!/^\S+@\S+\.\S+$/.test(mail)) throw new ApiError(400, 'VALIDATION_ERROR', 'Adresse email invalide');
      if (!pwValid(password)) throw new ApiError(400, 'VALIDATION_ERROR', 'Le mot de passe doit contenir entre 10 et 72 caractères');

      await authRequest(base, {
        method: 'POST',
        body: JSON.stringify({ email: mail, fullName: fullName.trim(), password }),
      });
      setRevealed({ title: 'Compte créé', email: mail, password });
      setCopied(false);
      setFullName('');
      setEmail('');
      setPassword('');
      setShowPw(false);
      await load();
      onChanged();
    });

  const toggle = (m: ManagerRow) =>
    run(`t:${m.id}`, async () => {
      await authRequest(`${base}/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !m.isActive }),
      });
      await load();
    });

  const reset = (m: ManagerRow) =>
    run(`r:${m.id}`, async () => {
      if (!pwValid(resetPw)) throw new ApiError(400, 'VALIDATION_ERROR', 'Le mot de passe doit contenir entre 10 et 72 caractères');
      await authRequest(`${base}/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: resetPw }),
      });
      setRevealed({ title: 'Mot de passe réinitialisé', email: m.email, password: resetPw });
      setCopied(false);
      setResetFor(null);
      setResetPw('');
    });

  const copy = () => {
    if (!revealed) return;
    void navigator.clipboard
      .writeText(`Email : ${revealed.email}\nMot de passe : ${revealed.password}`)
      .then(() => setCopied(true))
      .catch(() => setError('Copie impossible : notez les identifiants à la main'));
  };

  return (
    <Sheet label="Gérants" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Gérants · {restaurant.name}</h2>
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
        {revealed && (
          <div className="space-y-2 rounded-3xl bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">{revealed.title}</p>
            <p className="text-sm text-amber-800">
              Communiquez ces identifiants au gérant. <span className="font-semibold">Le mot de passe n’est
              affiché qu’une seule fois.</span>
            </p>
            <div className="rounded-2xl bg-white px-4 py-3 text-sm">
              <p>
                <span className="text-stone-500">Email : </span>
                <span className="font-medium">{revealed.email}</span>
              </p>
              <p className="mt-1">
                <span className="text-stone-500">Mot de passe : </span>
                <span className="font-mono text-base font-semibold">{revealed.password}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copy}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {copied ? 'Copié' : 'Copier les identifiants'}
              </button>
              <button
                type="button"
                onClick={() => setRevealed(null)}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-stone-600"
              >
                C’est noté, masquer
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-stone-700">
            Comptes gérants {loading ? '' : `(${managers.length})`}
          </h3>
          {loading ? (
            <div className="h-20 animate-pulse rounded-2xl bg-stone-200/60" />
          ) : managers.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-400">
              Aucun gérant. Créez le premier ci-dessous.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
              {managers.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className={`min-w-0 ${m.isActive ? '' : 'opacity-60'}`}>
                      <p className="truncate font-medium">{m.fullName}</p>
                      <p className="truncate text-sm text-stone-500">{m.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          m.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-200 text-stone-600'
                        }`}
                      >
                        {m.isActive ? 'Actif' : 'Désactivé'}
                      </span>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setResetFor(resetFor === m.id ? null : m.id);
                          setResetPw('');
                        }}
                        className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-stone-200 disabled:opacity-50"
                      >
                        Nouveau mot de passe
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void toggle(m)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
                          m.isActive ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {busy === `t:${m.id}` ? '…' : m.isActive ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </div>
                  </div>

                  {resetFor === m.id && (
                    <div className="mt-3 space-y-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
                      <p className="text-xs text-stone-500">
                        Ses sessions ouvertes seront fermées : il devra se reconnecter avec ce mot de passe.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={resetPw}
                          onChange={(e) => setResetPw(e.target.value)}
                          autoComplete="new-password"
                          placeholder="10 caractères minimum"
                          aria-label="Nouveau mot de passe"
                          className={`${field} min-w-44 flex-1 py-2.5 font-mono`}
                        />
                        <button
                          type="button"
                          onClick={() => setResetPw(generatePassword())}
                          className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-medium text-stone-700"
                        >
                          Générer
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null || !resetPw}
                          onClick={() => void reset(m)}
                          className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy === `r:${m.id}` ? '…' : 'Valider'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 rounded-3xl bg-stone-50 p-4">
          <h3 className="text-sm font-semibold text-stone-700">Ajouter un gérant</h3>
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
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void create()}
            className="w-full rounded-2xl bg-brand-500 px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
          >
            {busy === 'create' ? 'Création…' : 'Créer le compte gérant'}
          </button>
        </section>
      </div>
    </Sheet>
  );
}