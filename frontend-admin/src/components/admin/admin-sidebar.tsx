'use client';

import Link from 'next/link';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ADMIN_SIDEBAR_SECTIONS,
  HomeIcon,
  SidebarToggleIcon,
  type AdminSidebarItem,
} from './admin-sidebar-config';
import { AdminSidebarRecents } from './admin-sidebar-recents';
import { AdminSidebarUserMenu } from './admin-sidebar-user-menu';
import { useAdminSession } from '@/lib/auth/admin-session-context';

const ADMIN_SIDEBAR_STORAGE_PARTS = ['kloel-admin', 'sidebar-expanded'] as const;
const ADMIN_SIDEBAR_STORAGE_SLOT = ADMIN_SIDEBAR_STORAGE_PARTS.join(':');
const ADMIN_SIDEBAR_COPY = {
  brand: 'Kloel',
  openSidebar: 'Abrir sidebar',
  collapseSidebar: 'Recolher sidebar',
  newChat: 'Novo chat',
  search: 'Buscar',
} as const;

type AdminSidebarProps = {
  expanded: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSearch: () => void;
};

function roleAllows(minRole: 'OWNER' | 'MANAGER' | 'STAFF' | undefined, role: string) {
  if (!minRole) {
    return true;
  }
  const order = { STAFF: 0, MANAGER: 1, OWNER: 2 } as const;
  const current = order[role as keyof typeof order] ?? 0;
  return current >= order[minRole];
}

function routeMatches(
  href: string,
  pathname: string,
  searchParams: { get(name: string): string | null },
) {
  const [routePath, routeQuery] = href.split('?');
  if (routePath !== pathname) {
    return false;
  }
  if (!routeQuery) {
    return true;
  }

  const expected = new URLSearchParams(routeQuery);
  for (const [key, value] of expected.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }
  return true;
}

/** Admin sidebar. */
export function AdminSidebar({ expanded, onToggle, onNewChat, onSearch }: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { admin } = useAdminSession();
  const [expandedNav, setExpandedNav] = useState<string | null>(null);

  useEffect(() => {
    for (const section of ADMIN_SIDEBAR_SECTIONS) {
      const activeParent = section.items.find((item) =>
        item.sub?.some((sub) => routeMatches(sub.href, pathname, searchParams)),
      );
      if (activeParent) {
        setExpandedNav(activeParent.key);
        return;
      }
    }
  }, [pathname, searchParams]);

  const quickButtonBase =
    'flex w-full items-center rounded-md border-none bg-transparent px-2.5 py-2 text-left transition-colors hover:bg-[var(--app-bg-hover)]';

  return (
    <aside
      className="relative flex h-screen flex-col border-r border-[var(--app-border-subtle)] bg-[var(--app-bg-sidebar)]"
      style={{
        width: expanded ? 240 : 52,
        transition: 'width 200ms ease',
      }}
    >
      <div
        className="flex min-h-[52px] items-center"
        style={{
          justifyContent: expanded ? 'space-between' : 'center',
          padding: expanded ? '12px 6px 8px' : '12px 0 8px',
          transition: 'padding 150ms ease',
        }}
      >
        {expanded ? (
          <Link
            href="/"
            className="flex min-h-9 items-center pl-2.5 no-underline"
            aria-label={ADMIN_SIDEBAR_COPY.brand}
          >
            <span
              style={{
                display: 'inline-block',
                fontFamily: "var(--font-sora), 'Sora', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                color: 'var(--app-text-primary)',
              }}
            >
              {ADMIN_SIDEBAR_COPY.brand}
            </span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            title={ADMIN_SIDEBAR_COPY.openSidebar}
            className="flex h-10 w-full items-center justify-center rounded-md bg-transparent"
          >
            <span className="flex h-6 w-12 items-center justify-center">
              <SidebarToggleIcon color="var(--app-text-secondary)" size={18} />
            </span>
          </button>
        )}

        {expanded ? (
          <button
            type="button"
            onClick={onToggle}
            title={ADMIN_SIDEBAR_COPY.collapseSidebar}
            className="flex size-8 items-center justify-center rounded-md bg-transparent transition-colors hover:bg-[var(--app-bg-hover)]"
          >
            <SidebarToggleIcon color="var(--app-text-tertiary)" size={16} />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-0 px-1.5">
        <button
          type="button"
          onClick={onNewChat}
          title={!expanded ? ADMIN_SIDEBAR_COPY.newChat : undefined}
          className={`${quickButtonBase} ${expanded ? 'gap-2.5' : 'justify-center px-0'}`}
        >
          <span className={`flex h-6 items-center justify-center ${expanded ? 'w-6' : 'w-12'}`}>
            <Plus size={18} className="text-[var(--app-text-secondary)]" />
          </span>
          {expanded ? (
            <span className="text-[13px] text-[var(--app-text-secondary)]">
              {ADMIN_SIDEBAR_COPY.newChat}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onSearch}
          title={!expanded ? ADMIN_SIDEBAR_COPY.search : undefined}
          className={`${quickButtonBase} ${expanded ? 'gap-2.5' : 'justify-center px-0'}`}
        >
          <span className={`flex h-6 items-center justify-center ${expanded ? 'w-6' : 'w-12'}`}>
            <Search size={18} className="text-[var(--app-text-secondary)]" />
          </span>
          {expanded ? (
            <span className="text-[13px] text-[var(--app-text-secondary)]">
              {ADMIN_SIDEBAR_COPY.search}
            </span>
          ) : null}
        </button>
      </div>

      <div className="mx-3 my-2 h-px bg-[var(--app-border-subtle)]" />

      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-2">
        {ADMIN_SIDEBAR_SECTIONS.map((section) => {
          const items = section.items.filter((item) =>
            roleAllows(item.minRole, admin?.role || 'STAFF'),
          );
          if (items.length === 0) {
            return null;
          }

          return (
            <div key={section.key} className="px-1.5">
              {section.key !== 'operational' ? (
                <div className="mx-1.5 my-2 h-px bg-[var(--app-border-subtle)]" />
              ) : null}
              <nav className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <SidebarItemRow
                    key={item.key}
                    item={item}
                    expanded={expanded}
                    expandedNav={expandedNav}
                    pathname={pathname}
                    searchParams={searchParams}
                    onNavigate={(href) => router.push(href)}
                    onToggleNav={(key) =>
                      setExpandedNav((current) => (current === key ? null : key))
                    }
                  />
                ))}
              </nav>
            </div>
          );
        })}

        <AdminSidebarRecents expanded={expanded} />
      </div>

      <AdminSidebarUserMenu expanded={expanded} />
    </aside>
  );
}

