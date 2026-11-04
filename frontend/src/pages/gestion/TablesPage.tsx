import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ConfirmSheet } from '../../components/ConfirmSheet';
import { RequireRole } from '../../components/RequireRole';
import { StaffLayout } from '../../components/StaffLayout';
import { ApiError } from '../../lib/api';
import { authBlob, authRequest } from '../../lib/auth';

type TableRow = {
  id: string;
  label: string;
  seats: number | null;
  isActive: boolean;
  hasActiveQr: boolean;
};

type QrRow = {
  id: string;
  type: 'TABLE' | 'TAKEAWAY';
  tableId: string | null;
  tableLabel: string | null;
  url: string;
  isActive: boolean;
};

type Confirm = {
  kind: 'replace' | 'deactivate' | 'deleteTable';
  id: string;
  title: string;
  text: string;
  confirmLabel: string;
  okMessage: string;
};

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

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
      <div className="grid h-36 w-36 place-items-center rounded-xl bg-red-50 p-2 text-center text-xs text-red-700">
        Image indisponible
      </div>
    );
  }
  if (!src) return <div className="h-36 w-36 animate-pulse rounded-xl bg-stone-100" />;
  return <img src={src} alt="QR code" className="h-36 w-36 rounded-xl" />;
}

function QrBlock({
  qr,
  restaurantId,
  disabled,
  onCopy,
  onDownload,
  onReplace,
  onDeactivate,
}: {
  qr: QrRow;
  restaurantId: string;
  disabled: boolean;
  onCopy: () => void;
  onDownload: () => void;
  onReplace: () => void;
  onDeactivate: () => void;
}) {
  const btn =
    'rounded-xl px-3 py-2 text-sm font-medium transition active:scale-[0.97] disabled:opacity-50';
  return (
    <div className="mt-4 flex gap-4">
      <div className="shrink-0 rounded-2xl bg-white p-2 ring-1 ring-stone-200">
        <QrImage restaurantId={restaurantId} qrId={qr.id} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <a
          href={qr.url}
          target="_blank"
          rel="noreferrer"
          className={`${btn} bg-brand-500 text-center text-white shadow-md shadow-brand-500/30`}
        >
          Ouvrir la page client
        </a>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={disabled} onClick={onCopy} className={`${btn} bg-stone-100 text-stone-700`}>
            Copier le lien
          </button>
          <button type="button" disabled={disabled} onClick={onDownload} className={`${btn} bg-stone-100 text-stone-700`}>
            Télécharger
          </button>
          <button type="button" disabled={disabled} onClick={onReplace} className={`${btn} bg-stone-100 text-stone-700`}>
            Remplacer
          </button>
          <button type="button" disabled={disabled} onClick={onDeactivate} className={`${btn} bg-red-50 text-red-700`}>
            Désactiver
          </button>
        </div>
        <p className="truncate text-xs text-stone-400">{qr.url.replace(/^https?:\/\//, '')}</p>
      </div>
    </div>
  );
}

function Tables({ restaurantId }: { restaurantId: string }) {
  const base = `/restaurants/${restaurantId}`;

  const [tables, setTables] = useState<TableRow[]>([]);
  const [qrs, setQrs] = useState<QrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const [newLabel, setNewLabel] = useState('');
  const [newSeats, setNewSeats] = useState('');

  const load = useCallback(async () => {
    try {
      const [t, q] = await Promise.all([
        authRequest<{ tables: TableRow[] }>(`${base}/tables`),
        authRequest<{ qrCodes: QrRow[] }>(`${base}/qr-codes`),
      ]);
      setTables(t.tables);
      setQrs(q.qrCodes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  // Une seule action à la fois : pas de double clic
  const run = async (
    key: string,
    fn: () => Promise<unknown>,
    okMessage?: string,
    reload = true,
  ) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
      if (reload) await load();
      if (okMessage) setMessage(okMessage);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(null);
    }
  };

  const addTable = async (e: FormEvent) => {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    const seats = newSeats.trim() ? Number(newSeats) : undefined;
    await run(
      'add',
      () =>
        authRequest(`${base}/tables`, {
          method: 'POST',
          body: JSON.stringify({ label, seats }),
        }),
      `Table « ${label} » créée`,
    );
    setNewLabel('');
    setNewSeats('');
  };

  const confirmRun = async () => {
    if (!confirm) return;
    const c = confirm;
    await run(
      `${c.kind}:${c.id}`,
      async () => {
        if (c.kind === 'replace') await authRequest(`${base}/qr-codes/${c.id}/replace`, { method: 'POST' });
        if (c.kind === 'deactivate') await authRequest(`${base}/qr-codes/${c.id}/deactivate`, { method: 'POST' });
        if (c.kind === 'deleteTable') await authRequest(`${base}/tables/${c.id}`, { method: 'DELETE' });
      },
      c.okMessage,
    );
    setConfirm(null);
  };

  const qrActions = (qr: QrRow, name: string) => ({
    onCopy: () =>
      void navigator.clipboard
        .writeText(qr.url)
        .then(() => setMessage('Lien copié'))
        .catch(() => setError('Copie impossible : copiez l’adresse affichée à la main')),
    onDownload: () =>
      void run(
        `dl:${qr.id}`,
        async () => saveBlob(await authBlob(`${base}/qr-codes/${qr.id}/image`), `qr-${name}.png`),
        'Image téléchargée',
        false,
      ),
    onReplace: () =>
      setConfirm({
        kind: 'replace',
        id: qr.id,
        title: `Remplacer le QR code de « ${name} » ?`,
        text: 'Le QR code actuel cessera de fonctionner immédiatement. Pensez à imprimer le nouveau.',
        confirmLabel: 'Remplacer',
        okMessage: 'QR code remplacé',
      }),
    onDeactivate: () =>
      setConfirm({
        kind: 'deactivate',
        id: qr.id,
        title: `Désactiver le QR code de « ${name} » ?`,
        text: 'Les clients ne pourront plus commander avec ce QR code.',
        confirmLabel: 'Désactiver',
        okMessage: 'QR code désactivé',
      }),
  });

  const activeQr = (tableId: string) => qrs.find((q) => q.tableId === tableId && q.isActive);
  const takeaway = qrs.find((q) => q.type === 'TAKEAWAY' && q.isActive);
  const visible = showInactive ? tables : tables.filter((t) => t.isActive);
  const hidden = tables.length - tables.filter((t) => t.isActive).length;
  const anyBusy = busy !== null;

  const field =
    'rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100';

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold tracking-tight">Ajouter une table</h2>
            <p className="text-sm text-stone-500">Chaque table aura son propre QR code.</p>
          </div>
          <button
            type="button"
            disabled={anyBusy}
            onClick={() =>
              void run(
                'pdf',
                async () => saveBlob(await authBlob(`${base}/qr-codes/print.pdf`), 'qr-codes.pdf'),
                'PDF téléchargé : ouvrez-le pour imprimer les QR codes',
                false,
              )
            }
            className="rounded-2xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-stone-900/20 transition active:scale-[0.97] disabled:opacity-60"
          >
            {busy === 'pdf' ? 'Préparation…' : 'Imprimer tous les QR (PDF)'}
          </button>
        </div>
        <form onSubmit={addTable} className="mt-4 flex flex-wrap gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Nom (ex. Table 5)"
            aria-label="Nom de la table"
            maxLength={30}
            required
            className={`${field} min-w-48 flex-1`}
          />
          <input
            value={newSeats}
            onChange={(e) => setNewSeats(e.target.value.replace(/\D/g, ''))}
            placeholder="Places"
            aria-label="Nombre de places"
            inputMode="numeric"
            className={`${field} w-28`}
          />
          <button
            type="submit"
            disabled={anyBusy || !newLabel.trim()}
            className="rounded-2xl bg-brand-500 px-5 py-3 font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97] disabled:opacity-50"
          >
            {busy === 'add' ? 'Création…' : 'Ajouter'}
          </button>
        </form>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
        <h2 className="font-semibold tracking-tight">QR code « À emporter »</h2>
        <p className="text-sm text-stone-500">
          Pour les clients sans table : le comptoir, l’entrée, une affiche.
        </p>
        {takeaway ? (
          <QrBlock
            qr={takeaway}
            restaurantId={restaurantId}
            disabled={anyBusy}
            {...qrActions(takeaway, 'emporter')}
          />
        ) : (
          <button
            type="button"
            disabled={anyBusy}
            onClick={() =>
              void run(
                'takeaway',
                () => authRequest(`${base}/qr-codes/takeaway`, { method: 'POST' }),
                'QR code « À emporter » créé',
              )
            }
            className="mt-4 rounded-2xl bg-brand-500 px-5 py-3 font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97] disabled:opacity-50"
          >
            {busy === 'takeaway' ? 'Création…' : 'Générer le QR « À emporter »'}
          </button>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold tracking-tight">
            Tables <span className="text-stone-400">({visible.length})</span>
          </h2>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-600 ring-1 ring-stone-200"
            >
              {showInactive ? 'Masquer' : 'Afficher'} les tables désactivées ({hidden})
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-3xl bg-stone-200/60" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 px-4 py-12 text-center text-sm text-stone-400">
            Aucune table. Ajoutez-en une ci-dessus.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visible.map((t) => {
              const qr = activeQr(t.id);
              return (
                <article
                  key={t.id}
                  className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70 ${
                    t.isActive ? '' : 'opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight">{t.label}</h3>
                      <p className="text-sm text-stone-500">
                        {t.seats ? `${t.seats} places` : 'Places non précisées'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        t.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {t.isActive ? 'Active' : 'Désactivée'}
                    </span>
                  </div>

                  {qr ? (
                    <QrBlock
                      qr={qr}
                      restaurantId={restaurantId}
                      disabled={anyBusy}
                      {...qrActions(qr, t.label)}
                    />
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-stone-300 p-4 text-center">
                      <p className="text-sm text-stone-500">Aucun QR code actif</p>
                      {t.isActive && (
                        <button
                          type="button"
                          disabled={anyBusy}
                          onClick={() =>
                            void run(
                              `qr:${t.id}`,
                              () => authRequest(`${base}/tables/${t.id}/qr`, { method: 'POST' }),
                              `QR code créé pour « ${t.label} »`,
                            )
                          }
                          className="mt-3 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/30 transition active:scale-[0.97] disabled:opacity-50"
                        >
                          {busy === `qr:${t.id}` ? 'Création…' : 'Générer le QR code'}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                    <button
                      type="button"
                      disabled={anyBusy}
                      onClick={() =>
                        void run(
                          `toggle:${t.id}`,
                          () =>
                            authRequest(`${base}/tables/${t.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ isActive: !t.isActive }),
                            }),
                          t.isActive ? `« ${t.label} » désactivée` : `« ${t.label} » réactivée`,
                        )
                      }
                      className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-medium text-stone-700 transition active:scale-[0.97] disabled:opacity-50"
                    >
                      {t.isActive ? 'Désactiver la table' : 'Réactiver la table'}
                    </button>
                    <button
                      type="button"
                      disabled={anyBusy}
                      onClick={() =>
                        setConfirm({
                          kind: 'deleteTable',
                          id: t.id,
                          title: `Supprimer « ${t.label} » ?`,
                          text: 'La table et ses QR codes seront supprimés. Impossible si la table a déjà reçu des commandes : désactivez-la alors.',
                          confirmLabel: 'Supprimer',
                          okMessage: `« ${t.label} » supprimée`,
                        })
                      }
                      className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition active:scale-[0.97] disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {confirm && (
        <ConfirmSheet
          title={confirm.title}
          text={confirm.text}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.kind !== 'replace'}
          busy={anyBusy}
          onConfirm={() => void confirmRun()}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

export default function TablesPage() {
  return (
    <RequireRole roles={['MANAGER']}>
      {({ restaurantId }) => (
        <StaffLayout restaurantId={restaurantId} title="Tables & QR codes">
          <Tables restaurantId={restaurantId} />
        </StaffLayout>
      )}
    </RequireRole>
  );
}