import { useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { parseDecimal, qty, validQty, type Ingredient } from '../../features/stock/stock';

const field =
  'rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

type Change = {
  ingredientId: string;
  name: string;
  unit: string;
  before: number;
  after: number;
  difference: number;
};

export function InventoryTab({
  restaurantId,
  ingredients,
  onChanged,
  onMessage,
}: {
  restaurantId: string;
  ingredients: Ingredient[];
  onChanged: () => void;
  onMessage: (message: string) => void;
}) {
  const lock = useRef(false);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Change[] | null>(null);

  const filled = ingredients.filter((i) => (counts[i.id] ?? '').trim() !== '');

  const submit = async () => {
    if (lock.current || filled.length === 0) return;
    for (const i of filled) {
      if (!validQty(parseDecimal(counts[i.id]), true)) {
        return setError(`Quantité invalide pour « ${i.name} » : nombre positif, 3 décimales au maximum`);
      }
    }
    if (note.trim() && note.trim().length < 3) return setError('La note est trop courte');

    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const data = await authRequest<{ changes: Change[] }>(`/restaurants/${restaurantId}/stock/inventory`, {
        method: 'POST',
        body: JSON.stringify({
          note: note.trim() || undefined,
          counts: filled.map((i) => ({ ingredientId: i.id, countedQuantity: parseDecimal(counts[i.id]) })),
        }),
      });
      setResult(data.changes);
      setCounts({});
      setNote('');
      onMessage(
        data.changes.length === 0
          ? 'Inventaire enregistré : aucun écart'
          : `Inventaire enregistré : ${data.changes.length} ingrédient${data.changes.length > 1 ? 's' : ''} ajusté${data.changes.length > 1 ? 's' : ''}`,
      );
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  if (ingredients.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-14 text-center text-sm text-stone-400">
        Aucun ingrédient à compter.
      </p>
    );
  }

  return (
    <>
      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
        <h2 className="font-semibold tracking-tight">Inventaire</h2>
        <p className="mt-1 text-sm text-stone-500">
          Comptez ce qu’il y a vraiment en réserve et saisissez-le. Laissez vide ce que vous ne comptez pas.
          L’écart avec le stock théorique est enregistré.
        </p>

        <ul className="mt-4 divide-y divide-stone-100">
          {ingredients.map((i) => {
            const raw = counts[i.id] ?? '';
            const v = parseDecimal(raw);
            const diff = raw.trim() !== '' && validQty(v, true) ? v - i.quantity : null;
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{i.name}</p>
                  <p className="text-sm text-stone-500">
                    Théorique : {qty(i.quantity)} {i.unit}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {diff !== null && (
                    <span
                      className={`text-sm font-semibold ${
                        Math.abs(diff) < 1e-9 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-amber-600'
                      }`}
                    >
                      {Math.abs(diff) < 1e-9 ? 'Juste' : `${diff > 0 ? '+' : ''}${qty(diff)} ${i.unit}`}
                    </span>
                  )}
                  <input
                    value={raw}
                    onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="Compté"
                    aria-label={`Quantité comptée pour ${i.name}`}
                    className={`${field} w-28 text-right`}
                  />
                  <span className="w-10 text-sm text-stone-500">{i.unit}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4">
          <label htmlFor="inv-note" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Note (facultatif)
          </label>
          <input
            id="inv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Ex. Comptage du soir"
            className={`${field} w-full`}
          />
        </div>

        {error && (
          <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || filled.length === 0}
          className="mt-4 w-full rounded-2xl bg-stone-900 px-5 py-4 font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy
            ? 'Enregistrement…'
            : `Valider l’inventaire (${filled.length} ingrédient${filled.length > 1 ? 's' : ''} compté${filled.length > 1 ? 's' : ''})`}
        </button>
      </section>

      {result && (
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
          <h2 className="font-semibold tracking-tight">Dernier inventaire</h2>
          {result.length === 0 ? (
            <p className="mt-2 text-sm text-emerald-700">Tous les comptages correspondaient au stock théorique.</p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-100">
              {result.map((c) => (
                <li key={c.ingredientId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-stone-500">
                    {qty(c.before)} → <span className="font-semibold text-stone-900">{qty(c.after)}</span> {c.unit}{' '}
                    <span className={c.difference < 0 ? 'text-red-600' : 'text-amber-600'}>
                      ({c.difference > 0 ? '+' : ''}
                      {qty(c.difference)})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}