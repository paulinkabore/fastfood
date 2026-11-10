import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RequireRole } from '../components/RequireRole';
import { ApiError } from '../lib/api';
import { authRequest, useAuth } from '../lib/auth';
import { fcfa } from '../lib/format';
import { beep, unlockAudio } from '../lib/sound';
import { useService } from '../features/service/useService';
import type { OrderStatus, OrderView } from '../lib/types';

const STATUS: Record<OrderStatus, { label: string; style: string }> = {
  RECEIVED: { label: 'Reçue', style: 'bg-sky-50 text-sky-700' },
  PREPARING: { label: 'En préparation', style: 'bg-amber-50 text-amber-700' },
  READY: { label: 'Prête', style: 'bg-emerald-500 text-white' },
  SERVED: { label: 'Servie', style: 'bg-stone-100 text-stone-600' },
  CANCELLED: { label: 'Annulée', style: 'bg-red-50 text-red-700' },
};

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function OrderLine({
  order,
  now,
  busy,
  readOnly,
  onServe,
}: {
  order: OrderView;
  now: number;
  busy: boolean;
  readOnly: boolean;
  onServe: () => void;
}) {
  const st = STATUS[order.status];
  const minutes = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60_000));
  const ready = order.status === 'READY';

  return (
    <li className={`rounded-2xl p-3 ${ready ? 'bg-emerald-50' : 'bg-stone-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xl font-semibold tracking-tight">#{order.number}</p>
          <p className="text-xs text-stone-500">
            {minutes < 1 ? "À l'instant" : `Il y a ${minutes} min`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.style}`}>{st.label}</span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              order.paymentStatus === 'PAID'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-white text-stone-500 ring-1 ring-stone-200'
            }`}
          >
            {order.paymentStatus === 'PAID' ? 'Payée' : 'À payer'}
          </span>
        </div>
      </div>

      <ul className="mt-2 space-y-0.5 text-sm text-stone-700">
        {order.items.map((i, k) => (
          <li key={k}>
            {i.quantity} × {i.productName}
            {i.options.length > 0 && <span className="text-stone-500"> (+ {i.options.join(', ')})</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm font-semibold">{fcfa(order.totalFcfa)}</p>

      {ready && !readOnly && (
        <button
          type="button"
          disabled={busy}
          onClick={onServe}
          className="mt-3 w-full rounded-2xl bg-emerald-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Mise à jour…' : order.type === 'TAKEAWAY' ? 'Remis au client' : 'Servi à la table'}
        </button>
      )}
    </li>
  );
}

function Service({ restaurantId, readOnly }: { restaurantId: string; readOnly: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);

  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef(false);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const { orders, loading, error, live, apply, reload } = useService(restaurantId, () => {
    if (soundRef.current) beep();
  });

  const [filter, setFilter] = useState<'all' | 'ready'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const readyCount = orders.filter((o) => o.status === 'READY').length;

  // Commandes regroupées par table ; les tables avec une commande prête passent en premier
  const groups = useMemo(() => {
    const visible = filter === 'ready' ? orders.filter((o) => o.status === 'READY') : orders;
    const map = new Map<string, OrderView[]>();
    for (const o of visible) {
      const key = o.tableLabel ?? (o.type === 'TAKEAWAY' ? 'À emporter' : 'Sans table');
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return [...map.entries()]
      .map(([title, list]) => ({
        title,
        orders: list,
        ready: list.filter((o) => o.status === 'READY').length,
      }))
      .sort(
        (a, b) =>
          b.ready - a.ready ||
          new Date(a.orders[0].createdAt).getTime() - new Date(b.orders[0].createdAt).getTime(),
      );
  }, [orders, filter]);

  const serve = async (order: OrderView) => {
    if (busyId) return;
    setBusyId(order.id);
    setActionError(null);
    try {
      const data = await authRequest<{ order: OrderView }>(
        `/restaurants/${restaurantId}/orders/${order.id}/status`,
        { method: 'PATCH', body: JSON.stringify({ status: 'SERVED' }) },
      );
      apply(data.order);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      if (e instanceof ApiError && e.code === 'ORDER_CHANGED') void reload();
    } finally {
      setBusyId(null);
    }
  };

  const restaurantName = orders[0]?.restaurantName;
  const pill = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
    }`;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Serveur{restaurantName ? ` · ${restaurantName}` : ''}
            </h1>
            <p className="flex items-center gap-2 text-xs text-stone-500">
              <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'animate-pulse bg-red-500'}`} />
              {live ? 'Temps réel actif' : 'Reconnexion…'}
              {user && <span className="text-stone-400">· {user.fullName}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!soundOn) {
                  unlockAudio();
                  beep();
                }
                setSoundOn((v) => !v);
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                soundOn
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                  : 'bg-stone-100 text-stone-600'
              }`}
            >
              {soundOn ? 'Son activé' : 'Activer le son'}
            </button>
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

      <main className="mx-auto max-w-6xl space-y-5 p-4">
        {readOnly && (
          <p className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-600">
            Consultation seule : le gérant peut voir ces commandes mais pas les modifier.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button type="button" className={pill(filter === 'all')} onClick={() => setFilter('all')}>
              Toutes ({orders.length})
            </button>
            <button type="button" className={pill(filter === 'ready')} onClick={() => setFilter('ready')}>
              À servir ({readyCount})
            </button>
          </div>
          {readyCount > 0 && (
            <p className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              {readyCount} commande{readyCount > 1 ? 's' : ''} prête{readyCount > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {(error || actionError) && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {actionError ?? error}
          </p>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-3xl bg-stone-200/60" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-14 text-center text-sm text-stone-400">
            {filter === 'ready' ? 'Aucune commande à servir' : 'Aucune commande en cours'}
          </p>
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <section
                key={g.title}
                className={`rounded-3xl bg-white p-4 shadow-sm ${
                  g.ready > 0 ? 'ring-2 ring-emerald-400' : 'ring-1 ring-stone-200/70'
                }`}
              >
                <h2 className="mb-3 flex items-center justify-between text-lg font-semibold tracking-tight">
                  {g.title}
                  {g.ready > 0 && (
                    <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white">
                      {g.ready} à servir
                    </span>
                  )}
                </h2>
                <ul className="space-y-2">
                  {g.orders.map((o) => (
                    <OrderLine
                      key={o.id}
                      order={o}
                      now={now}
                      busy={busyId === o.id}
                      readOnly={readOnly}
                      onServe={() => void serve(o)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ServicePage() {
  return (
    <RequireRole roles={['WAITER', 'MANAGER']}>
      {({ restaurantId, role }) => (
        <Service key={restaurantId} restaurantId={restaurantId} readOnly={role === 'MANAGER'} />
      )}
    </RequireRole>
  );
}