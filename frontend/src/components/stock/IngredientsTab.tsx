import { useState } from 'react';
import { qty, withUnit, type Ingredient } from '../../features/stock/stock';
import { PlusIcon } from '../icons';
import { IngredientSheet } from './IngredientSheet';
import { MovementSheet } from './MovementSheet';

export function IngredientsTab({
  restaurantId,
  ingredients,
  loading,
  onChanged,
  onMessage,
}: {
  restaurantId: string;
  ingredients: Ingredient[];
  loading: boolean;
  onChanged: () => void;
  onMessage: (message: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);
  const [movement, setMovement] = useState<{ ingredient: Ingredient; kind: 'IN' | 'LOSS' } | null>(null);

  const lowCount = ingredients.filter((i) => i.isLow).length;
  const shown = filter === 'low' ? ingredients.filter((i) => i.isLow) : ingredients;

  const pill = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
    }`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button type="button" className={pill(filter === 'all')} onClick={() => setFilter('all')}>
            Tous ({ingredients.length})
          </button>
          <button type="button" className={pill(filter === 'low')} onClick={() => setFilter('low')}>
            En alerte ({lowCount})
          </button>
        </div>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 rounded-2xl bg-brand-500 px-5 py-2.5 font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97]"
        >
          <PlusIcon className="h-4 w-4" />
          Ajouter au stock
        </button>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-3xl bg-stone-200/60" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-14 text-center text-sm text-stone-400">
          {filter === 'low'
            ? 'Aucun ingrédient en alerte.'
            : 'Aucun ingrédient. Ajoutez le premier (par exemple Poulet, en kg).'}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((i) => {
            const target = i.alertThreshold > 0 ? i.alertThreshold * 3 : Math.max(i.quantity, 1);
            const pct = Math.max(0, Math.min(100, (i.quantity / target) * 100));
            const tone = i.isOut ? 'bg-red-500' : i.isLow ? 'bg-amber-500' : 'bg-emerald-500';
            const badge = i.isOut
              ? { label: 'Rupture', style: 'bg-red-50 text-red-700' }
              : i.isLow
                ? { label: 'Stock bas', style: 'bg-amber-50 text-amber-700' }
                : { label: 'OK', style: 'bg-emerald-50 text-emerald-700' };
            return (
              <article key={i.id} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold tracking-tight">{i.name}</h3>
                    {i.categoryName && (
                      <p className="text-xs font-medium text-brand-600">{i.categoryName}</p>
                    )}
                    <p className="text-sm text-stone-500">
                      Seuil d’alerte : {withUnit(i.alertThreshold, i.unit)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.style}`}>
                    {badge.label}
                  </span>
                </div>

                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  {qty(i.quantity)}{' '}
                  <span className="text-base font-medium text-stone-400">{i.unit}</span>
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                </div>
                {i.quantity < 0 && (
                  <p className="mt-2 text-xs text-red-600">
                    Stock négatif : plus de commandes que de stock. Faites un inventaire pour le corriger.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setMovement({ ingredient: i, kind: 'IN' })}
                    className="rounded-xl bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition active:scale-[0.97]"
                  >
                    + Entrée
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovement({ ingredient: i, kind: 'LOSS' })}
                    className="rounded-xl bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-700 transition active:scale-[0.97]"
                  >
                    − Perte
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(i)}
                    className="rounded-xl bg-stone-100 px-3.5 py-2 text-sm font-medium text-stone-700 transition active:scale-[0.97]"
                  >
                    Modifier
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <IngredientSheet
          key={editing === 'new' ? 'new' : editing.id}
          restaurantId={restaurantId}
          ingredient={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null);
            onMessage(m);
            onChanged();
          }}
        />
      )}

      {movement && (
        <MovementSheet
          key={`${movement.ingredient.id}:${movement.kind}`}
          restaurantId={restaurantId}
          ingredient={movement.ingredient}
          kind={movement.kind}
          onClose={() => setMovement(null)}
          onSaved={(m) => {
            setMovement(null);
            onMessage(m);
            onChanged();
          }}
        />
      )}
    </>
  );
}