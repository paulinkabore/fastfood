import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Sheet({
  label,
  onClose,
  centered = false,
  children,
}: {
  label: string;
  onClose: () => void;
  // Boîte centrée à l'écran (formulaires courts) au lieu d'une feuille collée en bas
  centered?: boolean;
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

  // Affichée directement dans <body> : un parent avec un flou (en-tête) la collerait sinon en haut de page
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex print:hidden justify-center ${
        centered ? 'items-center p-4' : 'items-end sm:items-center'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-stone-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative flex max-h-[92dvh] w-full animate-sheet-up flex-col overflow-hidden bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl ${
          centered ? 'max-w-md rounded-3xl' : 'rounded-t-3xl'
        }`}>
        {children}
      </div>
    </div>,
    document.body,
  );
}