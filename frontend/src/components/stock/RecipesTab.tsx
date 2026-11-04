import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { fcfa } from '../../lib/format';
import type { ProductRow } from '../../features/menu/menu';
import {
  parseDecimal,
  qty,
  validQty,
  type Ingredient,
  type RecipeLine,
  type RecipeRow,
} from '../../features/stock/stock';
import { Sheet } from '../Sheet';
import { CloseIcon, PlusIcon } from '../icons';

const field =
  'rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

type Line = { ingredientId: string; quantity: string };

function RecipeSheet({
  restaurantId,
  product,
  ingredients,
  initial,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  product: ProductRow;
  ingredients: Ingredient[];
  initial: RecipeLine[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [lines, setLines] = useState<Line[]>(
    initial.map((l) => ({
      ingredientId: l.ingredientId,
      quantity: String(l.quantityPerUnit).replace('.', ','),
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = new Set(lines.map((l) => l.ingredientId));
  const unitOf = (id: string) => ingredients.find((i) => i.id === id)?.unit ?? '';
  const canAdd = ingredients.some((i) => !used.has(i.id));

  const addLine = () => {
    const free = ingredients.find((i) => !used.has(i.id));
    if (free) setLines((l) => [...l, { ingredientId: free.id, quantity: '' }]);
  };

  const save = async () => {
    if (busy) return;
    for (const l of lines) {
      if (!validQty(parseDecimal(l.quantity))) {
        return setError('Chaque quantité doit être un nombre supérieur à 0 (3 décimales au maximum)');
      }
    }
    setBusy(true);
    setError(null);
    try {
      await authRequest(`/restaurants/${restaurantId}/products/${product.id}/recipe`, {
        method: 'PUT',
        body: JSON.stringify({
          items: lines.map((l) => ({
            ingredientId: l.ingredientId,
            quantityPerUnit: parseDecimal(l.quantity),
          })),
        }),
      });
      onSaved(
        lines.length === 0
          ? `Recette de « ${product.name} » supprimée`
          : `Recette de « ${product.name} » enregistrée`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet label="Recette" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Recette · {product.name}</h2>
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
        <p className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-500">
          Indiquez ce que consomme <span className="font-medium">une seule unité</span> de ce produit. Le stock
          est déduit quand la cuisine lance la préparation.
        </p>

        {lines.length === 0 && (
          <p className="text-sm text-stone-400">Aucun ingrédient : ce produit ne consomme pas de stock.</p>
        )}

        <ul className="space-y-3">
          {lines.map((l, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <select
                value={l.ingredientId}
                onChange={(e) =>
                  setLines((all) => all.map((x, i) => (i === idx ? { ...x, ingredientId: e.target.value } : x)))
                }
                aria-label="Ingrédient"
                className={`${field} min-w-0 flex-1`}
              >
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id} disabled={used.has(i.id) && i.id !== l.ingredientId}>
                    {i.name}
                  </option>
                ))}
              </select>
              <input
                value={l.quantity}
                onChange={(e) =>
                  setLines((all) => all.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))
                }
                inputMode="decimal"
                placeholder="0"
                aria-label="Quantité"
                className={`${field} w-24`}
              />
              <span className="w-12 shrink-0 text-sm text-stone-500">{unitOf(l.ingredientId)}</span>
              <button
                type="button"
                onClick={() => setLines((all) => all.filter((_, i) => i !== idx))}
                aria-label="Retirer la ligne"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-700"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          disabled={!canAdd}
          onClick={addLine}
          className="flex items-center gap-1.5 rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-medium text-stone-700 disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
          Ajouter un ingrédient
        </button>

        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}
      </div>

      <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="w-full rounded-2xl bg-brand-500 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer la recette'}
        </button>
      </div>
    </Sheet>
  );
}

export function RecipesTab({
  restaurantId,
  ingredients,
  onMessage,
}: {
  restaurantId: string;
  ingredients: Ingredient[];
  onMessage: (message: string) => void;
}) {
  const base = `/restaurants/${restaurantId}`;
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([
        authRequest<{ products: ProductRow[] }>(`${base}/products`),
        authRequest<{ recipes: RecipeRow[] }>(`${base}/recipes`),
      ]);
      setProducts(p.products);
      setRecipes(r.recipes);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const linesOf = (productId: string) => recipes.find((r) => r.productId === productId)?.lines ?? [];

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-3xl bg-stone-200/60" />
        ))}
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      )}
      {ingredients.length === 0 && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Créez d’abord des ingrédients (onglet « Ingrédients ») pour pouvoir écrire des recettes.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {products.map((p) => {
          const lines = linesOf(p.id);
          return (
            <article key={p.id} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold tracking-tight">{p.name}</h3>
                  <p className="text-sm text-stone-500">{fcfa(p.priceFcfa)}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    lines.length > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'
                  }`}
                >
                  {lines.length > 0 ? 'Recette définie' : 'Sans recette'}
                </span>
              </div>

              {lines.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-stone-600">
                  {lines.map((l) => (
                    <li key={l.ingredientId} className="flex justify-between">
                      <span>{l.ingredientName}</span>
                      <span className="font-medium">
                        {qty(l.quantityPerUnit)} {l.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-stone-400">Aucun stock n’est déduit pour ce produit.</p>
              )}

              <button
                type="button"
                disabled={ingredients.length === 0 && lines.length === 0}
                onClick={() => setEditing(p)}
                className="mt-4 rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 transition active:scale-[0.97] disabled:opacity-50"
              >
                {lines.length > 0 ? 'Modifier la recette' : 'Définir la recette'}
              </button>
            </article>
          );
        })}
      </div>

      {editing && (
        <RecipeSheet
          key={editing.id}
          restaurantId={restaurantId}
          product={editing}
          ingredients={ingredients}
          initial={linesOf(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null);
            onMessage(m);
            void load();
          }}
        />
      )}
    </>
  );
}