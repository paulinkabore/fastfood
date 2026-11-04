import { Sheet } from './Sheet';

export function ConfirmSheet({
  title,
  text,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet label={title} onClose={onClose}>
      <div className="space-y-2 px-5 pb-2 pt-6">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm leading-relaxed text-stone-500">{text}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl bg-stone-100 px-4 py-3.5 font-medium text-stone-700"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`rounded-2xl px-4 py-3.5 font-semibold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60 ${
            danger ? 'bg-red-600 shadow-red-600/25' : 'bg-stone-900 shadow-stone-900/20'
          }`}
        >
          {busy ? 'En cours…' : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}