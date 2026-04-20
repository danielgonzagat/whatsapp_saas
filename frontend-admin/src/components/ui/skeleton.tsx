import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Skeleton. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('animate-pulse rounded-sm bg-muted', className)} aria-hidden {...props} />
  );
}
