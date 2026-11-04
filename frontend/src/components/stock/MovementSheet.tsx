import { useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { uuid } from '../../lib/uuid';
import { parseDecimal, qty, validQty, withUnit, type Ingredient } from '../../features/stock/stock';
import { Sheet } from '../Sheet';
import { CloseIcon } from '../icons';

const field =
  'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

const CHIPS = {
  IN: ['Livraison', 'Achat au marché', 'Retour fournisseur'],
  LOSS: ['Périmé', 'Abîmé', 'Renversé', 'Erreur de préparation'],
};

export function MovementSheet({
  restaurantId,
  ingredient,
  kind,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  ingredient: Ingredient;
  kind: 'IN' | 'LOSS';
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  // Une même clé pour toutes les tentatives de cette fenêtre : un double clic ne crée qu'un mouvement
  const key = useRef(uuid());
  const lock = useRef(false);

  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const v = parseDecimal(value);
  const valid = validQty(v);
  const after = valid ? ingredient.quantity + (kind === 'IN' ? v : -v) : null;
  const isLoss = kind === 'LOSS';

  const submit = async () => {
    if (lock.current) return;
    if (!valid) return setError('Quantité invalide : nombre supérieur à 0, 3 décimales au maximum');
    if (isLoss && reason.trim().length < 3) return setError('Un motif est obligatoire pour une perte');
    if (reason.trim() && reason.trim().length < 3) return setError('Le motif est trop court');

    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await authRequest(`${base(restaurantId)}/ingredients/${ingredient.id}/movements`, {
        method: 'POST',
        body: JSON.stringify({
          type: kind,
          quantity: v,
          reason: reason.trim() || undefined,
          idempotencyKey: key.current,
        }),
      });
      onSaved(
        isLoss
          ? `Perte de ${withUnit(v, ingredient.unit)} enregistrée`
          : `${withUnit(v, ingredient.unit)} ajouté${v > 1 ? 's' : ''} au stock`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet label={isLoss ? 'Perte' : 'Entrée de stock'} onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {isLoss ? 'Enregistrer une perte' : 'Entrée de stock'} · {ingredient.name}
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

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <p className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
          Stock actuel : <span className="font-semibold">{withUnit(ingredient.quantity, ingredient.unit)}</span>
        </p>

        <div>
          <label htmlFor="m-qty" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Quantité ({ingredient.unit})
          </label>
          <input
            id="m-qty"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            autoFocus
            placeholder="0"
            className={`${field} text-xl font-semibold`}
          />
        </div>

        {after !== null && (
          <p
            className={`rounded-2xl px-4 py-3 text-sm font-medium ${
              after < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            Après l’opération : {qty(after)} {ingredient.unit}
          </p>
        )}

        <div>
          <label htmlFor="m-reason" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Motif {isLoss ? '(obligatoire)' : '(facultatif)'}
          </label>
          <input
            id="m-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            className={field}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {CHIPS[kind].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setReason(c)}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200"
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}
      </div>

      <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className={`w-full rounded-2xl px-5 py-4 font-semibold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60 ${
            isLoss ? 'bg-red-600 shadow-red-600/25' : 'bg-brand-500 shadow-brand-500/30'
          }`}
        >
          {busy ? 'Enregistrement…' : isLoss ? 'Enregistrer la perte' : 'Ajouter au stock'}
        </button>
      </div>
    </Sheet>
  );
}

const base = (restaurantId: string) => `/restaurants/${restaurantId}`;