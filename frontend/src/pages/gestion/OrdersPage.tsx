import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReasonSheet } from '../../components/orders/ReasonSheet';
import { ReceiptSheet } from '../../components/ReceiptSheet';
import { RequireRole } from '../../components/RequireRole';
import { StaffLayout } from '../../components/StaffLayout';
import { useLiveOrders } from '../../features/orders/useLiveOrders';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { fcfa, timeFr } from '../../lib/format';
import type { CashierOrder, OrderStatus } from '../../lib/types';
import { placeLabel } from '../../lib/orderPlace';

type Filter = 'all' | 'active' | 'unpaid' | 'done' | 'cancelled';

const ACTIVE: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY'];

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


const METHOD: Record<string, string> = { CASH: 'Espèces', MOBILE_MONEY: 'Mobile Money' };

const matches = (o: CashierOrder, f: Filter) => {
  switch (f) {
    case 'active':
      return ACTIVE.includes(o.status);
    case 'unpaid':
      return o.paymentStatus === 'PENDING' && o.status !== 'CANCELLED';
    case 'done':
      return o.status === 'SERVED';
    case 'cancelled':
      return o.status === 'CANCELLED';
    default:
      return true;
  }
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
      <p className="text-xs font-medium text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-stone-400">{hint}</p>}
    </div>
  );
}

type Dialog = { kind: 'cancel' | 'refund'; order: CashierOrder };

