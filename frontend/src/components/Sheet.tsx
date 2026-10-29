import { useEffect, type ReactNode } from 'react';

export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-stone-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92dvh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
        {children}
      </div>
    </div>
  );
}