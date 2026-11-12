import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../lib/api';
import { Row, Sep, TicketFooter, TicketHeader, TicketItems, dateFr, ticketFont, timeShort } from './TicketParts';
import { printTicket } from '../lib/print';
import { authRequest } from '../lib/auth';
import { fcfa } from '../lib/format';
import type { ReceiptView } from '../lib/types';
import { Sheet } from './Sheet';
import { CloseIcon } from './icons';
import { placeLabel } from '../lib/orderPlace';

function ReceiptBody({ r }: { r: ReceiptView }) {
  return (
    <div
      className="relative isolate mx-auto w-full max-w-[80mm] overflow-hidden"
      style={ticketFont}
    >
      <TicketHeader title="REÇU DE PAIEMENT" restaurantName={r.restaurantName} />
      <Row left="Reçu n°" right={r.receiptNumber ?? '-'} bold size="14px" />
      <Row left="Commande" right={`#${r.orderNumber}`} />
      <Row left="Date" right={dateFr(r.issuedAt)} />
      <Row left="Heure" right={timeShort(r.issuedAt)} />
      <Row left="Service" right={placeLabel({ tableLabel: r.tableLabel, type: r.orderType })} />
      {r.cashierName && <Row left="Caissier" right={r.cashierName} />}
      <Sep />
      <TicketItems items={r.items} />
      <Sep double />
      <Row left="TOTAL PAYÉ" right={fcfa(r.totalFcfa)} bold size="16px" />
      <Row left="Mode de paiement" right={r.method === 'CASH' ? 'Espèces' : 'Mobile Money'} />
      {r.status === 'REFUNDED' && (
        <p style={{ textAlign: 'center', fontWeight: 700, margin: '6px 0 0' }}>*** REMBOURSÉ ***</p>
      )}
      <TicketFooter lines={['Merci de votre visite', 'À bientôt !', 'Conservez ce reçu']} />
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
            onClick={printTicket}
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