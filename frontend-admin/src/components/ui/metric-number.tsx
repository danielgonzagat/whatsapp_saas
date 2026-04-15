import type * as React from 'react';
import { cn } from '@/lib/utils';

export interface MetricNumberProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Integer cents when `kind='currency-brl'`; raw number otherwise. */
  value: number | null | undefined;
  kind?: 'currency-brl' | 'integer' | 'percentage';
  /** Fraction digits for percentage mode (defaults to 1). */
  fractionDigits?: number;
  /** What to render when `value` is null/undefined. Defaults to `—`. */
  emptyPlaceholder?: string;
}

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});
const INT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

function formatCurrencyFromCents(cents: number): string {
  return BRL.format(cents / 100);
}

function formatPercentage(value: number, digits: number): string {
  return `${(value * 100).toFixed(digits).replace('.', ',')}%`;
}

/**
 * Renders a numeric KPI value in JetBrains Mono (per the visual contract —
 * numbers are always monospace), formatted for pt-BR. Null/undefined
 * produces an em-dash so empty states remain visually honest instead of
 * showing "0" or "NaN".
 */
export function MetricNumber({
  value,
  kind = 'integer',
  fractionDigits = 1,
  emptyPlaceholder = '—',
  className,
  ...rest
}: MetricNumberProps) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span className={cn('font-mono tabular-nums text-muted-foreground', className)} {...rest}>
        {emptyPlaceholder}
      </span>
    );
  }

  let text: string;
  switch (kind) {
    case 'currency-brl':
      text = formatCurrencyFromCents(value);
      break;
    case 'percentage':
      text = formatPercentage(value, fractionDigits);
      break;
    case 'integer':
    default:
      text = INT.format(value);
      break;
  }

  return (
    <span className={cn('font-mono tabular-nums text-foreground', className)} {...rest}>
      {text}
    </span>
  );
}
