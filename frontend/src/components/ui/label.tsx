'use client';

// biome-ignore lint/performance/noNamespaceImport: shadcn/ui convention uses Radix namespace to avoid colliding with wrapper component names
import * as LabelPrimitive from '@radix-ui/react-label';
// biome-ignore lint/performance/noNamespaceImport: React type namespace has no per-type named export alternative
import type * as React from 'react';

import { cn } from '@/lib/utils';

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
