import { useEffect, useState } from 'react';
import { fcfa, parseAmount } from '../lib/format';

// État du bon de monnaie : le caissier saisit la monnaie qu'il n'a pas, le reste est rendu tout de suite
export function useVoucher(change: number) {
  const [on, setOn] = useState(false);
  const [text, setText] = useState(String(change));
  useEffect(() => {
    setText(String(change));
  }, [change]);
  useEffect(() => {
    if (change <= 0) setOn(false);
  }, [change]);
  const value = parseAmount(text);
  const valid = !on || (value >= 1 && value <= change);
  // Montant du bon à envoyer au serveur (undefined = pas de bon)
  const amount = on && valid ? value : undefined;
  return { on, setOn, text, setText, valid, amount };
}

export function ChangeVoucherPanel({
  change,
  voucher,
}: {
  change: number;
  voucher: ReturnType<typeof useVoucher>;
}) {
  const { on, setOn, text, setText, valid } = voucher;
  const value = parseAmount(text);

  if (!on) {
    return (
      <button
        type="button"
        onClick={() => setOn(true)}
        className="w-full rounded-2xl bg-amber-50 px-5 py-3.5 font-semibold text-amber-800 ring-1 ring-amber-200 transition active:scale-[0.98]"
      >
        Je n’ai pas toute la monnaie
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <div className="flex items-center justify-between">
        <label htmlFor="voucher-amount" className="block text-sm font-semibold text-amber-900">
          Monnaie que je n’ai pas (FCFA)
        </label>
        <button
          type="button"
          onClick={() => setOn(false)}
          className="text-sm font-medium text-amber-800 underline"
        >
          Annuler
        </button>
      </div>
      <div className="flex gap-2">
        <input
          id="voucher-amount"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
          className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-lg font-semibold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
        />
        <button
          type="button"
          onClick={() => setText(String(change))}
          className="rounded-xl bg-white px-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200"
        >
          Tout
        </button>
      </div>
      {valid ? (
        <>
          <p className="flex justify-between text-sm font-medium text-amber-900">
            <span>À rendre maintenant : {fcfa(change - value)}</span>
            <span>Bon : {fcfa(value)}</span>
          </p>
          <p className="text-xs text-amber-800">
            En confirmant, le bon et le reçu de caisse s’impriment automatiquement.
          </p>
        </>
      ) : (
        <p className="text-sm font-medium text-red-700">Saisissez un montant entre 1 et {fcfa(change)}.</p>
      )}
    </div>
  );
}
