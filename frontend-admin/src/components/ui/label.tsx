'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  );
}
