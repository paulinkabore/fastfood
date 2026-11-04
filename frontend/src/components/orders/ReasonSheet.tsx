import { useState, type ReactNode } from 'react';
import { Sheet } from '../Sheet';
import { CloseIcon } from '../icons';

export function ReasonSheet({
  title,
  text,
  confirmLabel,
  chips,
  busy,
  error,
  errorExtra,
  onSubmit,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  chips: string[];
  busy: boolean;
  error: string | null;
  errorExtra?: ReactNode;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= 3;

  return (
    <Sheet label={title} onClose={onClose}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
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
        <p className="text-sm leading-relaxed text-stone-500">{text}</p>
        <div>
          <label htmlFor="reason" className="mb-1.5 block text-sm font-semibold text-stone-700">
            Motif (obligatoire)
          </label>
          <input
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ok && !busy) {
                e.preventDefault();
                onSubmit(reason.trim());
              }
            }}
            maxLength={200}
            autoFocus
            className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setReason(c)}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div className="space-y-2 rounded-2xl bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-700">{error}</p>
            {errorExtra}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl bg-stone-100 px-4 py-3.5 font-medium text-stone-700"
        >
          Retour
        </button>
        <button
          type="button"
          onClick={() => onSubmit(reason.trim())}
          disabled={busy || !ok}
          className="rounded-2xl bg-red-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-red-600/25 transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? 'En cours…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}