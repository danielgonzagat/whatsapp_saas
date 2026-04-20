'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Custom range value shape. */
export interface CustomRangeValue {
  from: string;
  to: string;
}

/** Custom range popover. */
export function CustomRangePopover({
  value,
  onApply,
}: {
  value: CustomRangeValue;
  onApply: (next: CustomRangeValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CustomRangeValue>(value);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value.from, value.to]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open]);

  const label =
    value.from && value.to
      ? `${new Date(value.from).toLocaleDateString('pt-BR')} - ${new Date(value.to).toLocaleDateString('pt-BR')}`
      : 'Personalizado';

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant={open || (value.from && value.to) ? 'default' : 'ghost'}
        onClick={() => setOpen((current) => !current)}
        className="rounded-sm px-3 py-1 text-xs font-medium"
      >
        {label}
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] p-4 shadow-2xl">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
            Período personalizado
          </div>
          <div className="grid gap-3">
            <label className="grid gap-1 text-[12px] text-[var(--app-text-secondary)]">
              Início
              <input
                type="date"
                value={draft.from}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, from: event.target.value }))
                }
                className="h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
              />
            </label>
            <label className="grid gap-1 text-[12px] text-[var(--app-text-secondary)]">
              Fim
              <input
                type="date"
                value={draft.to}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, to: event.target.value }))
                }
                className="h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!draft.from || !draft.to) {
                  return;
                }
                onApply(draft);
                setOpen(false);
              }}
              disabled={!draft.from || !draft.to}
            >
              Aplicar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
