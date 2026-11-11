import { ChangePasswordButton } from '../components/ChangePassword';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RequireRole } from '../components/RequireRole';
import { StaffLayout } from '../components/StaffLayout';
import { CloseSessionSheet } from '../components/CloseSessionSheet';
import { CollectSheet } from '../components/CollectSheet';
import { CounterOrderSheet } from '../components/CounterOrderSheet';
import { MobileMoneySheet } from '../components/MobileMoneySheet';
import { ReceiptSheet } from '../components/ReceiptSheet';
import { awaitingValidation } from '../lib/mobileMoney';
import { beep, unlockAudio } from '../lib/sound';
import { PlusIcon } from '../components/icons';
import { useCashier, type CashierScope } from '../features/cashier/useCashier';
import { ApiError } from '../lib/api';
import { authRequest, useAuth } from '../lib/auth';
import { fcfa, parseAmount, timeFr } from '../lib/format';
import type { CashierOrder, CashSessionView, OrderStatus } from '../lib/types';
import { placeLabel } from '../lib/orderPlace';

const STATUS: Record<OrderStatus, { label: string; style: string }> = {
  RECEIVED: { label: 'Reçue', style: 'bg-sky-50 text-sky-700' },
  PREPARING: { label: 'En préparation', style: 'bg-amber-50 text-amber-700' },
  READY: { label: 'Prête', style: 'bg-emerald-50 text-emerald-700' },
  SERVED: { label: 'Servie', style: 'bg-stone-100 text-stone-600' },
  CANCELLED: { label: 'Annulée', style: 'bg-red-50 text-red-700' },
};

