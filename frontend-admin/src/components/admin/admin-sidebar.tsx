'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ADMIN_SIDEBAR_SECTIONS, type AdminSidebarItem } from './admin-sidebar-config';
import type { AdminRole } from '@/lib/auth/admin-session-types';

function roleAllows(minRole: AdminRole | undefined, role: AdminRole): boolean {
  if (!minRole) return true;
  const order: Record<AdminRole, number> = { STAFF: 0, MANAGER: 1, OWNER: 2 };
  return order[role] >= order[minRole];
}

interface AdminSidebarProps {
  role: AdminRole;
}

export function AdminSidebar({ role }: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'group flex h-svh flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out',
        collapsed ? 'w-[72px]' : 'w-[264px]',
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-5">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="h-6 w-6 shrink-0 rounded-sm border border-primary bg-primary/10"
          />
          {!collapsed ? (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">Kloel Admin</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Painel interno
              </span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expandir menu' : 'Retrair menu'}
          className="flex h-7 w-7 items-center justify-center rounded-sm border border-transparent text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-6">
        {ADMIN_SIDEBAR_SECTIONS.map((section, idx) => {
          const visibleItems = section.items.filter((item) => roleAllows(item.minRole, role));
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.key} className="flex flex-col">
              {idx > 0 ? <Separator className="my-3 bg-border/70" /> : null}
              <ul className="flex flex-col gap-0.5">
                {visibleItems.map((item) => (
                  <SidebarRow
                    key={item.key}
                    item={item}
                    pathname={pathname}
                    collapsed={collapsed}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function SidebarRow({
  item,
  pathname,
  collapsed,
}: {
  item: AdminSidebarItem;
  pathname: string;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const href = item.href ?? '/';
  const isActive =
    pathname === href ||
    (href !== '/' && pathname.startsWith(`${href}/`)) ||
    (href === '/' && pathname === '/');

  if (!item.href) {
    return (
      <li>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            collapsed && 'justify-center px-2',
          )}
        >
          <Icon className="size-4" />
          {!collapsed ? <span>{item.label}</span> : null}
        </button>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={href}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          collapsed && 'justify-center px-2',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <Icon className="size-4" />
        {!collapsed ? <span>{item.label}</span> : null}
      </Link>
    </li>
  );
}
