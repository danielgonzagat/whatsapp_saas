'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminSearchModal } from './admin-search-modal';
import {
  AdminSidebar,
  getInitialAdminSidebarExpanded,
  persistAdminSidebarExpanded,
} from './admin-sidebar';
import { SidebarToggleIcon } from './admin-sidebar-config';

const MOBILE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/chat': 'Nova conversa',
  '/produtos': 'Produtos',
  '/marketing': 'Marketing',
  '/vendas': 'Vendas',
  '/carteira': 'Carteira',
  '/relatorios': 'Relatórios',
  '/contas': 'Contas',
  '/compliance': 'Compliance',
  '/clientes': 'Clientes',
  '/configuracoes': 'Configurações',
  '/audit': 'Audit log',
  '/perfil': 'Perfil',
};

function labelForPath(pathname: string) {
  if (pathname.startsWith('/produtos')) {
    return MOBILE_LABELS['/produtos'];
  }
  if (pathname.startsWith('/marketing')) {
    return MOBILE_LABELS['/marketing'];
  }
  if (pathname.startsWith('/vendas')) {
    return MOBILE_LABELS['/vendas'];
  }
  if (pathname.startsWith('/carteira')) {
    return MOBILE_LABELS['/carteira'];
  }
  if (pathname.startsWith('/relatorios')) {
    return MOBILE_LABELS['/relatorios'];
  }
  if (pathname.startsWith('/contas')) {
    return MOBILE_LABELS['/contas'];
  }
  if (pathname.startsWith('/compliance')) {
    return MOBILE_LABELS['/compliance'];
  }
  if (pathname.startsWith('/clientes')) {
    return MOBILE_LABELS['/clientes'];
  }
  if (pathname.startsWith('/configuracoes')) {
    return MOBILE_LABELS['/configuracoes'];
  }
  if (pathname.startsWith('/audit')) {
    return MOBILE_LABELS['/audit'];
  }
  if (pathname.startsWith('/perfil')) {
    return MOBILE_LABELS['/perfil'];
  }
  if (pathname.startsWith('/chat')) {
    return MOBILE_LABELS['/chat'];
  }
  return MOBILE_LABELS[pathname] || 'Kloel';
}

/** Admin app shell. */
export function AdminAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const activeLabel = useMemo(() => labelForPath(pathname), [pathname]);

  useEffect(() => {
    setSidebarExpanded(getInitialAdminSidebarExpanded());
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) {
        setMobileMenuOpen(false);
      }
    };

    handleChange(media);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const toggleSidebar = () => {
    setSidebarExpanded((current) => {
      const next = !current;
      persistAdminSidebarExpanded(next);
      return next;
    });
  };

  const handleNewChat = () => {
    if (pathname === '/chat') {
      window.dispatchEvent(new Event('kloel:new-chat'));
    } else {
      startTransition(() => {
        router.push('/chat');
      });
      window.setTimeout(() => {
        window.dispatchEvent(new Event('kloel:new-chat'));
      }, 320);
    }
    setMobileMenuOpen(false);
  };

  const sidebar = (
    <AdminSidebar
      expanded={sidebarExpanded}
      onToggle={toggleSidebar}
      onNewChat={handleNewChat}
      onSearch={() => {
        setSearchOpen(true);
        setMobileMenuOpen(false);
      }}
    />
  );

  return (
    <div
      className="flex min-h-screen"
      style={{
        background: 'var(--app-bg-primary)',
        color: 'var(--app-text-primary)',
        fontFamily: "var(--font-sora), 'Sora', sans-serif",
      }}
    >
      <AdminSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

      <div className="hidden lg:block">{sidebar}</div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-[var(--app-bg-overlay)]"
            onClick={() => setMobileMenuOpen(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                (event.currentTarget as HTMLElement).click();
              }
            }}
          />
          <div className="relative h-full w-[min(86vw,320px)]">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className="sticky top-0 z-20 border-b border-[var(--app-border-primary)] px-4 py-3 backdrop-blur-[14px] lg:hidden"
          style={{ background: 'color-mix(in srgb, var(--app-bg-primary) 96%, transparent)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir navegação"
              className="flex size-10 items-center justify-center rounded-xl border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] text-[var(--app-text-primary)] shadow-[var(--app-shadow-sm)]"
            >
              <SidebarToggleIcon color="var(--app-text-primary)" size={18} />
            </button>

            <div className="min-w-0 flex-1">
              <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
                Kloel
              </div>
              <div className="truncate text-[15px] font-bold text-[var(--app-text-primary)]">
                {activeLabel}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] px-3 text-[12px] font-semibold text-[var(--app-text-secondary)] shadow-[var(--app-shadow-sm)]"
            >
              <Search size={14} aria-hidden="true" />
              Buscar
            </button>
          </div>
        </div>

        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
