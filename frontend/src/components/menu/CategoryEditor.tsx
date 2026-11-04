import { useState } from 'react';
import type { CategoryRow } from '../../features/menu/menu';
import { Sheet } from '../Sheet';
import { CloseIcon } from '../icons';

export function CategoryEditor({
  category,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  category: CategoryRow | null;
  busy: boolean;
  error: string | null;
  onSubmit: (data: { name: string; sortOrder: number; isActive: boolean }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [order, setOrder] = useState(String(category?.sortOrder ?? 0));
  const [active, setActive] = useState(category?.isActive ?? true);

  const submit = () => {
    if (!name.trim() || busy) return;
    onSubmit({
      name: name.trim(),
      sortOrder: Math.min(1000, Number(order.replace(/\D/g, '')) || 0),
      isActive: active,
    });
  };

  const field =
    'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

  return (
    <Sheet label="Catégorie" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
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

      <div className="space-y-4 px-5 py-5">
        <div>
          <label htmlFor="cat-name" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Nom
          </label>
          <input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={60}
            autoFocus
            className={field}
          />
        </div>
        <div>
          <label htmlFor="cat-order" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Ordre d’affichage
          </label>
          <input
            id="cat-order"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            inputMode="numeric"
            className={field}
          />
          <p className="mt-1 text-xs text-stone-400">Le plus petit nombre s’affiche en premier.</p>
        </div>
        {category && (
          <label className="flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-5 w-5 accent-orange-500"
            />
            <span className="text-sm font-medium text-stone-700">Visible pour les clients</span>
          </label>
        )}
        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}
      </div>

      <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !name.trim()}
          className="w-full rounded-2xl bg-stone-900 px-5 py-4 font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Sheet>
  );
}