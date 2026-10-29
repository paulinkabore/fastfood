import { useState } from 'react';
import type { MenuOption, MenuProduct } from '../lib/types';
import { fcfa } from '../lib/format';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';
import { CheckIcon, CloseIcon } from './icons';

export function ProductSheet({
  product,
  onClose,
  onAdd,
}: {
  product: MenuProduct;
  onClose: () => void;
  onAdd: (quantity: number, options: MenuOption[], notes: string) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  const chosen = product.options.filter((o) => selected.includes(o.id));
  const unit = product.priceFcfa + chosen.reduce((sum, o) => sum + o.priceDeltaFcfa, 0);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Sheet label={product.name} onClose={onClose}>
      <div className="relative">
        {product.imageUrl && (
          <img src={product.imageUrl} alt={product.name} className="h-52 w-full object-cover" />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-stone-700 shadow-md backdrop-blur"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{product.name}</h2>
          {product.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{product.description}</p>
          )}
          <p className="mt-3 text-lg font-semibold">{fcfa(product.priceFcfa)}</p>
          {product.allergens.length > 0 && (
            <p className="mt-2 inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              Allergènes : {product.allergens.join(', ')}
            </p>
          )}
        </div>

        {product.options.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-stone-700">Suppléments</h3>
            <ul className="space-y-2">
              {product.options.map((o) => {
                const on = selected.includes(o.id);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => toggle(o.id)}
                      className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition ${
                        on ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`grid h-5 w-5 place-items-center rounded-md border-2 transition ${
                            on ? 'border-brand-500 bg-brand-500 text-white' : 'border-stone-300'
                          }`}
                        >
                          {on && <CheckIcon className="h-3.5 w-3.5" />}
                        </span>
                        <span className="font-medium">{o.name}</span>
                      </span>
                      <span className="text-sm text-stone-500">
                        {o.priceDeltaFcfa > 0 ? `+ ${fcfa(o.priceDeltaFcfa)}` : 'Offert'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <label htmlFor="note" className="mb-2 block text-sm font-semibold text-stone-700">
            Note pour la cuisine
          </label>
          <textarea
            id="note"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Ex. sans oignon, bien cuit…"
            className="w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Stepper value={quantity} onChange={setQuantity} />
        <button
          type="button"
          onClick={() => onAdd(quantity, chosen, notes)}
          className="flex-1 rounded-2xl bg-brand-500 px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[0.98]"
        >
          Ajouter · {fcfa(unit * quantity)}
        </button>
      </div>
    </Sheet>
  );
}