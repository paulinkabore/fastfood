import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { fcfa } from '../../lib/format';
import type { CategoryRow, OptionRow, ProductRow } from '../../features/menu/menu';
import { Sheet } from '../Sheet';
import { CloseIcon } from '../icons';

const MAX_IMAGE = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const parseAllergens = (s: string) =>
  [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 20);

const field =
  'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

// ---------- Options (suppléments) d'un produit ----------
function OptionsSection({
  restaurantId,
  productId,
  initial,
  onChanged,
}: {
  restaurantId: string;
  productId: string;
  initial: OptionRow[];
  onChanged: () => void;
}) {
  const base = `/restaurants/${restaurantId}`;
  const [items, setItems] = useState<OptionRow[]>(initial);
  const [name, setName] = useState('');
  const [delta, setDelta] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(null);
    }
  };

  const add = () =>
    run('add', async () => {
      const value = delta.trim() ? Number(delta.replace(/\s/g, '')) : 0;
      if (!name.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'Le nom de l’option est obligatoire');
      if (!Number.isInteger(value) || value < 0) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Le supplément doit être un nombre entier de FCFA');
      }
      const r = await authRequest<{ option: OptionRow }>(`${base}/products/${productId}/options`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), priceDeltaFcfa: value }),
      });
      setItems((l) => [...l, r.option]);
      setName('');
      setDelta('');
    });

  const toggle = (o: OptionRow) =>
    run(`t:${o.id}`, async () => {
      const r = await authRequest<{ option: OptionRow }>(`${base}/options/${o.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !o.isActive }),
      });
      setItems((l) => l.map((x) => (x.id === o.id ? r.option : x)));
    });

  const remove = (o: OptionRow) =>
    run(`d:${o.id}`, async () => {
      await authRequest(`${base}/options/${o.id}`, { method: 'DELETE' });
      setItems((l) => l.filter((x) => x.id !== o.id));
    });

  const enter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void add();
    }
  };

  return (
    <div className="space-y-3 rounded-3xl bg-stone-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-stone-700">Options (suppléments)</h3>
        <p className="text-xs text-stone-400">Exemple : « Fromage en plus », + 300 FCFA.</p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-stone-400">Aucune option pour ce produit.</p>
      ) : (
        <ul className="divide-y divide-stone-200/70">
          {items.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className={`min-w-0 ${o.isActive ? '' : 'opacity-50'}`}>
                <p className="truncate text-sm font-medium">{o.name}</p>
                <p className="text-xs text-stone-500">
                  {o.priceDeltaFcfa > 0 ? `+ ${fcfa(o.priceDeltaFcfa)}` : 'Offert'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void toggle(o)}
                  className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200 disabled:opacity-50"
                >
                  {o.isActive ? 'Masquer' : 'Afficher'}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void remove(o)}
                  className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50"
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={enter}
          placeholder="Nom de l’option"
          aria-label="Nom de l’option"
          maxLength={60}
          className={`${field} min-w-40 flex-1 py-2.5`}
        />
        <input
          value={delta}
          onChange={(e) => setDelta(e.target.value.replace(/[^\d\s]/g, ''))}
          onKeyDown={enter}
          placeholder="+ FCFA"
          aria-label="Supplément en FCFA"
          inputMode="numeric"
          className={`${field} w-28 py-2.5`}
        />
        <button
          type="button"
          disabled={busy !== null || !name.trim()}
          onClick={() => void add()}
          className="rounded-2xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.97] disabled:opacity-50"
        >
          {busy === 'add' ? '…' : 'Ajouter'}
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
      )}
    </div>
  );
}

// ---------- Fiche produit ----------
export function ProductEditor({
  restaurantId,
  product,
  categories,
  defaultCategoryId,
  onClose,
  onChanged,
}: {
  restaurantId: string;
  product: ProductRow | null;
  categories: CategoryRow[];
  defaultCategoryId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const base = `/restaurants/${restaurantId}`;
  const lock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // « current » devient le produit dès sa création : les options et la photo se débloquent
  const [current, setCurrent] = useState<ProductRow | null>(product);
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.priceFcfa) : '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? defaultCategoryId);
  const [allergens, setAllergens] = useState((product?.allergens ?? []).join(', '));
  const [available, setAvailable] = useState(product?.isAvailable ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) {
      setError('Format accepté : JPG, PNG ou WebP');
      return;
    }
    if (f.size > MAX_IMAGE) {
      setError('Image trop lourde (2 Mo maximum)');
      return;
    }
    setFile(f);
  };

  const priceNumber = Number(price.replace(/\s/g, ''));
  const priceValid = Number.isInteger(priceNumber) && priceNumber >= 1 && priceNumber <= 10_000_000;

  const save = async () => {
    if (lock.current) return;
    if (!name.trim()) return setError('Le nom est obligatoire');
    if (!priceValid) return setError('Le prix doit être un nombre entier de FCFA, supérieur à 0');
    if (!categoryId) return setError('Choisissez une catégorie');

    lock.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const body = JSON.stringify({
        categoryId,
        name: name.trim(),
        description: description.trim(),
        priceFcfa: priceNumber,
        allergens: parseAllergens(allergens),
        isAvailable: available,
      });

      let saved: ProductRow;
      if (current) {
        const r = await authRequest<{ product: ProductRow }>(`${base}/products/${current.id}`, {
          method: 'PATCH',
          body,
        });
        saved = { ...current, ...r.product, options: current.options };
      } else {
        const r = await authRequest<{ product: ProductRow }>(`${base}/products`, {
          method: 'POST',
          body,
        });
        saved = { ...r.product, options: [] };
      }
      setCurrent(saved);
      onChanged();

      if (file) {
        const form = new FormData();
        form.append('image', file);
        const r = await authRequest<{ product: ProductRow }>(`${base}/products/${saved.id}/image`, {
          method: 'POST',
          body: form,
        });
        setCurrent({ ...saved, imageUrl: r.product.imageUrl });
        setFile(null);
        onChanged();
      }
      setMessage(
        product || current
          ? 'Modifications enregistrées'
          : 'Produit créé. Vous pouvez maintenant ajouter des options.',
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  const shownImage = preview ?? current?.imageUrl ?? null;

  return (
    <Sheet label={current ? 'Modifier le produit' : 'Nouveau produit'} onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {current ? 'Modifier le produit' : 'Nouveau produit'}
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

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {message && (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
        )}

        <div>
          <label htmlFor="p-name" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Nom du produit
          </label>
          <input
            id="p-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={field}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-cat" className="mb-1.5 block text-sm font-semibold text-stone-700">
              Catégorie
            </label>
            <select
              id="p-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={field}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isActive ? '' : ' (masquée)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="p-price" className="mb-1.5 block text-sm font-semibold text-stone-700">
              Prix (FCFA)
            </label>
            <input
              id="p-price"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d\s]/g, ''))}
              inputMode="numeric"
              placeholder="1500"
              className={field}
            />
            {priceValid && <p className="mt-1 text-xs text-stone-400">{fcfa(priceNumber)}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="p-desc" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Description
          </label>
          <textarea
            id="p-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className={`${field} resize-none`}
          />
        </div>

        <div>
          <label htmlFor="p-all" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Allergènes
          </label>
          <input
            id="p-all"
            value={allergens}
            onChange={(e) => setAllergens(e.target.value)}
            placeholder="gluten, arachide, lait (séparés par des virgules)"
            className={field}
          />
        </div>

        <label className="flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3">
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
            className="h-5 w-5 accent-orange-500"
          />
          <span className="text-sm font-medium text-stone-700">Disponible à la commande</span>
        </label>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-stone-700">Photo</p>
          <div className="flex items-center gap-4">
            {shownImage ? (
              <img src={shownImage} alt="Photo du produit" className="h-24 w-24 rounded-2xl object-cover" />
            ) : (
              <div className="grid h-24 w-24 place-items-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 px-2 text-center text-xs font-medium text-brand-600">
                Aucune photo
              </div>
            )}
            <div>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-medium text-stone-700 transition active:scale-[0.97]"
              >
                {shownImage ? 'Changer la photo' : 'Choisir une photo'}
              </button>
              <p className="mt-1.5 text-xs text-stone-400">
                JPG, PNG ou WebP, 2 Mo maximum. Envoyée à l’enregistrement.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </div>

        {current ? (
          <OptionsSection
            key={current.id}
            restaurantId={restaurantId}
            productId={current.id}
            initial={current.options}
            onChanged={onChanged}
          />
        ) : (
          <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-400">
            Enregistrez le produit pour pouvoir ajouter des options.
          </p>
        )}
      </div>

      <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="w-full rounded-2xl bg-brand-500 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? 'Enregistrement…' : current ? 'Enregistrer les modifications' : 'Créer le produit'}
        </button>
      </div>
    </Sheet>
  );
}