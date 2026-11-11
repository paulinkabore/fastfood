import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { fcfa } from '../lib/format';
import { getSocket } from '../lib/socket';
import { POLL_MS, REALTIME } from '../lib/realtime';
import { awaitingValidation } from '../lib/mobileMoney';
import { ReceiptSheet } from '../components/ReceiptSheet';
import { usePublicConfig } from '../lib/config';
import type { OrderView, PaymentStatus } from '../lib/types';
import { CheckIcon } from '../components/icons';
import { placeLabel } from '../lib/orderPlace';

const STEP_INDEX = { RECEIVED: 0, PREPARING: 1, READY: 2, SERVED: 3, CANCELLED: -1 } as const;

const PAYMENT: Record<PaymentStatus, { label: string; style: string }> = {
  PENDING: { label: 'Paiement en attente', style: 'bg-amber-50 text-amber-700' },
  PAID: { label: 'Payé', style: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Paiement échoué', style: 'bg-red-50 text-red-700' },
  REFUNDED: { label: 'Remboursé', style: 'bg-stone-100 text-stone-600' },
};

function headline(order: OrderView): { title: string; text: string } {
  const takeaway = order.type === 'TAKEAWAY';
  const delivery = order.type === 'DELIVERY';
  if (awaitingValidation(order)) {
    return {
      title: 'Paiement en cours de vérification',
      text: 'Le caissier vérifie votre paiement. Votre commande part en cuisine dès qu’il est validé.',
    };
  }
  switch (order.status) {
    case 'RECEIVED':
      if (order.paymentStatus === 'PAID') {
        return { title: 'Commande validée', text: 'Votre paiement est validé, la commande part en cuisine.' };
      }
      return { title: 'Commande reçue', text: 'Le restaurant a bien reçu votre commande.' };
    case 'PREPARING':
      return { title: 'En préparation', text: 'Votre commande est en cours de préparation.' };
    case 'READY':
      if (delivery) return { title: 'Prête !', text: 'Le livreur va vous appeler pour organiser la livraison.' };
      return takeaway
        ? { title: 'Prête !', text: 'Vous pouvez venir la récupérer au comptoir.' }
        : { title: 'Prête !', text: 'Elle arrive à votre table.' };
    case 'SERVED':
      if (delivery) return { title: 'Commande livrée', text: 'Merci et à bientôt !' };
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
  const [params, setParams] = useSearchParams();
  const returning = params.get('paiement') === 'retour';

  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [checking, setChecking] = useState(returning);
  const { mobileMoney } = usePublicConfig();
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Actualisation de secours toutes les 30 secondes
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
      timer = window.setTimeout(tick, REALTIME ? 30000 : POLL_MS);
    };

    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [orderId]);

  // Temps réel : la page se met à jour dès que le restaurant ou le prestataire fait avancer la commande
  useEffect(() => {
    if (!REALTIME) return;
    const socket = getSocket();
    const subscribe = () => socket.emit('order:subscribe', { orderId });

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

  // Retour de la page du prestataire : le SERVEUR vérifie le paiement (le client ne décide de rien)
  useEffect(() => {
    if (!returning) return;
    let cancelled = false;
    api
      .refreshPayment(orderId)
      .then(() => api.getOrder(orderId))
      .then(({ order: fresh }) => {
        if (!cancelled) setOrder(fresh);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setChecking(false);
          setParams({}, { replace: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [returning, orderId, setParams]);

  const payMobileMoney = async () => {
    if (paying) return;
    setPaying(true);
    setPayError(null);
    try {
      const { checkoutUrl } = await api.payMobileMoney(orderId);
      window.location.assign(checkoutUrl);
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      setPaying(false);
    }
  };

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
  const steps = ['Reçue', 'En préparation', 'Prête', order.type === 'DELIVERY' ? 'Livrée' : order.type === 'TAKEAWAY' ? 'Récupérée' : 'Servie'];
  const { title, text } = headline(order);
  const payment = PAYMENT[order.paymentStatus];
  const waiting = awaitingValidation(order);
  const canPayOnline =
    order.paymentStatus === 'PENDING' && order.status !== 'CANCELLED' && mobileMoney && !waiting;

  return (
    <main className="mx-auto min-h-dvh max-w-lg space-y-4 px-4 pb-10 pt-8">
      <section className="rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-stone-200/70">
        <p className="text-sm font-medium text-stone-500">
          {order.restaurantName} · {placeLabel(order)}
        </p>
        <p className="mt-3 text-sm uppercase tracking-widest text-stone-400">Commande</p>
        <p className="text-6xl font-semibold tracking-tight text-brand-500">#{order.number}</p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-stone-500">{text}</p>
        {order.type === 'DELIVERY' && order.customerPhone && (
          <p className="mt-3 rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
            Le livreur vous appellera au <strong className="text-stone-900">{order.customerPhone}</strong>{' '}
            pour convenir du prix de la livraison.
          </p>
        )}

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
          {checking ? 'Vérification du paiement…' : waiting ? 'Paiement Mobile Money à valider' : payment.label}
        </p>

        {(order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') && (
          <button
            type="button"
            onClick={() => setReceiptOpen(true)}
            className="mt-3 w-full rounded-2xl bg-stone-900 px-5 py-3.5 font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.98]"
          >
            Télécharger mon reçu
          </button>
        )}

        {canPayOnline && !checking && (
          <div className="mt-3 space-y-2">
            <p className="text-sm text-stone-500">
              Vous pouvez régler à la caisse, ou payer maintenant par Mobile Money.
            </p>
            <button
              type="button"
              onClick={payMobileMoney}
              disabled={paying}
              className="w-full rounded-2xl bg-brand-500 px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
            >
              {paying ? 'Ouverture du paiement…' : 'Payer par Mobile Money'}
            </button>
            {payError && (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {payError}
              </p>
            )}
          </div>
        )}

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
      {receiptOpen && (
        <ReceiptSheet
          orderId={orderId}
          buttonLabel="Télécharger (PDF)"
          onClose={() => setReceiptOpen(false)}
        />
      )}
    </main>
  );
}