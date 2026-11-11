import { useCallback, useEffect, useState } from 'react';
import { ManagersSheet } from '../../components/admin/ManagersSheet';
import { RestaurantSheet } from '../../components/admin/RestaurantSheet';
import { AdminLayout } from '../../components/AdminLayout';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { PlusIcon } from '../../components/icons';
import { RequireSuperAdmin } from '../../components/RequireSuperAdmin';
import type { AdminRestaurant } from '../../features/admin/admin';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { dateTimeFr } from '../../lib/format';

function Admin() {
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<AdminRestaurant | 'new' | null>(null);
  const [managersOf, setManagersOf] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<AdminRestaurant | null>(null);
  const [deleting, setDeleting] = useState<AdminRestaurant | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await authRequest<{ restaurants: AdminRestaurant[] }>('/admin/restaurants');
      setRestaurants(d.restaurants);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setActive = async (r: AdminRestaurant, isActive: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await authRequest(`/admin/restaurants/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      await load();
      setMessage(isActive ? `« ${r.name} » réactivé` : `« ${r.name} » désactivé`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const remove = async (r: AdminRestaurant) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await authRequest(`/admin/restaurants/${r.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmName: r.name }),
      });
      setDeleting(null);
      await load();
      setMessage(`« ${r.name} » supprimé définitivement`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setDeleting(null);
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  const activeCount = restaurants.filter((r) => r.isActive).length;

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
          <h2 className="text-xl font-semibold tracking-tight">Restaurants</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            {loading ? '…' : `${activeCount} actif${activeCount > 1 ? 's' : ''} sur ${restaurants.length}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 rounded-2xl bg-brand-500 px-5 py-3 font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97]"
        >
          <PlusIcon className="h-4 w-4" />
          Nouveau restaurant
        </button>
      </section>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-3xl bg-stone-200/60" />
          ))}
        </div>
      ) : restaurants.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-14 text-center text-sm text-stone-400">
          Aucun restaurant. Créez le premier.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {restaurants.map((r) => (
            <article
              key={r.id}
              className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70 ${
                r.isActive ? '' : 'opacity-75'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold tracking-tight">{r.name}</h3>
                  <p className="truncate text-xs text-stone-400">{r.slug}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    r.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  {r.isActive ? 'Actif' : 'Désactivé'}
                </span>
              </div>

              {(r.address || r.phone) && (
                <p className="mt-2 text-sm text-stone-500">
                  {[r.address, r.phone].filter(Boolean).join(' · ')}
                </p>
              )}

              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Équipe', r._count.memberships],
                  ['Tables', r._count.tables],
                  ['Produits', r._count.products],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-stone-50 px-2 py-2.5">
                    <dd className="text-lg font-semibold">{value}</dd>
                    <dt className="text-xs text-stone-500">{label}</dt>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-stone-400">Créé le {dateTimeFr(r.createdAt)}</p>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setManagersOf({ id: r.id, name: r.name })}
                  className="rounded-xl bg-stone-900 px-3.5 py-2 text-sm font-semibold text-white transition active:scale-[0.97]"
                >
                  Gérants
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="rounded-xl bg-stone-100 px-3.5 py-2 text-sm font-medium text-stone-700 transition active:scale-[0.97]"
                >
                  Modifier
                </button>
                {r.isActive ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm(r)}
                    className="rounded-xl bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 transition active:scale-[0.97] disabled:opacity-50"
                  >
                    Désactiver
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setActive(r, true)}
                    className="rounded-xl bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-700 transition active:scale-[0.97] disabled:opacity-50"
                  >
                    Réactiver
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleting(r)}
                  className="rounded-xl bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-50"
                >
                  Supprimer
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <RestaurantSheet
          key={editing === 'new' ? 'new' : editing.id}
          restaurant={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            setEditing(null);
            void load();
            if (created) {
              setMessage(`« ${saved.name} » créé : ajoutez maintenant son gérant`);
              setManagersOf(saved);
            } else {
              setMessage(`« ${saved.name} » modifié`);
            }
          }}
        />
      )}

      {managersOf && (
        <ManagersSheet
          key={managersOf.id}
          restaurant={managersOf}
          onClose={() => setManagersOf(null)}
          onChanged={() => void load()}
        />
      )}

      {confirm && (
        <ConfirmSheet
          title={`Désactiver « ${confirm.name} » ?`}
          text="Son personnel n’aura plus accès à ses écrans, et ses QR codes cesseront de fonctionner. Aucune donnée n’est supprimée : tout redevient normal à la réactivation."
          confirmLabel="Désactiver"
          danger
          busy={busy}
          onConfirm={() => void setActive(confirm, false)}
          onClose={() => setConfirm(null)}
        />
      )}

      {deleting && (
        <ConfirmSheet
          title={`Supprimer « ${deleting.name} » ?`}
          text="Suppression définitive : commandes, paiements, menu, stock, tables, QR codes et comptes du personnel sont effacés. Cette action est irréversible."
          confirmLabel="Supprimer définitivement"
          danger
          busy={busy}
          requireText={deleting.name}
          onConfirm={() => void remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

export default function AdminPage() {
  return (
    <RequireSuperAdmin>
      <AdminLayout title="Restaurants et gérants">
        <Admin />
      </AdminLayout>
    </RequireSuperAdmin>
  );
}