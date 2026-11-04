import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { dateTimeFr } from '../../lib/format';
import { MOVEMENT_LABEL, qty, type Ingredient, type Movement } from '../../features/stock/stock';

export function MovementsTab({
  restaurantId,
  ingredients,
}: {
  restaurantId: string;
  ingredients: Ingredient[];
}) {
  const [ingredientId, setIngredientId] = useState('');
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const filter = ingredientId ? `&ingredientId=${ingredientId}` : '';
    authRequest<{ movements: Movement[] }>(`/restaurants/${restaurantId}/stock/movements?limit=100${filter}`)
      .then((d) => {
        if (!cancelled) {
          setRows(d.movements);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, ingredientId]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold tracking-tight">
          Derniers mouvements <span className="text-stone-400">({rows.length})</span>
        </h2>
        <select
          value={ingredientId}
          onChange={(e) => setIngredientId(e.target.value)}
          aria-label="Filtrer par ingrédient"
          className="rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">Tous les ingrédients</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-3xl bg-stone-200/60" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-14 text-center text-sm text-stone-400">
          Aucun mouvement pour l’instant.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-3xl bg-white px-5 shadow-sm ring-1 ring-stone-200/70">
          {rows.map((m) => {
            const label = MOVEMENT_LABEL[m.type];
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${label.style}`}>
                      {label.label}
                    </span>
                    <span className="font-medium">{m.ingredientName}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {dateTimeFr(m.createdAt)}
                    {m.byName ? ` · ${m.byName}` : ''}
                    {m.orderNumber ? ` · commande #${m.orderNumber}` : ''}
                    {m.reason ? ` · ${m.reason}` : ''}
                  </p>
                </div>
                <p
                  className={`text-lg font-semibold tabular-nums ${
                    m.quantity < 0 ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {m.quantity > 0 ? '+' : ''}
                  {qty(m.quantity)} <span className="text-sm font-medium text-stone-400">{m.unit}</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}