'use client';

export function AdminRevenueBars({
  labels,
  values,
  comparison,
}: {
  labels: string[];
  values: number[];
  comparison: number[];
}) {
  const maxValue = Math.max(1, ...values, ...comparison);

  return (
    <div className="grid h-[196px] grid-cols-7 items-end gap-2 md:gap-3">
      {labels.map((label, index) => {
        const current = values[index] || 0;
        const previous = comparison[index] || 0;
        const currentHeight = Math.max(6, Math.round((current / maxValue) * 162));
        const previousHeight = Math.max(4, Math.round((previous / maxValue) * 162));

        return (
          <div
            key={`${label}-${index}`}
            className="flex min-w-0 flex-col items-center justify-end gap-1.5"
          >
            <div className="flex h-[168px] w-full items-end justify-center gap-1">
              <div
                className="w-1.5 rounded-t-[3px] bg-[var(--app-accent-medium)]"
                style={{ height: previousHeight }}
              />
              <div
                className="w-2 rounded-t-[3px] bg-[var(--app-accent)]"
                style={{ height: currentHeight }}
              />
            </div>
            <span className="font-mono text-[10px] text-[var(--app-text-tertiary)]">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
