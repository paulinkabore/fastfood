import { useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { authRequest } from '../lib/auth';
import { fcfa, parseAmount } from '../lib/format';
import type { CashSessionView } from '../lib/types';
import { Sheet } from './Sheet';
import { CheckIcon, CloseIcon } from './icons';

export function CloseSessionSheet({
  restaurantId,
  session,
  onClose,
  onClosed,
}: {
  restaurantId: string;
  session: CashSessionView;
  onClose: () => void;
  onClosed: () => void;
}) {
  const lock = useRef(false);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CashSessionView | null>(null);

  const entered = counted.trim() !== '';
  const amount = parseAmount(counted);
  const diff = amount - session.expectedFcfa;
  const noteOk = diff === 0 || note.trim().length >= 3;

  const submit = async () => {
    if (lock.current || !entered || !noteOk) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await authRequest<{ session: CashSessionView }>(
        `/restaurants/${restaurantId}/cash-sessions/${session.id}/close`,
        {
          method: 'POST',
          body: JSON.stringify({
            countedAmountFcfa: amount,
            note: diff !== 0 ? note.trim() : undefined,
          }),
        },
      );
      setResult(data.session);
      onClosed();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const row = 'flex items-center justify-between py-2.5';

  return (
    <Sheet label="Clôturer la caisse" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Clôturer ma caisse</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-600"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {result ? (
        <div className="space-y-5 px-5 py-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <CheckIcon className="h-7 w-7" />
          </span>
          <p className="text-xl font-semibold tracking-tight">Caisse clôturée</p>
          <div className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4 text-left text-sm">
            <p className={row}>
              <span className="text-stone-500">Attendu</span>
              <span className="font-semibold">{fcfa(session.expectedFcfa)}</span>
            </p>
            <p className={row}>
              <span className="text-stone-500">Compté</span>
              <span className="font-semibold">{fcfa(result.closingAmountFcfa ?? 0)}</span>
            </p>
            <p className={row}>
              <span className="text-stone-500">Écart</span>
              <span
                className={`font-semibold ${
                  (result.differenceFcfa ?? 0) === 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {(result.differenceFcfa ?? 0) > 0 ? '+' : ''}
                {fcfa(result.differenceFcfa ?? 0)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-stone-900 px-5 py-4 font-semibold text-white"
          >
            Terminer
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="divide-y divide-stone-100 rounded-2xl bg-stone-50 px-4 text-sm">
              <p className={row}>
                <span className="text-stone-500">Fond de caisse</span>
                <span className="font-semibold">{fcfa(session.openingFloatFcfa)}</span>
              </p>
              <p className={row}>
                <span className="text-stone-500">Encaissé ({session.collectedCount})</span>
                <span className="font-semibold">{fcfa(session.collectedFcfa)}</span>
              </p>
              <p className={row}>
                <span className="text-stone-500">Remboursé ({session.refundedCount})</span>
                <span className="font-semibold">− {fcfa(session.refundedFcfa)}</span>
              </p>
              <p className={row}>
                <span className="font-medium text-stone-700">Argent attendu</span>
                <span className="text-base font-semibold">{fcfa(session.expectedFcfa)}</span>
              </p>
            </div>

            <div>
              <label htmlFor="counted" className="mb-1.5 block text-sm font-semibold text-stone-700">
                Argent compté dans le tiroir
              </label>
              <input
                id="counted"
                inputMode="numeric"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="Comptez puis saisissez le total"
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-xl font-semibold outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </div>

            {entered && (
              <div
                className={`rounded-2xl px-4 py-3 font-medium ${
                  diff === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
                }`}
              >
                {diff === 0
                  ? 'La caisse est juste.'
                  : diff > 0
                    ? `Excédent de ${fcfa(diff)}`
                    : `Il manque ${fcfa(-diff)}`}
              </div>
            )}

            {entered && diff !== 0 && (
              <div>
                <label htmlFor="note" className="mb-1.5 block text-sm font-semibold text-stone-700">
                  Explication de l'écart (obligatoire)
                </label>
                <textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  rows={2}
                  className="w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
                />
              </div>
            )}

            {error && (
              <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={submit}
              disabled={!entered || !noteOk || busy}
              className="w-full rounded-2xl bg-stone-900 px-5 py-4 font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? 'Clôture…' : 'Clôturer la caisse'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}