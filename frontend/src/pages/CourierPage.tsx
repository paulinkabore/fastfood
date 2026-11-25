import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChangePasswordButton } from '../components/ChangePassword';
import { RequireRole } from '../components/RequireRole';
import { Logo } from '../components/Logo';
import { ApiError } from '../lib/api';
import { authRequest, useAuth } from '../lib/auth';
import { fcfa } from '../lib/format';
import { STAFF_POLL_MS } from '../lib/realtime';
import type { OrderView } from '../lib/types';

type CourierOrder = OrderView & { mine: boolean; claimedAt: string | null };
type Data = { available: CourierOrder[]; mine: CourierOrder[]; deliveredToday: number };

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "À l'instant" : `Il y a ${m} min`;
};

function Items({ order }: { order: CourierOrder }) {
  return (
    <ul className="space-y-0.5 text-sm text-stone-700">
      {order.items.map((i, k) => (
        <li key={k}>
          {i.quantity} × {i.productName}
          {i.options.length > 0 && <span className="text-stone-500"> (+ {i.options.join(', ')})</span>}
        </li>
      ))}
    </ul>
  );
}

function Courier({ restaurantId }: { restaurantId: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);
  const base = `/restaurants/${restaurantId}/courier`;

  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await authRequest<Data>(`${base}/orders`));
      setError((e) => (e && e.startsWith('Cette livraison') ? e : null));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    }
  }, [base]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), STAFF_POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const act = async (id: string, path: 'claim' | 'delivered') => {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      await authRequest(`${base}/orders/${id}/${path}`, { method: 'POST', body: JSON.stringify({}) });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusyId(null);
      await load();
    }
  };

  const available = data?.available ?? [];
  const mine = data?.mine ?? [];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo className="h-9" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Livreur</h1>
              {user && <p className="text-xs text-stone-500">{user.fullName}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
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

      <div className="mx-auto max-w-3xl space-y-6 p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'À prendre', value: available.length, tone: 'text-brand-600' },
            { label: 'En cours', value: mine.length, tone: 'text-amber-600' },
            { label: 'Livrées aujourd’hui', value: data?.deliveredToday ?? 0, tone: 'text-emerald-600' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200/70">
              <p className={`text-2xl font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
              <p className="text-xs text-stone-500">{s.label}</p>
            </div>
          ))}
        </div>

        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Mes livraisons</h2>
          {!data ? (
            <div className="h-32 animate-pulse rounded-3xl bg-stone-200/60" />
          ) : mine.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-400">
              Aucune livraison en cours. Prenez-en une ci-dessous.
            </p>
          ) : (
            <ul className="space-y-3">
              {mine.map((o) => {
                const ready = o.status === 'READY';
                return (
                  <li
                    key={o.id}
                    className={`space-y-3 rounded-3xl bg-white p-4 shadow-sm ${
                      ready ? 'ring-2 ring-emerald-400' : 'ring-1 ring-stone-200/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-semibold tracking-tight">#{o.number}</p>
                        <p className="text-xs text-stone-500">{ago(o.createdAt, now)}</p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          ready ? 'bg-emerald-500 text-white' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {ready ? 'Prête : à récupérer' : 'En préparation'}
                      </span>
                    </div>

                    <div className="rounded-2xl bg-stone-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Client</p>
                      <p className="mt-1 text-lg font-semibold">{o.customerName}</p>
                      {o.customerPhone && (
                        <a
                          href={`tel:${o.customerPhone}`}
                          className="mt-2 inline-flex items-center rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/30"
                        >
                          Appeler {o.customerPhone}
                        </a>
                      )}
                      <p className="mt-2 text-xs text-stone-500">
                        Appelez le client pour convenir de l’adresse et du prix de la livraison.
                      </p>
                    </div>

                    <Items order={o} />
                    {o.notes && <p className="text-sm text-stone-600">Note : {o.notes}</p>}
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{fcfa(o.totalFcfa)}</span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        {o.paymentStatus === 'PAID' ? 'Payée' : 'Paiement à vérifier'}
                      </span>
                    </div>

                    {ready ? (
                      <button
                        type="button"
                        disabled={busyId === o.id}
                        onClick={() => void act(o.id, 'delivered')}
                        className="w-full rounded-2xl bg-emerald-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-60"
                      >
                        {busyId === o.id ? 'Mise à jour…' : 'Marquer livrée'}
                      </button>
                    ) : (
                      <p className="rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-700">
                        La cuisine prépare la commande. Le bouton « Marquer livrée » apparaît quand elle est prête.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            À prendre ({available.length})
          </h2>
          {!data ? (
            <div className="h-32 animate-pulse rounded-3xl bg-stone-200/60" />
          ) : available.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-400">
              Aucune livraison à prendre pour le moment.
            </p>
          ) : (
            <ul className="space-y-3">
              {available.map((o) => (
                <li key={o.id} className="space-y-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-semibold tracking-tight">#{o.number}</p>
                      <p className="text-xs text-stone-500">{ago(o.createdAt, now)}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        o.status === 'READY' ? 'bg-emerald-500 text-white' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {o.status === 'READY' ? 'Prête' : 'En préparation'}
                    </span>
                  </div>
                  <Items order={o} />
                  <p className="text-sm font-semibold">{fcfa(o.totalFcfa)}</p>
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() => void act(o.id, 'claim')}
                    className="w-full rounded-2xl bg-brand-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 transition active:scale-[0.98] disabled:opacity-60"
                  >
                    {busyId === o.id ? 'Un instant…' : 'Je prends cette livraison'}
                  </button>
                  <p className="text-center text-xs text-stone-400">
                    Le nom et le téléphone du client s’affichent quand vous la prenez.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default function CourierPage() {
  return (
    <RequireRole roles={['COURIER']}>
      {({ restaurantId }) => <Courier key={restaurantId} restaurantId={restaurantId} />}
    </RequireRole>
  );
}
