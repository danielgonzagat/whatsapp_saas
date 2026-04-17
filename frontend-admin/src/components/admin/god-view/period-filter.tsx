'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AdminHomePeriod } from '@/lib/api/admin-dashboard-api';
import { CustomRangePopover, type CustomRangeValue } from './custom-range-popover';

const OPTIONS: { value: AdminHomePeriod; label: string }[] = [
  { value: 'TODAY', label: 'Hoje' },
  { value: '30D', label: '30 dias' },
];

export interface PeriodFilterProps {
  value: AdminHomePeriod;
  onChange: (next: AdminHomePeriod) => void;
  customRange?: CustomRangeValue;
  onApplyCustomRange?: (next: CustomRangeValue) => void;
  className?: string;
}

export function PeriodFilter({
  value,
  onChange,
  customRange,
  onApplyCustomRange,
  className,
}: PeriodFilterProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Período do dashboard"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border bg-card p-1',
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-sm px-3 py-1 text-xs font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
      {customRange && onApplyCustomRange ? (
        <CustomRangePopover
          value={customRange}
          onApply={(next) => {
            onApplyCustomRange(next);
            onChange('CUSTOM');
          }}
        />
      ) : (
        <Button
          type="button"
          size="sm"
          variant={value === 'CUSTOM' ? 'default' : 'ghost'}
          onClick={() => onChange('CUSTOM')}
          className="rounded-sm px-3 py-1 text-xs font-medium"
        >
          Personalizado
        </Button>
      )}
    </div>
  );
}
