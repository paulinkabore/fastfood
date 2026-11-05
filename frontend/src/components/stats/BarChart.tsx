type Item = { label: string; value: number; title: string };

// Histogramme simple : une barre par élément, les libellés sont espacés pour rester lisibles
export function BarChart({
  items,
  ariaLabel,
  tone = 'bg-brand-500',
}: {
  items: Item[];
  ariaLabel: string;
  tone?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  const step = Math.max(1, Math.ceil(items.length / 8));

  return (
    <div role="img" aria-label={ariaLabel}>
      <div className="flex h-44 items-end gap-0.5">
        {items.map((it, i) => {
          const pct = max > 0 ? (it.value / max) * 100 : 0;
          return (
            <div key={i} title={it.title} className="flex h-full flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-t-md transition-all ${it.value > 0 ? tone : 'bg-stone-100'}`}
                style={{ height: it.value > 0 ? `${Math.max(pct, 4)}%` : '3%' }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex h-4 gap-0.5">
        {items.map((it, i) => (
          <div key={i} className="relative flex-1">
            {i % step === 0 && (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-stone-400">
                {it.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}