const PAYMENT = {
  PENDING: { label: 'À payer', style: 'bg-amber-50 text-amber-700' },
  PAID: { label: 'Payée', style: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Échec', style: 'bg-red-50 text-red-700' },
  REFUNDED: { label: 'Remboursée', style: 'bg-stone-100 text-stone-600' },
} as const;

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${strong ? 'bg-stone-900 text-white' : 'bg-stone-50'}`}>
      <p className={`text-xs font-medium ${strong ? 'text-stone-300' : 'text-stone-500'}`}>{label}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function OrderRow({
  order,
  hasSession,
  readOnly,
  onCollect,
  onVerify,
  onReceipt,
}: {
  order: CashierOrder;
  hasSession: boolean;
  readOnly: boolean;
  onCollect: () => void;
  onVerify: () => void;
  onReceipt: () => void;
}) {
  const st = STATUS[order.status];
  const pay = PAYMENT[order.paymentStatus];
  const toVerify = awaitingValidation(order);
  const payerPhone = order.payments.find((p) => p.method === 'MOBILE_MONEY' && p.status === 'PENDING')?.payerPhone;
  const canPay = !readOnly && !toVerify && order.paymentStatus === 'PENDING' && order.status !== 'CANCELLED';
  const hasReceipt = order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED';
  const summary = order.items.map((i) => `${i.quantity} × ${i.productName}`).join(', ');

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight">#{order.number}</p>
          <p className="text-sm text-stone-500">
            {placeLabel(order)}
            {order.customerName ? ` · ${order.customerName}` : ''} · {timeFr(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.style}`}>{st.label}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pay.style}`}>{toVerify ? 'Mobile Money à valider' : pay.label}</span>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-stone-600">{summary}</p>
      {toVerify && payerPhone && (
        <p className="mt-2 text-sm text-stone-600">
          Déposant : <strong className="text-stone-900">{payerPhone}</strong>
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-lg font-semibold">{fcfa(order.totalFcfa)}</p>
        {toVerify && !readOnly && (
          <button
            type="button"
            onClick={onVerify}
            className="rounded-2xl bg-emerald-600 px-5 py-2.5 font-semibold text-white shadow-md shadow-emerald-600/25 transition active:scale-[0.97]"
          >
            Vérifier le paiement
          </button>
        )}
        {canPay && (
          <button
            type="button"
            onClick={onCollect}
            disabled={!hasSession}
            title={hasSession ? undefined : 'Ouvrez votre caisse'}
            className="rounded-2xl bg-brand-500 px-5 py-2.5 font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97] disabled:opacity-50"
          >
            Encaisser
          </button>
        )}
        {hasReceipt && (
          <button
            type="button"
            onClick={onReceipt}
            className="rounded-2xl bg-stone-100 px-5 py-2.5 font-medium text-stone-700 transition active:scale-[0.97]"
          >
            Reçu
          </button>
        )}
      </div>
    </article>
  );
}

function Cashier({ restaurantId, readOnly }: { restaurantId: string; readOnly: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [scope, setScope] = useState<CashierScope>('unpaid');
  const { session, orders, loading, error, live, reload } = useCashier(restaurantId, scope);

  // Bip quand un nouveau paiement Mobile Money attend d'être validé
  const [soundOn, setSoundOn] = useState(false);
  const seenToVerify = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    const ids = orders.filter(awaitingValidation).map((o) => o.id);
    if (seenToVerify.current === null) {
      seenToVerify.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seenToVerify.current!.has(id));
    fresh.forEach((id) => seenToVerify.current!.add(id));
    if (fresh.length > 0 && soundOn) beep();
  }, [orders, loading, soundOn]);

  const [collecting, setCollecting] = useState<CashierOrder | null>(null);
  const [verifying, setVerifying] = useState<CashierOrder | null>(null);
  const [closing, setClosing] = useState<CashSessionView | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);

  const [float, setFloat] = useState('');
  const [opening, setOpening] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const openSession = async () => {
    if (opening) return;
    setOpening(true);
    setActionError(null);
    try {
      await authRequest(`/restaurants/${restaurantId}/cash-sessions`, {
        method: 'POST',
        body: JSON.stringify({ openingFloatFcfa: parseAmount(float) }),
      });
      setFloat('');
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setOpening(false);
    }
  };

  const restaurantName = orders[0]?.restaurantName;
  const tab = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
    }`;

  return (
    <div className={readOnly ? undefined : 'min-h-dvh pb-24'}>
      {!readOnly && (
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Caisse{restaurantName ? ` · ${restaurantName}` : ''}
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
              soundOn ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30' : 'bg-stone-100 text-stone-600'
            }`}
          >
            {soundOn ? 'Son activé' : 'Activer le son'}
          </button>
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

      <div className={readOnly ? 'space-y-6' : 'mx-auto max-w-5xl space-y-6 p-4'}>
        {(error || actionError) && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {actionError ?? error}
          </p>
        )}

        {readOnly && (
          <p className="rounded-2xl bg-stone-100 px-4 py-3 text-sm font-medium text-stone-600">
            Consultation seule : le gérant peut voir les commandes et les reçus, mais pas encaisser ni gérer une caisse.
          </p>
        )}

        {/* Ma caisse */}
        {!readOnly && (
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
          {session ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold tracking-tight">Ma caisse est ouverte</h2>
                  <p className="text-xs text-stone-500">Depuis {timeFr(session.openedAt)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCounterOpen(true)}
                    className="flex items-center gap-1.5 rounded-2xl bg-brand-500 px-4 py-2.5 font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97]"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Nouvelle commande
                  </button>
                  <button
                    type="button"
                    onClick={() => setClosing(session)}
                    className="rounded-2xl bg-stone-100 px-4 py-2.5 font-medium text-stone-700 transition active:scale-[0.97]"
                  >
                    Clôturer
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Fond de caisse" value={fcfa(session.openingFloatFcfa)} />
                <Stat label={`Encaissé (${session.collectedCount})`} value={fcfa(session.collectedFcfa)} />
                <Stat label={`Remboursé (${session.refundedCount})`} value={fcfa(session.refundedFcfa)} />
                <Stat label="Argent attendu" value={fcfa(session.expectedFcfa)} strong />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="font-semibold tracking-tight">Ma caisse est fermée</h2>
                <p className="text-sm text-stone-500">
                  Ouvrez-la avec votre fond de caisse pour pouvoir encaisser.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  inputMode="numeric"
                  value={float}
                  onChange={(e) => setFloat(e.target.value)}
                  placeholder="Fond de caisse (FCFA)"
                  aria-label="Fond de caisse"
                  className="min-w-48 flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={openSession}
                  disabled={opening}
                  className="rounded-2xl bg-stone-900 px-5 py-3 font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.97] disabled:opacity-60"
                >
                  {opening ? 'Ouverture…' : 'Ouvrir ma caisse'}
                </button>
                <button
                  type="button"
                  onClick={() => setCounterOpen(true)}
                  className="rounded-2xl bg-stone-100 px-5 py-3 font-medium text-stone-700"
                >
                  Nouvelle commande
                </button>
              </div>
            </div>
          )}
        </section>
        )}

        {/* Commandes */}
        <section>
          <div className="mb-3 flex gap-2">
            <button type="button" className={tab(scope === 'unpaid')} onClick={() => setScope('unpaid')}>
              À encaisser
            </button>
            <button type="button" className={tab(scope === 'today')} onClick={() => setScope('today')}>
              Aujourd'hui
            </button>
          </div>

          {loading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl bg-stone-200/60" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-400">
              {scope === 'unpaid' ? 'Aucune commande à encaisser' : 'Aucune commande aujourd’hui'}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {[...orders]
                .sort((a, b) => Number(awaitingValidation(b)) - Number(awaitingValidation(a)))
                .map((o) => (
                <OrderRow
                  key={o.id}
                  order={o}
                  hasSession={Boolean(session)}
                  readOnly={readOnly}
                  onCollect={() => setCollecting(o)}
                  onVerify={() => setVerifying(o)}
                  onReceipt={() => setReceiptId(o.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {collecting && (
        <CollectSheet
          restaurantId={restaurantId}
          order={collecting}
          onClose={() => setCollecting(null)}
          onPaid={() => void reload()}
          onReceipt={(id) => setReceiptId(id)}
        />
      )}

      {verifying && (
        <MobileMoneySheet
          restaurantId={restaurantId}
          order={verifying}
          onClose={() => setVerifying(null)}
          onDone={() => void reload()}
        />
      )}

      {closing && (
        <CloseSessionSheet
          restaurantId={restaurantId}
          session={closing}
          onClose={() => setClosing(null)}
          onClosed={() => void reload()}
        />
      )}

      {counterOpen && (
        <CounterOrderSheet
          restaurantId={restaurantId}
          session={session}
          onClose={() => setCounterOpen(false)}
          onCreated={({ orderId, paid }) => {
            setCounterOpen(false);
            void reload();
            if (paid) setReceiptId(orderId);
          }}
        />
      )}

      {receiptId && (
        <ReceiptSheet
          restaurantId={restaurantId}
          orderId={receiptId}
          onClose={() => setReceiptId(null)}
        />
      )}
    </div>
  );
}

export default function CashierPage() {
  return (
    <RequireRole roles={['CASHIER', 'MANAGER']}>
      {({ restaurantId, role }) =>
        role === 'MANAGER' ? (
          <StaffLayout restaurantId={restaurantId} title="Caisse">
            <Cashier key={restaurantId} restaurantId={restaurantId} readOnly />
          </StaffLayout>
        ) : (
          <Cashier key={restaurantId} restaurantId={restaurantId} readOnly={false} />
        )
      }
    </RequireRole>
  );
}