import { useState } from 'react';
import { ApiError } from '../lib/api';
import { authRequest } from '../lib/auth';
import { fcfa } from '../lib/format';

type Applied = { code: string; amountFcfa: number; orderNumber: number };

// Le client présente un bon de monnaie : le caissier saisit son numéro, sa valeur est déduite du total
export function useVoucherUse(restaurantId: string) {
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<Applied | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const d = await authRequest<{ voucher: Applied }>(
        `/restaurants/${restaurantId}/change-vouchers/${encodeURIComponent(c)}`,
      );
      setApplied(d.voucher);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };
  const clear = () => {
    setApplied(null);
    setCode('');
    setError(null);
  };
  return { code, setCode, applied, error, busy, apply, clear };
}

export function VoucherUseField({ vu }: { vu: ReturnType<typeof useVoucherUse> }) {
  if (vu.applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
        <p className="text-sm font-medium text-emerald-800">
          Bon n° <span className="font-semibold tracking-widest">{vu.applied.code}</span> appliqué
          <span className="block text-lg font-semibold">− {fcfa(vu.applied.amountFcfa)}</span>
        </p>
        <button type="button" onClick={vu.clear} className="text-sm font-medium text-emerald-800 underline">
          Retirer
        </button>
      </div>
    );
  }
  return (
    <div>
      <label htmlFor="voucher-code" className="mb-1.5 block text-sm font-semibold text-stone-700">
        Le client a un bon de monnaie ?
      </label>
      <div className="flex gap-2">
        <input
          id="voucher-code"
          value={vu.code}
          onChange={(e) => vu.setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))}
          placeholder="Numéro du bon (6 caractères)"
          autoCapitalize="characters"
          maxLength={6}
          className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 font-semibold uppercase tracking-widest outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={() => void vu.apply()}
          disabled={vu.busy || vu.code.length < 4}
          className="rounded-2xl bg-stone-900 px-4 font-semibold text-white disabled:opacity-50"
        >
          {vu.busy ? '…' : 'Appliquer'}
        </button>
      </div>
      {vu.error && <p className="mt-2 text-sm font-medium text-red-700">{vu.error}</p>}
    </div>
  );
}
