import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MetricNumber, type MetricNumberProps } from '@/components/ui/metric-number';
import { cn } from '@/lib/utils';

/** Stat card props shape. */
export interface StatCardProps {
  /** Label property. */
  label: string;
  /** Primary metric value. Null renders an em-dash. */
  value: number | null | undefined;
  /** Kind passed to MetricNumber (currency-brl / integer / percentage). */
  kind?: MetricNumberProps['kind'];
  /** Optional secondary line rendered below the main metric (e.g. unit). */
  sublabel?: string;
  /** Optional delta percentage vs previous period. Null renders nothing. */
  deltaPct?: number | null;
  /**
   * When the value comes from a KPI that cannot be computed yet (for
   * example because SP-9 platform fees haven't been configured),
   * pass a reason here — it renders as a muted tooltip instead of a delta.
   */
  unavailableReason?: string;
  /** Class name property. */
  className?: string;
  /** Children property. */
  children?: ReactNode;
}

function formatDelta(pct: number): string {
  const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1);
  return `${pct >= 0 ? '+' : ''}${rounded}%`;
}

/**
 * Ember accent arrow for positive, muted for negative/zero. Per the design
 * contract we do NOT use green/red — the palette is Ember + neutrals.
 */
function DeltaPill({ pct }: { pct: number }) {
  const positive = pct > 0;
  const negative = pct < 0;
  const Icon = positive ? ArrowUp : negative ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]',
        positive && 'border-primary/40 bg-primary/10 text-primary',
        negative && 'border-border bg-muted text-muted-foreground',
        !positive && !negative && 'border-border bg-muted text-muted-foreground',
      )}
    >
      <Icon className="size-3" aria-hidden />
      {formatDelta(pct)}
    </span>
  );
}

/** Stat card. */
export function StatCard({
  label,
  value,
  kind = 'integer',
  sublabel,
  deltaPct,
  unavailableReason,
  className,
  children,
}: StatCardProps) {
  return (
    <Card className={cn('flex h-full flex-col', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
          {deltaPct !== undefined && deltaPct !== null ? <DeltaPill pct={deltaPct} /> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1">
        <MetricNumber
          value={unavailableReason ? null : value}
          kind={kind}
          className="text-2xl md:text-3xl"
        />
        {sublabel ? <span className="text-xs text-muted-foreground">{sublabel}</span> : null}
        {unavailableReason ? (
          <span
            title={unavailableReason}
            className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
          >
            {unavailableReason}
          </span>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}
