import { ChangePasswordButton } from '../components/ChangePassword';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { RequireRole } from '../components/RequireRole';
import { StaffLayout } from '../components/StaffLayout';
import { ApiError } from '../lib/api';
import { authRequest, useAuth } from '../lib/auth';
import { Row, Sep, TicketHeader, dateFr, ticketFont, timeShort } from '../components/TicketParts';
import { printTicket } from '../lib/print';
import { beep, readyAnnouncement, speak, speechAvailable, unlockAudio } from '../lib/sound';
import { useKitchen } from '../features/kitchen/useKitchen';
import type { OrderStatus, OrderView } from '../lib/types';
import { placeLabel } from '../lib/orderPlace';

const COLUMNS: { status: OrderStatus; title: string; dot: string }[] = [
  { status: 'RECEIVED', title: 'Reçues', dot: 'bg-sky-500' },
  { status: 'PREPARING', title: 'En préparation', dot: 'bg-amber-500' },
  { status: 'READY', title: 'Prêtes', dot: 'bg-emerald-500' },
];

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string; style: string }>> = {
  RECEIVED: {
    to: 'PREPARING',
    label: 'Lancer la préparation',
    style: 'bg-stone-900 text-white shadow-stone-900/20',
  },
  PREPARING: {
    to: 'READY',
    label: 'Marquer prête',
    style: 'bg-brand-500 text-white shadow-brand-500/30',
  },
};

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function OrderCard({
  order,
  now,
  busy,
  readOnly,
  onAdvance,
  onTicket,
}: {
  order: OrderView;
  now: number;
  busy: boolean;
  readOnly: boolean;
  onAdvance: (to: OrderStatus) => void;
  onTicket: () => void;
}) {
  const minutes = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60_000));
  const tone =
    minutes >= 20
      ? 'bg-red-50 text-red-700'
      : minutes >= 10
        ? 'bg-amber-50 text-amber-700'
        : 'bg-stone-100 text-stone-600';
  const next = NEXT[order.status];

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold tracking-tight">#{order.number}</p>
          <p className="mt-0.5 text-sm font-medium text-stone-500">
            {placeLabel(order)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
            {minutes < 1 ? "À l'instant" : `${minutes} min`}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              order.paymentStatus === 'PAID'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-stone-100 text-stone-500'
            }`}
          >
            {order.paymentStatus === 'PAID' ? 'Payé' : 'Paiement en attente'}
          </span>
        </div>
      </header>

      <ul className="mt-3 space-y-2.5 border-t border-stone-100 pt-3">
        {order.items.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-stone-900 px-1.5 text-sm font-semibold text-white">
              {item.quantity}
            </span>
            <div className="min-w-0">
              <p className="font-medium leading-tight">{item.productName}</p>
              {item.options.length > 0 && (
                <p className="text-sm text-stone-500">+ {item.options.join(', ')}</p>
              )}
              {item.notes && (
                <p className="mt-0.5 rounded-lg bg-amber-50 px-2 py-1 text-sm font-medium text-amber-800">
                  {item.notes}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!readOnly && (
        <button
          type="button"
          onClick={onTicket}
          className="mt-3 w-full rounded-xl bg-stone-100 px-3 py-2 text-sm font-medium text-stone-600 transition active:scale-[0.98]"
        >
          Imprimer le ticket
        </button>
      )}

      {order.notes && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          {order.notes}
        </p>
      )}

      {next && readOnly ? null : next ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAdvance(next.to)}
          className={`mt-4 w-full rounded-2xl px-4 py-3.5 font-semibold shadow-lg transition active:scale-[0.98] disabled:opacity-60 ${next.style}`}
        >
          {busy ? 'Mise à jour…' : next.label}
        </button>
      ) : (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700">
          {order.type === 'DELIVERY'
            ? 'En attente du livreur'
            : order.type === 'TAKEAWAY'
              ? 'En attente de retrait'
              : 'En attente de service'}
        </p>
      )}
    </article>
  );
}

function Kitchen({ restaurantId, readOnly }: { restaurantId: string; readOnly: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = useNow(30_000);

  const [soundOn, setSoundOn] = useState(false);
  // Annonce vocale (haut-parleurs) quand une commande est marquée prête
  const [voiceOn, setVoiceOn] = useState(() => {
    try {
      return localStorage.getItem('voice:kitchen') === '1';
    } catch {
      return false;
    }
  });
  const soundRef = useRef(false);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const { orders, loading, error, live, apply, reload } = useKitchen(restaurantId, () => {
    if (soundRef.current) beep();
  });

  // Ticket de cuisine : imprimé tel quel, sans le reste de l'écran
  const [ticket, setTicket] = useState<OrderView | null>(null);
  useEffect(() => {
    if (!ticket) return;
    const done = () => setTicket(null);
    window.addEventListener('afterprint', done);
    const t = window.setTimeout(printTicket, 100);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [ticket]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const advance = async (order: OrderView, to: OrderStatus) => {
    if (busyId) return;
    setBusyId(order.id);
    setActionError(null);
    try {
      const data = await authRequest<{ order: OrderView }>(
        `/restaurants/${restaurantId}/orders/${order.id}/status`,
        { method: 'PATCH', body: JSON.stringify({ status: to }) },
      );
      apply(data.order);
      if (to === 'READY' && voiceOn) speak(readyAnnouncement(data.order));
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      if (e instanceof ApiError && e.code === 'ORDER_CHANGED') void reload();
    } finally {
      setBusyId(null);
    }
  };

  const restaurantName = orders[0]?.restaurantName;

  return (
    <div className={readOnly ? undefined : 'min-h-dvh'}>
      {!readOnly && (
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Cuisine{restaurantName ? ` · ${restaurantName}` : ''}
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
            {speechAvailable() && (
              <button
                type="button"
                onClick={() => {
                  const next = !voiceOn;
                  setVoiceOn(next);
                  try {
                    localStorage.setItem('voice:kitchen', next ? '1' : '0');
                  } catch {
                    /* ignoré */
                  }
                  if (next) {
                    unlockAudio();
                    speak('Annonce vocale activée.', 1);
                  }
                }}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  voiceOn
                    ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                {voiceOn ? 'Annonce vocale activée' : 'Annonce vocale'}
              </button>
            )}
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
      )}

      {ticket &&
        createPortal(
          <div className="print-receipt" style={ticketFont}>
            <TicketHeader title="BON DE PRÉPARATION" restaurantName={ticket.restaurantName} />
            <p style={{ textAlign: 'center', fontSize: '30px', fontWeight: 700, margin: 0 }}>#{ticket.number}</p>
            <p style={{ textAlign: 'center', fontSize: '16px', fontWeight: 700, margin: 0 }}>{placeLabel(ticket)}</p>
            {ticket.customerName && <p style={{ textAlign: 'center', margin: 0 }}>Client : {ticket.customerName}</p>}
            <Sep />
            <Row left="Date" right={dateFr(ticket.createdAt)} />
            <Row left="Heure" right={timeShort(ticket.createdAt)} />
            <Sep />
            {ticket.items.map((i, idx) => (
              <div key={idx} style={{ margin: '5px 0', fontSize: '14px' }}>
                <strong>
                  {i.quantity} x {i.productName}
                </strong>
                {i.options.length > 0 && <div style={{ fontSize: '12px' }}>+ {i.options.join(', ')}</div>}
                {i.notes && <div style={{ fontSize: '12px' }}>Note : {i.notes}</div>}
              </div>
            ))}
            {ticket.notes && (
              <>
                <Sep />
                <div>Note : {ticket.notes}</div>
              </>
            )}
            <Sep double />
            <Row left="Articles" right={ticket.items.reduce((n, i) => n + i.quantity, 0)} bold />
          </div>,
          document.body,
        )}

      <div className={readOnly ? undefined : 'mx-auto max-w-7xl p-4'}>
        {readOnly && (
          <p className="mb-4 rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-600">
            Consultation seule : le gérant peut voir ces commandes mais pas les modifier.
          </p>
        )}
        {(error || actionError) && (
          <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {actionError ?? error}
          </p>
        )}

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-stone-200/60" />
            ))}
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-3">
            {COLUMNS.map((col) => {
              const list = orders.filter((o) => o.status === col.status);
              return (
                <section key={col.status}>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-700">
                    <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                    {col.title}
                    <span className="rounded-full bg-stone-200/70 px-2 py-0.5 text-xs">
                      {list.length}
                    </span>
                  </h2>
                  <div className="space-y-3">
                    {list.length === 0 && (
                      <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-400">
                        Aucune commande
                      </p>
                    )}
                    {list.map((o) => (
                      <OrderCard
                        key={o.id}
                        order={o}
                        now={now}
                        busy={busyId === o.id}
                        readOnly={readOnly}
                        onAdvance={(to) => void advance(o, to)}
                        onTicket={() => setTicket(o)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function KitchenPage() {
  return (
    <RequireRole roles={['COOK', 'MANAGER']}>
      {({ restaurantId, role }) =>
        role === 'MANAGER' ? (
          <StaffLayout restaurantId={restaurantId} title="Cuisine">
            <Kitchen key={restaurantId} restaurantId={restaurantId} readOnly />
          </StaffLayout>
        ) : (
          <Kitchen key={restaurantId} restaurantId={restaurantId} readOnly={false} />
        )
      }
    </RequireRole>
  );
}