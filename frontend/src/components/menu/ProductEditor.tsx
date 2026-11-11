import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { fcfa } from '../../lib/format';
import type { CategoryRow, ProductRow } from '../../features/menu/menu';
import { Sheet } from '../Sheet';
import { CloseIcon } from '../icons';

const MAX_IMAGE = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const field =
  'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

// ---------- Fiche produit ----------
export function ProductEditor({
  restaurantId,
  product,
  categories,
  defaultCategoryId,
  onClose,
  onChanged,
  onSaved,
}: {
  restaurantId: string;
  product: ProductRow | null;
  categories: CategoryRow[];
  defaultCategoryId: string;
  onClose: () => void;
  onChanged: () => void;
  onSaved: (message: string) => void;
}) {
  const base = `/restaurants/${restaurantId}`;
  const lock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // « current » devient le produit dès sa création
  const [current, setCurrent] = useState<ProductRow | null>(product);
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? String(product.priceFcfa) : '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? defaultCategoryId);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const body = JSON.stringify({
        categoryId,
        name: name.trim(),
        priceFcfa: priceNumber,
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
      // Succès : la boîte se ferme et la page affiche la notification
      onSaved(product ? `« ${saved.name} » modifié` : `« ${saved.name} » ajouté au menu`);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };

  const shownImage = preview ?? current?.imageUrl ?? null;

  return (
    <Sheet label={product ? 'Modifier le produit' : 'Nouveau produit'} onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {product ? 'Modifier le produit' : 'Nouveau produit'}
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
      </div>

      <div className="border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="w-full rounded-2xl bg-brand-500 px-5 py-4 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-600 active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? 'Enregistrement…' : product ? 'Enregistrer' : 'Ajouter au menu'}
        </button>
      </div>
    </Sheet>
  );
}