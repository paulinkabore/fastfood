import { useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { authRequest } from '../lib/auth';
import { fcfa } from '../lib/format';
import type { CashierOrder } from '../lib/types';
import { Sheet } from './Sheet';
import { CloseIcon } from './icons';

const REASONS = ['Paiement non reçu', 'Montant incorrect', 'Numéro incorrect'];

// Le caissier compare le numéro et le montant avec le message de l'opérateur, puis valide ou refuse
export function MobileMoneySheet({
  restaurantId,
  order,
  onClose,
  onDone,
}: {
  restaurantId: string;
  order: CashierOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const payerPhone =
    order.payments.find((p) => p.method === 'MOBILE_MONEY' && p.status === 'PENDING')?.payerPhone ?? null;

  const act = async (path: 'validate' | 'reject', body?: object) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await authRequest(`/restaurants/${restaurantId}/orders/${order.id}/pay/mobile-money/${path}`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet label="Vérifier le paiement Mobile Money" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Paiement Mobile Money · #{order.number}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-600"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <div className="rounded-2xl bg-stone-900 p-5 text-white">
          <p className="text-xs font-medium text-stone-300">Montant à retrouver dans le message de l’opérateur</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{fcfa(order.totalFcfa)}</p>
        </div>

        <div className="rounded-2xl bg-stone-50 p-4">
          <p className="text-xs font-medium text-stone-500">Numéro utilisé pour le dépôt</p>
          <p className="mt-1 text-xl font-semibold tracking-wide">{payerPhone ?? '—'}</p>
        </div>

        <p className="text-sm text-stone-500">
          Vérifiez que le numéro et le montant correspondent au message reçu de l’opérateur. Une fois validée,
          la commande part en cuisine et le client reçoit son reçu.
        </p>

        {rejecting && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-stone-700">Motif du refus</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    reason === r ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="Ou écrivez un motif"
              aria-label="Motif du refus"
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </div>
        )}

        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}
      </div>

      <div className="space-y-2 border-t border-stone-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {rejecting ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(false)}
              className="rounded-2xl bg-stone-100 px-5 py-4 font-medium text-stone-700 disabled:opacity-50"
            >
              Retour
            </button>
            <button
              type="button"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void act('reject', { reason: reason.trim() })}
              className="rounded-2xl bg-red-600 px-5 py-4 font-semibold text-white shadow-lg shadow-red-600/25 transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Envoi…' : 'Refuser'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(true)}
              className="rounded-2xl bg-red-50 px-5 py-4 font-medium text-red-700 disabled:opacity-50"
            >
              Refuser
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('validate')}
              className="rounded-2xl bg-emerald-600 px-5 py-4 font-semibold text-white shadow-lg shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Validation…' : 'Valider le paiement'}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