function SidebarItemRow({
  item,
  expanded,
  expandedNav,
  pathname,
  searchParams,
  onNavigate,
  onToggleNav,
}: {
  item: AdminSidebarItem;
  expanded: boolean;
  expandedNav: string | null;
  pathname: string;
  searchParams: { get(name: string): string | null };
  onNavigate: (href: string) => void;
  onToggleNav: (key: string) => void;
}) {
  const Icon = item.icon === HomeIcon ? HomeIcon : item.icon;
  const active =
    routeMatches(item.href, pathname, searchParams) ||
    Boolean(item.sub?.some((sub) => routeMatches(sub.href, pathname, searchParams)));
  const hasSubs = Boolean(item.sub?.length);
  const isExpanded = expandedNav === item.key;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (expanded && hasSubs) {
            onToggleNav(item.key);
            return;
          }
          onNavigate(item.href);
        }}
        title={!expanded ? item.label : undefined}
        className={`flex w-full items-center rounded-md bg-transparent px-2.5 py-2 text-left transition-colors hover:bg-[var(--app-bg-hover)] ${
          expanded ? 'gap-2.5' : 'justify-center px-0'
        }`}
      >
        <span className={`flex h-6 items-center justify-center ${expanded ? 'w-6' : 'w-12'}`}>
          <Icon
            size={18}
            className={active ? 'text-[var(--app-accent)]' : 'text-[var(--app-text-secondary)]'}
          />
        </span>

        {expanded ? (
          <>
            <span
              className={`flex-1 truncate text-[13px] ${
                active
                  ? 'font-semibold text-[var(--app-accent)]'
                  : 'text-[var(--app-text-secondary)]'
              }`}
            >
              {item.label}
            </span>
            {hasSubs ? (
              <ChevronRight
                size={14}
                className={`text-[var(--app-text-tertiary)] transition-transform ${
                  isExpanded ? 'rotate-90' : 'rotate-0'
                }`}
                aria-hidden="true"
              />
            ) : null}
          </>
        ) : null}
      </button>

      {expanded && hasSubs && isExpanded ? (
        <div className="flex flex-col gap-0.5 pb-1">
          {item.sub?.map((sub) => {
            const subActive = routeMatches(sub.href, pathname, searchParams);
            return (
              <button
                key={sub.key}
                type="button"
                onClick={() => onNavigate(sub.href)}
                className="rounded-md bg-transparent px-9 py-[7px] text-left transition-colors hover:bg-[var(--app-bg-hover)]"
              >
                <span
                  className={`truncate text-[12px] ${
                    subActive
                      ? 'font-semibold text-[var(--app-accent)]'
                      : 'text-[var(--app-text-tertiary)]'
                  }`}
                >
                  {sub.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Get initial admin sidebar expanded. */
export function getInitialAdminSidebarExpanded() {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_SLOT) === 'true';
  } catch {
    return false;
  }
}

/** Persist admin sidebar expanded. */
export function persistAdminSidebarExpanded(expanded: boolean) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(ADMIN_SIDEBAR_STORAGE_SLOT, String(expanded));
  } catch {}
}
