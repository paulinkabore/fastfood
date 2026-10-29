import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { fcfa } from '../lib/format';
import type { OrderView, PaymentStatus } from '../lib/types';
import { CheckIcon } from '../components/icons';
import { getSocket } from '../lib/socket';

const STEP_INDEX = { RECEIVED: 0, PREPARING: 1, READY: 2, SERVED: 3, CANCELLED: -1 } as const;

const PAYMENT: Record<PaymentStatus, { label: string; style: string }> = {
  PENDING: {
    label: 'Paiement en attente : à régler à la caisse',
    style: 'bg-amber-50 text-amber-700',
  },
  PAID: { label: 'Payé', style: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Paiement échoué', style: 'bg-red-50 text-red-700' },
  REFUNDED: { label: 'Remboursé', style: 'bg-stone-100 text-stone-600' },
};

function headline(order: OrderView): { title: string; text: string } {
  const takeaway = order.type === 'TAKEAWAY';
  switch (order.status) {
    case 'RECEIVED':
      return { title: 'Commande reçue', text: 'Le restaurant a bien reçu votre commande.' };
    case 'PREPARING':
      return { title: 'En préparation', text: 'Votre commande est en cours de préparation.' };
    case 'READY':
      return takeaway
        ? { title: 'Prête !', text: 'Vous pouvez venir la récupérer au comptoir.' }
        : { title: 'Prête !', text: 'Elle arrive à votre table.' };
    case 'SERVED':
      return takeaway
        ? { title: 'Commande récupérée', text: 'Merci et à bientôt !' }
        : { title: 'Bon appétit !', text: 'Votre commande a été servie.' };
    default:
      return { title: 'Commande annulée', text: 'Adressez-vous au personnel pour plus d’informations.' };
  }
}

export default function OrderTrackingPage() {
  const { orderId = '' } = useParams();
  const location = useLocation();
  const token = (location.state as { token?: string } | null)?.token;

  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Actualisation toutes les 5 secondes (remplacée par le temps réel à l'étape 8)
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const { order: fresh } = await api.getOrder(orderId);
        if (stopped) return;
        setOrder(fresh);
        setError(null);
        if (fresh.status === 'SERVED' || fresh.status === 'CANCELLED') return;
      } catch (e) {
        if (stopped) return;
        if (e instanceof ApiError && e.status === 404) {
          setError('Commande introuvable.');
          return;
        }
        setError('Connexion perdue, nouvelle tentative…');
      }
      timer = window.setTimeout(tick, 30000);
    };

    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [orderId]);
    // Temps réel : la page se met à jour dès que le personnel change le statut
  useEffect(() => {
    const socket = getSocket();
    const subscribe = () => socket.emit('order:subscribe', { orderId });

    // À la (re)connexion : on s'abonne et on récupère l'état exact
    const onConnect = () => {
      subscribe();
      api
        .getOrder(orderId)
        .then(({ order: fresh }) => setOrder(fresh))
        .catch(() => {});
    };
    const onUpdated = ({ order: fresh }: { order: OrderView }) => {
      if (fresh.id === orderId) {
        setOrder(fresh);
        setError(null);
      }
    };

    if (socket.connected) subscribe();
    socket.on('connect', onConnect);
    socket.on('order:updated', onUpdated);
    return () => {
      socket.off('connect', onConnect);
      socket.off('order:updated', onUpdated);
    };
  }, [orderId]);

  if (!order) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <p className={error ? 'text-stone-600' : 'animate-pulse text-stone-400'}>
          {error ?? 'Chargement de votre commande…'}
        </p>
      </main>
    );
  }

  const index = STEP_INDEX[order.status];
  const steps = ['Reçue', 'En préparation', 'Prête', order.type === 'TAKEAWAY' ? 'Récupérée' : 'Servie'];
  const { title, text } = headline(order);
  const payment = PAYMENT[order.paymentStatus];

  return (
    <main className="mx-auto min-h-dvh max-w-lg space-y-4 px-4 pb-10 pt-8">
      <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-stone-200/70">
        <p className="text-sm font-medium text-stone-500">
          {order.restaurantName} · {order.tableLabel ?? 'À emporter'}
        </p>
        <p className="mt-3 text-sm uppercase tracking-widest text-stone-400">Commande</p>
        <p className="text-6xl font-semibold tracking-tight text-brand-500">#{order.number}</p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-stone-500">{text}</p>

        {index >= 0 && (
          <ol className="mt-7 flex items-start">
            {steps.map((label, i) => (
              <li key={label} className="relative flex flex-1 flex-col items-center">
                {i > 0 && (
                  <span
                    className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${
                      i <= index ? 'bg-brand-500' : 'bg-stone-200'
                    }`}
                  />
                )}
                <span
                  className={`relative z-10 grid h-8 w-8 place-items-center rounded-full text-xs font-semibold transition ${
                    i < index
                      ? 'bg-brand-500 text-white'
                      : i === index
                        ? 'bg-brand-500 text-white ring-4 ring-brand-100'
                        : 'bg-stone-100 text-stone-400'
                  }`}
                >
                  {i < index ? <CheckIcon className="h-4 w-4" /> : i + 1}
                </span>
                <span className="mt-2 text-center text-[11px] font-medium leading-tight text-stone-600">
                  {label}
                </span>
              </li>
            ))}
          </ol>
        )}

        <p className={`mt-6 rounded-2xl px-4 py-3 text-sm font-medium ${payment.style}`}>
          {payment.label}
        </p>
        {error && <p className="mt-3 text-xs text-stone-400">{error}</p>}
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200/70">
        <h2 className="mb-3 text-sm font-semibold text-stone-700">Détail</h2>
        <ul className="divide-y divide-stone-100">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium">
                  {item.quantity} × {item.productName}
                </p>
                {item.options.length > 0 && (
                  <p className="text-sm text-stone-500">{item.options.join(', ')}</p>
                )}
                {item.notes && <p className="text-sm italic text-stone-400">« {item.notes} »</p>}
              </div>
              <p className="shrink-0 text-sm font-semibold">
                {fcfa(item.unitPriceFcfa * item.quantity)}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
          <span className="text-stone-500">Total</span>
          <span className="text-lg font-semibold">{fcfa(order.totalFcfa)}</span>
        </div>
      </section>

      {token && (
        <Link
          to={`/q/${token}`}
          className="block rounded-2xl bg-stone-900 px-5 py-4 text-center font-semibold text-white"
        >
          Commander autre chose
        </Link>
      )}
    </main>
  );
}