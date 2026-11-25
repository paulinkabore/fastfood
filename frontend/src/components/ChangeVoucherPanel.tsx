import { useEffect, useState } from 'react';
import { fcfa, parseAmount } from '../lib/format';

// Le caissier saisit la monnaie qu'il n'a pas : elle devient un bon, le reste est rendu tout de suite
export function ChangeVoucherPanel({
  change,
  busy,
  onPrint,
}: {
  change: number;
  busy: boolean;
  onPrint: (voucherFcfa: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(change));

  useEffect(() => {
    setValue(String(change));
  }, [change]);

  const voucher = parseAmount(value);
  const valid = voucher >= 1 && voucher <= change;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="w-full rounded-2xl bg-amber-50 px-5 py-3.5 font-semibold text-amber-800 ring-1 ring-amber-200 transition active:scale-[0.98] disabled:opacity-50"
      >
        Je n’ai pas toute la monnaie
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <label htmlFor="voucher-amount" className="block text-sm font-semibold text-amber-900">
        Monnaie que je n’ai pas (FCFA)
      </label>
      <div className="flex gap-2">
        <input
          id="voucher-amount"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-lg font-semibold outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
        />
        <button
          type="button"
          onClick={() => setValue(String(change))}
          className="rounded-xl bg-white px-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200"
        >
          Tout
        </button>
      </div>
      {valid ? (
        <p className="flex justify-between text-sm font-medium text-amber-900">
          <span>À rendre maintenant : {fcfa(change - voucher)}</span>
          <span>Bon : {fcfa(voucher)}</span>
        </p>
      ) : (
        <p className="text-sm font-medium text-red-700">
          Saisissez un montant entre 1 et {fcfa(change)}.
        </p>
      )}
      <button
        type="button"
        onClick={() => onPrint(voucher)}
        disabled={busy || !valid}
        className="w-full rounded-2xl bg-amber-500 px-5 py-3.5 font-semibold text-white shadow-md shadow-amber-500/25 transition active:scale-[0.98] disabled:opacity-50"
      >
        {valid ? `Imprimer un bon de ${fcfa(voucher)}` : 'Imprimer le bon'}
      </button>
    </div>
  );
}
