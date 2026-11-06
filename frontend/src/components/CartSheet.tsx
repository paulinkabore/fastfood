import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { usePublicConfig } from '../lib/config';
import { fcfa } from '../lib/format';
import { unitPrice, type Cart } from '../features/order/useCart';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';
import { CheckIcon, CloseIcon } from './icons';

type Method = 'CASH' | 'MOBILE_MONEY';

function MethodCard({
  active,
  title,
  text,
  onSelect,
}: {
  active: boolean;
  title: string;
  text: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
        active ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'
      }`}
    >
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition ${
          active ? 'border-brand-500 bg-brand-500 text-white' : 'border-stone-300'
        }`}
      >
        {active && <CheckIcon className="h-3.5 w-3.5" />}
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-stone-600">{text}</span>
      </span>
    </button>
  );
}

export function CartSheet({
  token,
  cart,
  onClose,
}: {
  token: string;
  cart: Cart;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const submitting = useRef(false); // verrou immédiat contre le double clic
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('CASH');
  const { mobileMoney } = usePublicConfig();

  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const { order } = await api.createOrder(token, {
        idempotencyKey: cart.idempotencyKey,
        notes: cart.notes.trim() || undefined,
        items: cart.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          optionIds: l.options.map((o) => o.id),
          notes: l.notes,
        })),
      });
      cart.clear();

      if (method === 'MOBILE_MONEY') {
        try {
          const { checkoutUrl } = await api.payMobileMoney(order.id);
          window.location.assign(checkoutUrl); // page de paiement du prestataire
          return;
        } catch {
          /* la commande existe : le client pourra payer depuis la page de suivi */
        }
      }
      navigate(`/commande/${order.id}`, { state: { token } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue, réessayez.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <Sheet label="Mon panier" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Mon panier</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-600"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
        <ul className={`divide-y divide-stone-100 ${loading ? 'pointer-events-none opacity-60' : ''}`}>
          {cart.lines.map((line) => (
            <li key={line.key} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{line.name}</p>
                {line.options.length > 0 && (
                  <p className="text-sm text-stone-500">
                    {line.options.map((o) => o.name).join(', ')}
                  </p>
                )}
                {line.notes && <p className="text-sm italic text-stone-400">« {line.notes} »</p>}
                <p className="mt-1 text-sm font-semibold">
                  {fcfa(unitPrice(line) * line.quantity)}
                </p>
              </div>
              <Stepper
                value={line.quantity}
                min={0}
                onChange={(q) => cart.setQuantity(line.key, q)}
              />
            </li>
          ))}
        </ul>

        <div>
          <label htmlFor="order-note" className="mb-2 block text-sm font-semibold text-stone-700">
            Remarque pour la commande
          </label>
          <textarea
            id="order-note"
            value={cart.notes}
            onChange={(e) => cart.setNotes(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Facultatif"
            className="w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
          />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-stone-700">Paiement</h3>
          <div className="space-y-2">
            <MethodCard
              active={method === 'CASH'}
              title="Espèces à la caisse"
              text="Vous réglez auprès du caissier, quand vous le souhaitez."
              onSelect={() => setMethod('CASH')}
            />
            {mobileMoney && (
              <MethodCard
                active={method === 'MOBILE_MONEY'}
                title="Mobile Money"
                text="Vous payez maintenant sur votre téléphone, en toute sécurité."
                onSelect={() => setMethod('MOBILE_MONEY')}
              />
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}
      </div>

      <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-stone-500">Total</span>
          <span className="text-lg font-semibold">{fcfa(cart.subtotal)}</span>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={loading || cart.lines.length === 0}
          className="w-full rounded-2xl bg-stone-900 px-5 py-4 font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.98] disabled:opacity-60"
        >
          {loading
            ? 'Envoi en cours…'
            : method === 'MOBILE_MONEY'
              ? 'Commander et payer'
              : 'Confirmer la commande'}
        </button>
      </div>
    </Sheet>
  );
}