function Orders({ restaurantId }: { restaurantId: string }) {
  const base = `/restaurants/${restaurantId}`;
  const { orders, loading, error: loadError, live, reload } = useLiveOrders(restaurantId);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogCode, setDialogCode] = useState<string | null>(null);

  const stats = useMemo(() => {
    const sum = (list: CashierOrder[]) => list.reduce((s, o) => s + o.totalFcfa, 0);
    const alive = orders.filter((o) => o.status !== 'CANCELLED');
    const paid = orders.filter((o) => o.paymentStatus === 'PAID');
    const unpaid = orders.filter((o) => o.paymentStatus === 'PENDING' && o.status !== 'CANCELLED');
    return {
      count: alive.length,
      paidTotal: sum(paid),
      paidCount: paid.length,
      unpaidTotal: sum(unpaid),
      unpaidCount: unpaid.length,
      cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
    };
  }, [orders]);

  const counts: Record<Filter, number> = {
    all: orders.length,
    active: orders.filter((o) => matches(o, 'active')).length,
    unpaid: orders.filter((o) => matches(o, 'unpaid')).length,
    done: orders.filter((o) => matches(o, 'done')).length,
    cancelled: orders.filter((o) => matches(o, 'cancelled')).length,
  };

  const digits = search.replace(/\D/g, '');
  const shown = [...orders]
    .filter((o) => matches(o, filter))
    .filter((o) => !digits || String(o.number).includes(digits))
    .reverse(); // les plus récentes d'abord

  const submitDialog = async (reason: string) => {
    if (!dialog || busy) return;
    const { kind, order } = dialog;
    setBusy(order.id);
    setDialogError(null);
    setDialogCode(null);
    try {
      if (kind === 'cancel') {
        await authRequest(`${base}/orders/${order.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'CANCELLED', reason }),
        });
      } else {
        await authRequest(`${base}/orders/${order.id}/refund`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
      }
      await reload();
      setDialog(null);
      setMessage(
        kind === 'cancel'
          ? `Commande #${order.number} annulée`
          : `Commande #${order.number} remboursée (${fcfa(order.totalFcfa)})`,
      );
    } catch (e) {
      setDialogError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      setDialogCode(e instanceof ApiError ? e.code : null);
    } finally {
      setBusy(null);
    }
  };

  const pill = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
    }`;

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Toutes' },
    { id: 'active', label: 'En cours' },
    { id: 'unpaid', label: 'À payer' },
    { id: 'done', label: 'Terminées' },
    { id: 'cancelled', label: 'Annulées' },
  ];

  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Commandes du jour" value={String(stats.count)} hint="hors annulées" />
        <Stat
          label="Encaissé"
          value={fcfa(stats.paidTotal)}
          hint={`${stats.paidCount} commande${stats.paidCount > 1 ? 's' : ''} payée${stats.paidCount > 1 ? 's' : ''}`}
        />
        <Stat
          label="À encaisser"
          value={fcfa(stats.unpaidTotal)}
          hint={`${stats.unpaidCount} commande${stats.unpaidCount > 1 ? 's' : ''}`}
        />
        <Stat label="Annulées" value={String(stats.cancelled)} />
      </section>

      {loadError && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {loadError}
        </p>
      )}
      {message && (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {message}
        </p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className={pill(filter === f.id)} onClick={() => setFilter(f.id)}>
                {f.label} ({counts[f.id]})
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <p className="flex items-center gap-2 text-xs text-stone-500">
              <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'animate-pulse bg-red-500'}`} />
              {live ? 'Temps réel' : 'Reconnexion…'}
            </p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              inputMode="numeric"
              placeholder="N° de commande"
              aria-label="Rechercher par numéro"
              className="w-40 rounded-2xl border border-stone-200 bg-white px-4 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-3xl bg-stone-200/60" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-14 text-center text-sm text-stone-400">
          Aucune commande ici aujourd’hui.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((o) => {
            const st = STATUS[o.status];
            const pay = PAYMENT[o.paymentStatus];
            const paid = o.payments.find((p) => p.status === 'PAID' || p.status === 'REFUNDED');
            const canRefund = o.paymentStatus === 'PAID' && paid?.method === 'CASH';
            const mobilePaid = o.paymentStatus === 'PAID' && paid?.method === 'MOBILE_MONEY';
            const hasReceipt = o.paymentStatus === 'PAID' || o.paymentStatus === 'REFUNDED';

            return (
              <article key={o.id} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-semibold tracking-tight">#{o.number}</p>
                    <p className="text-sm text-stone-500">
                      {placeLabel(o)} · {timeFr(o.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.style}`}>{st.label}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pay.style}`}>{pay.label}</span>
                  </div>
                </div>

                <ul className="mt-3 space-y-0.5 text-sm text-stone-600">
                  {o.items.map((i, k) => (
                    <li key={k}>
                      {i.quantity} × {i.productName}
                      {i.options.length > 0 && <span className="text-stone-400"> (+ {i.options.join(', ')})</span>}
                    </li>
                  ))}
                </ul>
                {o.notes && (
                  <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{o.notes}</p>
                )}

                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-lg font-semibold">{fcfa(o.totalFcfa)}</p>
                  {paid && (
                    <p className="text-xs text-stone-400">
                      {METHOD[paid.method] ?? paid.method}
                      {paid.receiptNumber ? ` · reçu n° ${paid.receiptNumber}` : ''}
                    </p>
                  )}
                </div>

                {mobilePaid && (
                  <p className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    Payée par Mobile Money : le remboursement se fait auprès du prestataire (non disponible ici).
                  </p>
                )}
                {o.paymentStatus === 'PENDING' && o.status !== 'CANCELLED' && (
                  <p className="mt-2 text-xs text-stone-400">À encaisser depuis l’écran Caisse.</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                  {hasReceipt && (
                    <button
                      type="button"
                      onClick={() => setReceiptId(o.id)}
                      className="rounded-xl bg-stone-100 px-3.5 py-2 text-sm font-medium text-stone-700 transition active:scale-[0.97]"
                    >
                      Reçu
                    </button>
                  )}
                  {canRefund && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        setDialogError(null);
                        setDialogCode(null);
                        setDialog({ kind: 'refund', order: o });
                      }}
                      className="rounded-xl bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 transition active:scale-[0.97] disabled:opacity-50"
                    >
                      Rembourser
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {dialog && (
        <ReasonSheet
          key={`${dialog.kind}:${dialog.order.id}`}
          title={
            dialog.kind === 'cancel'
              ? `Annuler la commande #${dialog.order.number} ?`
              : `Rembourser la commande #${dialog.order.number} ?`
          }
          text={
            dialog.kind === 'cancel'
              ? 'La commande est annulée. Si la préparation avait commencé, le stock des ingrédients est remis.'
              : `${fcfa(dialog.order.totalFcfa)} sortent de la caisse. Si la commande est encore en cours, elle est annulée et le stock remis.`
          }
          confirmLabel={dialog.kind === 'cancel' ? 'Annuler la commande' : 'Rembourser'}
          chips={
            dialog.kind === 'cancel'
              ? ['Client parti', 'Erreur de saisie', 'Produit indisponible']
              : ['Erreur de saisie', 'Client mécontent', 'Produit indisponible']
          }
          busy={busy !== null}
          error={dialogError}
          errorExtra={
            dialogCode === 'NO_OPEN_SESSION' ? (
              <Link to="/caisse" className="inline-block text-sm font-semibold text-red-800 underline">
                Ouvrir ma caisse
              </Link>
            ) : undefined
          }
          onSubmit={(r) => void submitDialog(r)}
          onClose={() => setDialog(null)}
        />
      )}

      {receiptId && (
        <ReceiptSheet restaurantId={restaurantId} orderId={receiptId} onClose={() => setReceiptId(null)} />
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <RequireRole roles={['MANAGER']}>
      {({ restaurantId }) => (
        <StaffLayout restaurantId={restaurantId} title="Commandes du jour">
          <Orders restaurantId={restaurantId} />
        </StaffLayout>
      )}
    </RequireRole>
  );
}