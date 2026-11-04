import { useCallback, useEffect, useState } from 'react';
import { InventoryTab } from '../../components/stock/InventoryTab';
import { IngredientsTab } from '../../components/stock/IngredientsTab';
import { MovementsTab } from '../../components/stock/MovementsTab';
import { RecipesTab } from '../../components/stock/RecipesTab';
import { RequireRole } from '../../components/RequireRole';
import { StaffLayout } from '../../components/StaffLayout';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import type { Ingredient } from '../../features/stock/stock';

type Tab = 'ingredients' | 'recipes' | 'inventory' | 'movements';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ingredients', label: 'Ingrédients' },
  { id: 'recipes', label: 'Recettes' },
  { id: 'inventory', label: 'Inventaire' },
  { id: 'movements', label: 'Mouvements' },
];

function Stock({ restaurantId }: { restaurantId: string }) {
  const base = `/restaurants/${restaurantId}`;
  const [tab, setTab] = useState<Tab>('ingredients');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lowCount, setLowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await authRequest<{ ingredients: Ingredient[]; lowCount: number }>(`${base}/ingredients`);
      setIngredients(d.ingredients);
      setLowCount(d.lowCount);
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

  // Le stock change quand la cuisine prépare : on le relit au retour sur l'onglet du navigateur
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  const pill = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'
    }`;

  return (
    <>
      {lowCount > 0 && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {lowCount} ingrédient{lowCount > 1 ? 's' : ''} à réapprovisionner (stock bas ou rupture).
        </p>
      )}
      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      )}
      {message && (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={pill(tab === t.id)}
              onClick={() => {
                setTab(t.id);
                setMessage(null);
                void load();
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200"
        >
          Actualiser
        </button>
      </div>

      {tab === 'ingredients' && (
        <IngredientsTab
          restaurantId={restaurantId}
          ingredients={ingredients}
          loading={loading}
          onChanged={() => void load()}
          onMessage={setMessage}
        />
      )}
      {tab === 'recipes' && (
        <RecipesTab restaurantId={restaurantId} ingredients={ingredients} onMessage={setMessage} />
      )}
      {tab === 'inventory' && (
        <InventoryTab
          restaurantId={restaurantId}
          ingredients={ingredients}
          onChanged={() => void load()}
          onMessage={setMessage}
        />
      )}
      {tab === 'movements' && <MovementsTab restaurantId={restaurantId} ingredients={ingredients} />}
    </>
  );
}

export default function StockPage() {
  return (
    <RequireRole roles={['MANAGER']}>
      {({ restaurantId }) => (
        <StaffLayout restaurantId={restaurantId} title="Stock">
          <Stock restaurantId={restaurantId} />
        </StaffLayout>
      )}
    </RequireRole>
  );
}