import { useState } from 'react';
import { ApiError } from '../../lib/api';
import { authRequest } from '../../lib/auth';
import { SUGGESTED_NAME, type AdminRestaurant } from '../../features/admin/admin';
import { Sheet } from '../Sheet';
import { CloseIcon } from '../icons';

const field =
  'w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

export function RestaurantSheet({
  restaurant,
  onClose,
  onSaved,
}: {
  restaurant: AdminRestaurant | null;
  onClose: () => void;
  onSaved: (saved: { id: string; name: string }, created: boolean) => void;
}) {
  const [name, setName] = useState(restaurant?.name ?? '');
  const [address, setAddress] = useState(restaurant?.address ?? '');
  const [phone, setPhone] = useState(restaurant?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    if (name.trim().length < 2) return setError('Le nom doit contenir au moins 2 caractères');
    setBusy(true);
    setError(null);
    try {
      if (restaurant) {
        const r = await authRequest<{ restaurant: { id: string; name: string } }>(
          `/admin/restaurants/${restaurant.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ name: name.trim(), address: address.trim(), phone: phone.trim() }),
          },
        );
        onSaved(r.restaurant, false);
      } else {
        const r = await authRequest<{ restaurant: { id: string; name: string } }>('/admin/restaurants', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            address: address.trim() || undefined,
            phone: phone.trim() || undefined,
          }),
        });
        onSaved(r.restaurant, true);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet label="Restaurant" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {restaurant ? 'Modifier le restaurant' : 'Nouveau restaurant'}
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
          <label htmlFor="r-name" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Nom du restaurant
          </label>
          <input
            id="r-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
            className={field}
          />
          {name.trim() !== SUGGESTED_NAME && (
            <button
              type="button"
              onClick={() => setName(SUGGESTED_NAME)}
              className="mt-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200"
            >
              Utiliser « {SUGGESTED_NAME} »
            </button>
          )}
        </div>
        <div>
          <label htmlFor="r-addr" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Adresse (facultatif)
          </label>
          <input
            id="r-addr"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={200}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="r-phone" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Téléphone (facultatif)
          </label>
          <input
            id="r-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            inputMode="tel"
            className={field}
          />
        </div>
        {restaurant && (
          <p className="rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-500">
            L’identifiant technique (« {restaurant.slug} ») ne change pas : les liens et les QR codes déjà
            imprimés continuent de fonctionner.
          </p>
        )}
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
          {busy ? 'Enregistrement…' : restaurant ? 'Enregistrer' : 'Créer le restaurant'}
        </button>
      </div>
    </Sheet>
  );
}