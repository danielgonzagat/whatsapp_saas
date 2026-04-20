import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Chart container props shape. */
export interface ChartContainerProps {
  /** Title property. */
  title: string;
  /** Description property. */
  description?: string;
  /** Class name property. */
  className?: string;
  /** Footer property. */
  footer?: ReactNode;
  /** Children property. */
  children: ReactNode;
}

/**
 * Wraps a recharts chart in a Card with a consistent header. Charts inside
 * MUST use ResponsiveContainer so the rendering fills the card width.
 */
export function ChartContainer({
  title,
  description,
  className,
  footer,
  children,
}: ChartContainerProps) {
  return (
    <Card className={cn('flex h-full flex-col', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <div className="min-h-[240px] flex-1">{children}</div>
        {footer ? (
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
