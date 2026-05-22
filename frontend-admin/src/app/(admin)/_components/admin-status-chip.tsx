'use client';

export function AdminStatusChip({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const config =
    normalized === 'OPEN'
      ? {
          border: 'border-amber-500/20',
          bg: 'bg-amber-500/10',
          text: 'text-amber-600',
          label: 'Aberto',
        }
      : normalized === 'PENDING'
        ? {
            border: 'border-[var(--app-accent-medium)]',
            bg: 'bg-[var(--app-accent-light)]',
            text: 'text-[var(--app-accent)]',
            label: 'Pendente',
          }
        : normalized === 'RESOLVED'
          ? {
              border: 'border-emerald-500/20',
              bg: 'bg-emerald-500/10',
              text: 'text-emerald-600',
              label: 'Resolvido',
            }
          : {
              border: 'border-[var(--app-border-primary)]',
              bg: 'bg-[var(--app-bg-secondary)]',
              text: 'text-[var(--app-text-secondary)]',
              label: status,
            };

  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-bold ${config.border} ${config.bg} ${config.text}`}
    >
      {config.label}
    </span>
  );
}
