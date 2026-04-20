'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Avatar. */
export function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex size-8 shrink-0 overflow-hidden rounded-full border border-border bg-secondary text-xs uppercase tracking-wider text-secondary-foreground',
        className,
      )}
      {...props}
    />
  );
}

/** Avatar fallback. */
export function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn('flex size-full items-center justify-center font-semibold', className)}
      {...props}
    />
  );
}
