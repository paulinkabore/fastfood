import { useCallback, useEffect, useState } from 'react';
import { IngredientsTab } from '../../components/stock/IngredientsTab';
import { RequireRole } from '../../components/RequireRole';
import { StaffLayout } from '../../components/StaffLayout';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import type { Ingredient } from '../../features/stock/stock';

function Stock({ restaurantId }: { restaurantId: string }) {
  const base = `/restaurants/${restaurantId}`;
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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void load()}
          className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200"
        >
          Actualiser
        </button>
      </div>

      <IngredientsTab
        restaurantId={restaurantId}
        ingredients={ingredients}
        loading={loading}
        onChanged={() => void load()}
        onMessage={setMessage}
      />
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