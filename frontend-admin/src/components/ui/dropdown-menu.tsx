'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type * as React from 'react';
import { cn } from '@/lib/utils';

/** Dropdown menu. */
export const DropdownMenu = DropdownMenuPrimitive.Root;
/** Dropdown menu trigger. */
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
/** Dropdown menu group. */
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
/** Dropdown menu portal. */
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

/** Dropdown menu content. */
export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[14rem] overflow-hidden rounded-md border border-border bg-card p-1 text-card-foreground shadow-sm',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

/** Dropdown menu item. */
export function DropdownMenuItem({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4",
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  );
}

/** Dropdown menu label. */
export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

/** Dropdown menu separator. */
export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
