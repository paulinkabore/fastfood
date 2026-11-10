import { useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { authRequest } from '../lib/auth';
import { fcfa, parseAmount } from '../lib/format';
import type { CashierOrder } from '../lib/types';
import { Sheet } from './Sheet';
import { CheckIcon, CloseIcon } from './icons';
import { placeLabel } from '../lib/orderPlace';

const BILLS = [1000, 2000, 5000, 10000];

export function CollectSheet({
  restaurantId,
  order,
  onClose,
  onPaid,
  onReceipt,
}: {
  restaurantId: string;
  order: CashierOrder;
  onClose: () => void;
  onPaid: () => void;
  onReceipt: (orderId: string) => void;
}) {
  const lock = useRef(false); // verrou immédiat contre le double clic
  const [received, setReceived] = useState(String(order.totalFcfa));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ change: number | null } | null>(null);

  const amount = parseAmount(received);
  const change = amount - order.totalFcfa;
  const valid = amount >= order.totalFcfa;
  const quick = [order.totalFcfa, ...BILLS.filter((b) => b > order.totalFcfa)];

  const confirm = async () => {
    if (lock.current || !valid) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await authRequest<{ changeFcfa: number | null }>(
        `/restaurants/${restaurantId}/orders/${order.id}/pay/cash`,
        { method: 'POST', body: JSON.stringify({ amountReceivedFcfa: amount }) },
      );
      setDone({ change: data.changeFcfa });
      onPaid();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet label="Encaisser" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Commande #{order.number} · {placeLabel(order)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-600"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {done ? (
        <div className="space-y-5 px-5 py-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <CheckIcon className="h-7 w-7" />
          </span>
          <div>
            <p className="text-xl font-semibold tracking-tight">Paiement enregistré</p>
            <p className="mt-1 text-stone-500">{fcfa(order.totalFcfa)}</p>
          </div>
          {done.change !== null && done.change > 0 && (
            <div className="rounded-2xl bg-amber-50 px-4 py-4">
              <p className="text-sm font-medium text-amber-700">Monnaie à rendre</p>
              <p className="text-3xl font-semibold tracking-tight text-amber-800">
                {fcfa(done.change)}
              </p>
            </div>
          )}
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => {
                onReceipt(order.id);
                onClose();
              }}
              className="rounded-2xl bg-stone-900 px-5 py-4 font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.98]"
            >
              Afficher le reçu
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-stone-100 px-5 py-3.5 font-medium text-stone-700"
            >
              Terminer
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <ul className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4">
              {order.items.map((i, k) => (
                <li key={k} className="flex justify-between gap-3 py-2.5 text-sm">
                  <span>
                    {i.quantity} × {i.productName}
                    {i.options.length > 0 && (
                      <span className="block text-xs text-stone-500">+ {i.options.join(', ')}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium">{fcfa(i.unitPriceFcfa * i.quantity)}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-end justify-between">
              <span className="text-stone-500">Total à payer</span>
              <span className="text-3xl font-semibold tracking-tight">{fcfa(order.totalFcfa)}</span>
            </div>

            <div>
              <label htmlFor="received" className="mb-1.5 block text-sm font-semibold text-stone-700">
                Montant reçu
              </label>
              <input
                id="received"
                inputMode="numeric"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-xl font-semibold outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {quick.map((v, i) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setReceived(String(v))}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      amount === v
                        ? 'bg-stone-900 text-white'
                        : 'bg-white text-stone-600 ring-1 ring-stone-200'
                    }`}
                  >
                    {i === 0 ? 'Montant exact' : fcfa(v)}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`rounded-2xl px-4 py-3 ${
                valid ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
              }`}
            >
              {valid ? (
                <p className="flex items-center justify-between font-medium">
                  <span>Monnaie à rendre</span>
                  <span className="text-lg font-semibold">{fcfa(change)}</span>
                </p>
              ) : (
                <p className="font-medium">Il manque {fcfa(-change)}</p>
              )}
            </div>

            {error && (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={confirm}
              disabled={!valid || busy}
              className="w-full rounded-2xl bg-brand-500 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Enregistrement…' : `Confirmer l'encaissement · ${fcfa(order.totalFcfa)}`}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}