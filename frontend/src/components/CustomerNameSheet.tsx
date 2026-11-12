import { useState } from 'react';
import { Sheet } from './Sheet';
import { ApiError } from '../lib/api';
import { authRequest } from '../lib/auth';
import type { CashierOrder } from '../lib/types';

// Le caissier note le nom du client d'une commande à emporter : le haut-parleur l'appellera
export function CustomerNameSheet({
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
  const [name, setName] = useState(order.customerName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= 2;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await authRequest(`/restaurants/${restaurantId}/cashier/orders/${order.id}/customer-name`, {
        method: 'POST',
        body: JSON.stringify({ customerName: name.trim() }),
      });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      setBusy(false);
    }
  };

  return (
    <Sheet label="Nom du client" onClose={onClose}>
      <form
        className="space-y-4 px-5 pb-6 pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Commande à emporter #{order.number}</h2>
          <p className="mt-1 text-sm text-stone-500">
            Nom du client : il sera appelé au haut-parleur quand la commande sera prête.
          </p>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Ex : Awa"
          aria-label="Nom du client"
          className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-lg outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
        />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={!valid || busy}
          className="w-full rounded-2xl bg-brand-500 px-4 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer le nom'}
        </button>
      </form>
    </Sheet>
  );
}
