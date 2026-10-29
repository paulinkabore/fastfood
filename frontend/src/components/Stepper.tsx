import { MinusIcon, PlusIcon } from './icons';

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 20,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  const button =
    'grid h-8 w-8 place-items-center rounded-full bg-white text-stone-700 shadow-sm transition active:scale-90 disabled:opacity-40';
  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-stone-100 p-1">
      <button
        type="button"
        aria-label="Diminuer"
        className={button}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Augmenter"
        className={button}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
}