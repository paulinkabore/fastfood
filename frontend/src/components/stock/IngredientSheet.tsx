import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { UNITS, parseDecimal, validQty, type Ingredient } from '../../features/stock/stock';
import { Sheet } from '../Sheet';
import { CloseIcon } from '../icons';

const field =
  'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

export function IngredientSheet({
  restaurantId,
  ingredient,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  ingredient: Ingredient | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const base = `/restaurants/${restaurantId}`;
  const [name, setName] = useState(ingredient?.name ?? '');
  const [unit, setUnit] = useState(ingredient?.unit ?? 'kg');
  const [initial, setInitial] = useState('');
  const [threshold, setThreshold] = useState(
    ingredient ? String(ingredient.alertThreshold).replace('.', ',') : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askArchive, setAskArchive] = useState(false);

  const save = async () => {
    if (busy) return;
    const t = threshold.trim() ? parseDecimal(threshold) : 0;
    const q = initial.trim() ? parseDecimal(initial) : 0;
    if (!name.trim()) return setError('Le nom est obligatoire');
    if (!unit.trim()) return setError('L’unité est obligatoire');
    if (!validQty(t, true)) return setError('Seuil invalide : nombre positif, 3 décimales au maximum');
    if (!ingredient && !validQty(q, true)) {
      return setError('Quantité invalide : nombre positif, 3 décimales au maximum');
    }

    setBusy(true);
    setError(null);
    try {
      if (ingredient) {
        await authRequest(`${base}/ingredients/${ingredient.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: name.trim(), unit: unit.trim(), alertThreshold: t }),
        });
      } else {
        await authRequest(`${base}/ingredients`, {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            unit: unit.trim(),
            quantity: q,
            alertThreshold: t,
          }),
        });
      }
      onSaved(ingredient ? 'Ingrédient modifié' : `« ${name.trim()} » ajouté`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (busy || !ingredient) return;
    setBusy(true);
    setError(null);
    try {
      await authRequest(`${base}/ingredients/${ingredient.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      });
      onSaved(`« ${ingredient.name} » archivé`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
      setAskArchive(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet label="Ingrédient" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {ingredient ? 'Modifier l’ingrédient' : 'Nouvel ingrédient'}
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
        <div>
          <label htmlFor="i-name" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Nom
          </label>
          <input
            id="i-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Ex. Poulet"
            className={field}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="i-unit" className="mb-1.5 block text-sm font-semibold text-stone-700">
              Unité
            </label>
            <input
              id="i-unit"
              list="stock-units"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              maxLength={20}
              className={field}
            />
            <datalist id="stock-units">
              {UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="i-thr" className="mb-1.5 block text-sm font-semibold text-stone-700">
              Seuil d’alerte
            </label>
            <input
              id="i-thr"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={field}
            />
          </div>
        </div>

        {!ingredient ? (
          <div>
            <label htmlFor="i-qty" className="mb-1.5 block text-sm font-semibold text-stone-700">
              Quantité en stock aujourd’hui
            </label>
            <input
              id="i-qty"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className={field}
            />
          </div>
        ) : (
          <p className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-500">
            Pour changer la quantité, utilisez <span className="font-medium">Entrée</span>,{' '}
            <span className="font-medium">Perte</span> ou l’onglet <span className="font-medium">Inventaire</span> :
            chaque changement est ainsi tracé.
          </p>
        )}

        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}

        {ingredient && (
          <div className="border-t border-stone-100 pt-4">
            {askArchive ? (
              <div className="space-y-2 rounded-2xl bg-red-50 p-4">
                <p className="text-sm font-medium text-red-700">
                  Archiver « {ingredient.name} » ? Il disparaîtra de la liste. Impossible s’il est utilisé
                  dans une recette.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void archive()}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Oui, archiver
                  </button>
                  <button
                    type="button"
                    onClick={() => setAskArchive(false)}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-stone-600"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setAskArchive(true)}
                className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
              >
                Archiver cet ingrédient
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="w-full rounded-2xl bg-brand-500 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Sheet>
  );
}