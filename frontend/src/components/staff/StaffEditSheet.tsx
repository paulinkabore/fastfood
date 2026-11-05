import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { generatePassword } from '../../features/admin/admin';
import { ASSIGNABLE, ROLE_INFO, type StaffMember, type StaffRole } from '../../features/staff/staff';
import { Sheet } from '../Sheet';
import { CloseIcon } from '../icons';

const field =
  'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

export function StaffEditSheet({
  restaurantId,
  member,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  member: StaffMember;
  onClose: () => void;
  // close = true : la fenêtre se ferme ; false : elle reste ouverte (mot de passe à noter)
  onSaved: (message: string, close: boolean) => void;
}) {
  const url = `/restaurants/${restaurantId}/staff/${member.userId}`;
  const [fullName, setFullName] = useState(member.fullName);
  const [role, setRole] = useState<StaffRole>(member.role as StaffRole);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const patch = async (key: string, body: object, message: string, close: boolean) => {
    if (busy) return false;
    setBusy(key);
    setError(null);
    try {
      await authRequest(url, { method: 'PATCH', body: JSON.stringify(body) });
      onSaved(message, close);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = () => {
    const body: { fullName?: string; role?: StaffRole } = {};
    if (fullName.trim() !== member.fullName) body.fullName = fullName.trim();
    if (role !== member.role) body.role = role;
    if (Object.keys(body).length === 0) return setError('Aucune modification à enregistrer');
    if (body.fullName !== undefined && body.fullName.length < 2) {
      return setError('Le nom doit contenir au moins 2 caractères');
    }
    void patch('profile', body, `« ${fullName.trim()} » modifié`, true);
  };

  const resetPassword = async () => {
    if (password.length < 10 || password.length > 72) {
      return setError('Le mot de passe doit contenir entre 10 et 72 caractères');
    }
    const ok = await patch('password', { password }, `Mot de passe de « ${member.fullName} » réinitialisé`, false);
    if (ok) {
      setRevealed(password);
      setCopied(false);
      setPassword('');
    }
  };

  const copy = () => {
    if (!revealed) return;
    void navigator.clipboard
      .writeText(`Email : ${member.email}\nMot de passe : ${revealed}`)
      .then(() => setCopied(true))
      .catch(() => setError('Copie impossible : notez les identifiants à la main'));
  };

  return (
    <Sheet label="Modifier l’employé" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight">{member.fullName}</h2>
          <p className="truncate text-sm text-stone-500">{member.email}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-stone-700">Profil</h3>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={100}
            aria-label="Nom complet"
            className={field}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            aria-label="Rôle"
            className={field}
          >
            {ASSIGNABLE.map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].label} (écran {ROLE_INFO[r].screen})
              </option>
            ))}
          </select>
          <p className="text-xs text-stone-400">
            Le nouveau rôle s’applique tout de suite côté serveur. La personne retrouve son nouvel écran à sa
            prochaine connexion.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={saveProfile}
            className="w-full rounded-2xl bg-brand-500 px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
          >
            {busy === 'profile' ? 'Enregistrement…' : 'Enregistrer le profil'}
          </button>
        </section>

        <section className="space-y-3 rounded-3xl bg-stone-50 p-4">
          <h3 className="text-sm font-semibold text-stone-700">Nouveau mot de passe</h3>
          {revealed && (
            <div className="space-y-2 rounded-2xl bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Affiché une seule fois.</span> Ses sessions ouvertes sont
                fermées.
              </p>
              <p className="rounded-xl bg-white px-3 py-2 font-mono text-base font-semibold">{revealed}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-xl bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white"
                >
                  {copied ? 'Copié' : 'Copier'}
                </button>
                <button
                  type="button"
                  onClick={() => setRevealed(null)}
                  className="rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-stone-600"
                >
                  C’est noté, masquer
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="10 caractères minimum"
              aria-label="Nouveau mot de passe"
              className={`${field} min-w-44 flex-1 font-mono`}
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-stone-700 ring-1 ring-stone-200"
            >
              Générer
            </button>
            <button
              type="button"
              disabled={busy !== null || !password}
              onClick={() => void resetPassword()}
              className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === 'password' ? '…' : 'Valider'}
            </button>
          </div>
        </section>
      </div>
    </Sheet>
  );
}