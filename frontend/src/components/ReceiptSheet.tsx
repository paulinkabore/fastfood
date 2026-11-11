import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../lib/api';
import { authRequest } from '../lib/auth';
import { dateTimeFr, fcfa } from '../lib/format';
import type { ReceiptView } from '../lib/types';
import { Sheet } from './Sheet';
import { CloseIcon } from './icons';
import { placeLabel } from '../lib/orderPlace';

function ReceiptBody({ r }: { r: ReceiptView }) {
  return (
    <div className="mx-auto w-full max-w-[80mm] text-sm text-stone-900">
      <div className="text-center">
        <p className="text-lg font-semibold">{r.restaurantName}</p>
        <p className="mt-1 text-xs text-stone-500">
          Reçu n° {r.receiptNumber ?? '-'} · {dateTimeFr(r.issuedAt)}
        </p>
        <p className="text-xs text-stone-500">
          Commande #{r.orderNumber} ·{' '}
          {placeLabel({ tableLabel: r.tableLabel, type: r.orderType })}
        </p>
      </div>

      <ul className="my-3 space-y-1.5 border-y border-dashed border-stone-300 py-3">
        {r.items.map((i, k) => (
          <li key={k} className="flex justify-between gap-3">
            <span>
              {i.quantity} × {i.productName}
              {i.options.length > 0 && (
                <span className="block text-xs text-stone-500">+ {i.options.join(', ')}</span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">{fcfa(i.lineTotalFcfa)}</span>
          </li>
        ))}
      </ul>

      <p className="flex justify-between text-base font-semibold">
        <span>Total</span>
        <span>{fcfa(r.totalFcfa)}</span>
      </p>
      <p className="mt-2 flex justify-between text-xs text-stone-500">
        <span>Paiement</span>
        <span>{r.method === 'CASH' ? 'Espèces' : 'Mobile Money'}</span>
      </p>
      {r.cashierName && (
        <p className="flex justify-between text-xs text-stone-500">
          <span>Caissier</span>
          <span>{r.cashierName}</span>
        </p>
      )}
      {r.status === 'REFUNDED' && (
        <p className="mt-3 text-center font-semibold">REMBOURSÉ</p>
      )}
      <p className="mt-4 text-center text-xs text-stone-500">Merci de votre visite</p>
    </div>
  );
}

export function ReceiptSheet({
  restaurantId,
  orderId,
  onClose,
  buttonLabel = 'Imprimer',
}: {
  restaurantId?: string; // absent : reçu du client (page de suivi)
  orderId: string;
  onClose: () => void;
  buttonLabel?: string;
}) {
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (restaurantId
      ? authRequest<{ receipt: ReceiptView }>(`/restaurants/${restaurantId}/orders/${orderId}/receipt`)
      : api.getReceipt(orderId)
    )
      .then((d) => {
        if (!cancelled) setReceipt(d.receipt);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, orderId]);

  return (
    <>
      <Sheet label="Reçu" onClose={onClose}>
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Reçu</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-600"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {error && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          {!receipt && !error && (
            <p className="animate-pulse text-center text-stone-400">Chargement…</p>
          )}
          {receipt && <ReceiptBody r={receipt} />}
        </div>

        <div className="border-t border-stone-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={!receipt}
            onClick={() => window.print()}
            className="w-full rounded-2xl bg-stone-900 px-5 py-4 font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.98] disabled:opacity-50"
          >
            {buttonLabel}
          </button>
        </div>
      </Sheet>

      {receipt &&
        createPortal(
          <div className="print-receipt">
            <ReceiptBody r={receipt} />
          </div>,
          document.body,
        )}
    </>
  );
}