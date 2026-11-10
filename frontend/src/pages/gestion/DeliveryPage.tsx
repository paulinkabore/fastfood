import { useCallback, useEffect, useState } from 'react';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { RequireRole } from '../../components/RequireRole';
import { StaffLayout } from '../../components/StaffLayout';
import { ApiError } from '../../lib/api';
import { authBlob, authRequest } from '../../lib/auth';
import { saveBlob } from '../../lib/download';

type QrRow = { id: string; type: string; url: string; isActive: boolean };
type Ask = 'replace' | 'deactivate';

// L'image du QR code demande une connexion : on la télécharge puis on l'affiche
function QrImage({ restaurantId, qrId }: { restaurantId: string; qrId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    authBlob(`/restaurants/${restaurantId}/qr-codes/${qrId}/image`)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [restaurantId, qrId]);

  if (failed) {
    return (
      <div className="grid h-40 w-40 place-items-center rounded-xl bg-red-50 p-2 text-center text-xs text-red-700">
        Image indisponible
      </div>
    );
  }
  if (!src) return <div className="h-40 w-40 animate-pulse rounded-xl bg-stone-100" />;
  return <img src={src} alt="QR code de la livraison" className="h-40 w-40 rounded-xl" />;
}

function Delivery({ restaurantId }: { restaurantId: string }) {
  const base = `/restaurants/${restaurantId}`;
  const [qr, setQr] = useState<QrRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await authRequest<{ qrCodes: QrRow[] }>(`${base}/qr-codes`);
      setQr(d.qrCodes.find((q) => q.type === 'DELIVERY' && q.isActive) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string, reload = true) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
      if (reload) await load();
      setMessage(ok);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(null);
    }
  };

  const copy = () =>
    qr &&
    void navigator.clipboard
      .writeText(qr.url)
      .then(() => setMessage('Lien copié'))
      .catch(() => setError('Copie impossible : copiez l’adresse affichée à la main'));

  const confirm = async () => {
    if (!qr || !ask) return;
    const id = qr.id;
    const kind = ask;
    await run(
      kind,
      () => authRequest(`${base}/qr-codes/${id}/${kind === 'replace' ? 'replace' : 'deactivate'}`, { method: 'POST' }),
      kind === 'replace' ? 'Nouveau lien créé : l’ancien ne fonctionne plus' : 'Livraison désactivée',
    );
    setAsk(null);
  };

  const btn = 'rounded-xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.97] disabled:opacity-50';
  const whatsapp = qr
    ? `https://wa.me/?text=${encodeURIComponent(`Commandez en livraison chez nous : ${qr.url}`)}`
    : '#';

  return (
    <>
      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>
      )}
      {message && (
        <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {message}
        </p>
      )}

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
        <h2 className="font-semibold tracking-tight">Lien de livraison</h2>
        <p className="mt-1 text-sm text-stone-500">
          Partagez ce lien (WhatsApp, Facebook, affiche). Il ouvre le menu : le client commande, laisse son
          nom et son téléphone, puis le livreur le rappelle pour convenir du prix de la livraison.
        </p>

        {loading ? (
          <div className="mt-4 h-24 animate-pulse rounded-2xl bg-stone-100" />
        ) : qr ? (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row">
            <div className="shrink-0 self-start rounded-2xl bg-white p-2 ring-1 ring-stone-200">
              <QrImage restaurantId={restaurantId} qrId={qr.id} />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <input
                readOnly
                value={qr.url}
                aria-label="Lien de livraison"
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={copy} className={`${btn} bg-stone-900 text-white shadow-lg shadow-stone-900/20`}>
                  Copier le lien
                </button>
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btn} bg-emerald-600 text-center text-white shadow-lg shadow-emerald-600/25`}
                >
                  Partager sur WhatsApp
                </a>
                <a
                  href={qr.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btn} bg-brand-500 text-center text-white shadow-md shadow-brand-500/30`}
                >
                  Voir la page client
                </a>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      'dl',
                      async () => saveBlob(await authBlob(`${base}/qr-codes/${qr.id}/image`), 'qr-livraison.png'),
                      'Image téléchargée',
                      false,
                    )
                  }
                  className={`${btn} bg-stone-100 text-stone-700`}
                >
                  Télécharger le QR
                </button>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setAsk('replace')}
                  className={`${btn} bg-stone-100 text-stone-700`}
                >
                  Changer le lien
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setAsk('deactivate')}
                  className={`${btn} bg-red-50 text-red-700`}
                >
                  Désactiver la livraison
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void run('create', () => authRequest(`${base}/qr-codes/delivery`, { method: 'POST' }), 'Lien de livraison créé')
            }
            className="mt-4 rounded-2xl bg-brand-500 px-5 py-3 font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97] disabled:opacity-50"
          >
            {busy === 'create' ? 'Création…' : 'Activer la livraison et créer le lien'}
          </button>
        )}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
        <h2 className="font-semibold tracking-tight">Comment ça marche</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-stone-600">
          <li>Le client ouvre le lien et voit votre menu.</li>
          <li>Il choisit ses plats, puis indique son nom et son numéro de téléphone.</li>
          <li>La commande arrive en cuisine et dans l’écran « Serveur », section « Livraison ».</li>
          <li>Le livreur appelle le client pour convenir du prix de la livraison.</li>
          <li>Le serveur touche « Marquer livrée » une fois la commande remise.</li>
        </ol>
      </section>

      {ask && (
        <ConfirmSheet
          title={ask === 'replace' ? 'Changer le lien de livraison ?' : 'Désactiver la livraison ?'}
          text={
            ask === 'replace'
              ? 'L’ancien lien cessera de fonctionner immédiatement. Pensez à partager le nouveau.'
              : 'Les clients ne pourront plus commander en livraison avec ce lien.'
          }
          confirmLabel={ask === 'replace' ? 'Changer le lien' : 'Désactiver'}
          danger={ask === 'deactivate'}
          busy={busy !== null}
          onConfirm={() => void confirm()}
          onClose={() => setAsk(null)}
        />
      )}
    </>
  );
}

export default function DeliveryPage() {
  return (
    <RequireRole roles={['MANAGER']}>
      {({ restaurantId }) => (
        <StaffLayout restaurantId={restaurantId} title="Livraison">
          <Delivery restaurantId={restaurantId} />
        </StaffLayout>
      )}
    </RequireRole>
  );
}
