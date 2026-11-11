import { useCallback, useEffect, useState } from 'react';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { PlusIcon } from '../../components/icons';
import { RequireRole } from '../../components/RequireRole';
import { StaffEditSheet } from '../../components/staff/StaffEditSheet';
import { StaffSheet } from '../../components/staff/StaffSheet';
import { StaffLayout } from '../../components/StaffLayout';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { ROLE_INFO, type AnyRole, type StaffMember } from '../../features/staff/staff';

const ORDER: AnyRole[] = ['MANAGER', 'CASHIER', 'COOK', 'WAITER'];

function Staff({ restaurantId }: { restaurantId: string }) {
  const base = `/restaurants/${restaurantId}`;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [confirm, setConfirm] = useState<StaffMember | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await authRequest<{ staff: StaffMember[] }>(`${base}/staff`);
      setStaff(d.staff);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  // La notification disparaît d'elle-même
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 6000);
    return () => window.clearTimeout(t);
  }, [message]);

  const setActive = async (m: StaffMember, isActive: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await authRequest(`${base}/staff/${m.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      await load();
      setMessage(isActive ? `« ${m.fullName} » réactivé` : `« ${m.fullName} » désactivé : son accès est coupé`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const countOf = (role: AnyRole) => staff.filter((m) => m.role === role && m.isActive).length;
  const onlyManagers = staff.every((m) => m.role === 'MANAGER');

  return (
    <>
      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      )}
      {message && (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Votre équipe</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {ORDER.map((r) => (
              <span key={r} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_INFO[r].style}`}>
                {countOf(r)} {ROLE_INFO[r].label.toLowerCase()}
                {countOf(r) > 1 ? 's' : ''}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-2xl bg-brand-500 px-5 py-3 font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97]"
        >
          <PlusIcon className="h-4 w-4" />
          Ajouter un employé
        </button>
      </section>

      {loading ? (
        <div className="h-40 animate-pulse rounded-3xl bg-stone-200/60" />
      ) : (
        <>
          {onlyManagers && (
            <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-400">
              Aucun employé pour l’instant. Ajoutez un caissier, un cuisinier ou un serveur.
            </p>
          )}

          {ORDER.map((role) => {
            const list = staff.filter((m) => m.role === role);
            if (list.length === 0) return null;
            return (
              <section key={role} className="space-y-2">
                <h3 className="text-sm font-semibold text-stone-600">
                  {ROLE_INFO[role].label}
                  {list.length > 1 ? 's' : ''} <span className="text-stone-400">({list.length})</span>
                </h3>
                <ul className="divide-y divide-stone-100 rounded-3xl bg-white px-5 shadow-sm ring-1 ring-stone-200/70">
                  {list.map((m) => (
                    <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div className={`min-w-0 ${m.isActive ? '' : 'opacity-60'}`}>
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{m.fullName}</span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_INFO[m.role].style}`}
                          >
                            {ROLE_INFO[m.role].label}
                          </span>
                          {!m.isActive && (
                            <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-600">
                              Désactivé
                            </span>
                          )}
                        </p>
                        <p className="truncate text-sm text-stone-500">{m.email}</p>
                      </div>

                      {m.role === 'MANAGER' ? (
                        <p className="text-xs text-stone-400">Géré par l’administration</p>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setEditing(m)}
                            className="rounded-xl bg-stone-100 px-3.5 py-2 text-sm font-medium text-stone-700 transition active:scale-[0.97] disabled:opacity-50"
                          >
                            Modifier
                          </button>
                          {m.isActive ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirm(m)}
                              className="rounded-xl bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 transition active:scale-[0.97] disabled:opacity-50"
                            >
                              Désactiver
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void setActive(m, true)}
                              className="rounded-xl bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-700 transition active:scale-[0.97] disabled:opacity-50"
                            >
                              Réactiver
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {creating && (
        <StaffSheet
          restaurantId={restaurantId}
          onClose={() => setCreating(false)}
          onCreated={(name, role) => {
            setError(null);
            setMessage(`Compte créé : « ${name} » (${ROLE_INFO[role].label.toLowerCase()})`);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            void load();
          }}
        />
      )}

      {editing && (
        <StaffEditSheet
          key={editing.userId}
          restaurantId={restaurantId}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={(m, close) => {
            setMessage(m);
            void load();
            if (close) setEditing(null);
          }}
        />
      )}

      {confirm && (
        <ConfirmSheet
          title={`Désactiver « ${confirm.fullName} » ?`}
          text="Son accès est coupé tout de suite et ses sessions ouvertes sont fermées. Ses données restent : vous pourrez le réactiver."
          confirmLabel="Désactiver"
          danger
          busy={busy}
          onConfirm={() => void setActive(confirm, false)}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

export default function StaffPage() {
  return (
    <RequireRole roles={['MANAGER']}>
      {({ restaurantId }) => (
        <StaffLayout restaurantId={restaurantId} title="Personnel">
          <Staff restaurantId={restaurantId} />
        </StaffLayout>
      )}
    </RequireRole>
  );
}