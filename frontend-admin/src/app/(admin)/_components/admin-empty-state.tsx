'use client';

export function AdminEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-5 text-[12px] text-[var(--app-text-secondary)]">
      {label}
    </div>
  );
}
