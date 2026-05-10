'use client';

import useCommandPalette from '@/hooks/useCommandPalette';
import { useKycCompletion, useKycStatus } from '@/hooks/useKyc';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import { KLOEL_CHAT_ROUTE } from '@/lib/kloel-dashboard-context';
import { KLOEL_THEME } from '@/lib/kloel-theme';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { CommandPalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { KloelSidebar } from './sidebar/KloelSidebar';
import { useSidebarState } from './sidebar/useSidebarState';
import { VIEW_ROUTES, SUB_ROUTES, MOBILE_VIEW_LABELS, resolveRoute, resolveActiveView, resolveActiveSubView } from './AppShell.routes';
import { MobileTopBar, KycBanner } from './AppShell.banners';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { paletteProps, executeCommand, open: openPalette } = useCommandPalette();
  const { expanded: sidebarExpanded, toggle: toggleSidebar } = useSidebarState();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<'full' | 'conversations'>('full');
  const newChatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isDesktop, isMobile } = useResponsiveViewport();
  const mobileHeaderOffset = isMobile ? 68 : 0;

  useEffect(
    () => () => {
      if (newChatTimer.current) {
        clearTimeout(newChatTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (isDesktop) {
      setMobileMenuOpen(false);
    }
  }, [isDesktop]);

  const { status: kycData, isLoading: kycLoading, error: kycError } = useKycStatus();
  const { completion } = useKycCompletion();

  const activeView = resolveActiveView(pathname);
  const activeSubView = resolveActiveSubView(pathname, searchParams);
  const currentRoute = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const isChatRoute = pathname === KLOEL_CHAT_ROUTE;
  const activeViewLabel = pathname.startsWith('/products/')
    ? 'Editar produto'
    : pathname === KLOEL_CHAT_ROUTE
      ? 'Nova conversa'
      : MOBILE_VIEW_LABELS[activeView] || 'Kloel';

  useEffect(() => {
    const routes = Array.from(
      new Set([
        KLOEL_CHAT_ROUTE,
        ...Object.values(VIEW_ROUTES),
        ...Object.values(SUB_ROUTES).map((route) => route.split('?')[0]),
      ]),
    );

    for (const route of routes) {
      try {
        void router.prefetch(route);
      } catch {}
    }
  }, [router]);

  const isExemptPage =
    pathname.startsWith('/settings') ||
    pathname.startsWith('/account') ||
    pathname.startsWith('/canvas');
  const kycComplete = (completion?.percentage ?? 0) >= 100;
  const showKycBanner =
    !kycLoading &&
    !kycError &&
    kycData &&
    kycData.kycStatus !== 'approved' &&
    !kycComplete &&
    !isExemptPage;

  const handleNavigate = useCallback(
    (view: string, subView?: string) => {
      const route = resolveRoute(view, subView);
      const routePath = route.split('?')[0];
      if ((routePath === pathname && !route.includes('?')) || route === currentRoute) {
        setMobileMenuOpen(false);
        return;
      }

      startTransition(() => {
        router.push(route);
      });
      setMobileMenuOpen(false);
    },
    [currentRoute, pathname, router],
  );

  const handleNewChat = useCallback(() => {
    if (pathname === KLOEL_CHAT_ROUTE) {
      window.dispatchEvent(new Event('kloel:new-chat'));
    } else {
      startTransition(() => {
        router.push(KLOEL_CHAT_ROUTE);
      });
      if (newChatTimer.current) {
        clearTimeout(newChatTimer.current);
      }
      newChatTimer.current = setTimeout(
        () => window.dispatchEvent(new Event('kloel:new-chat')),
        500,
      );
    }
    setMobileMenuOpen(false);
  }, [pathname, router]);

  const handleSearch = useCallback(() => {
    setPaletteMode('conversations');
    openPalette();
  }, [openPalette]);

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        height: '100dvh',
        background: KLOEL_THEME.bgPrimary,
        fontFamily: "'Sora', sans-serif",
        color: KLOEL_THEME.textPrimary,
        overflow: 'visible',
      }}
    >
      <CommandPalette {...paletteProps} onSelect={executeCommand} mode={paletteMode} />

      <div className="hidden lg:block" style={{ display: isDesktop ? 'block' : 'none' }}>
        <KloelSidebar
          activeView={activeView}
          activeSubView={activeSubView}
          onNavigate={handleNavigate}
          onNewChat={handleNewChat}
          onSearch={handleSearch}
          expanded={sidebarExpanded}
          onToggle={toggleSidebar}
        />
      </div>

      {!isDesktop && mobileMenuOpen && (
        <div className="fixed inset-0 lg:hidden" style={{ zIndex: 300 }}>
          <button
            type="button"
            className="absolute inset-0"
            style={{
              background: KLOEL_THEME.bgOverlay,
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu"
          />
          <div className="relative h-full" style={{ width: 'min(86vw, 320px)' }}>
            <KloelSidebar
              activeView={activeView}
              activeSubView={activeSubView}
              onNavigate={handleNavigate}
              onNewChat={handleNewChat}
              onSearch={handleSearch}
              expanded={true}
              onToggle={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          minHeight: 0,
          overflowY: isChatRoute ? 'hidden' : 'auto',
          willChange: 'scroll-position',
        }}
      >
        {!isDesktop && (
          <MobileTopBar
            activeViewLabel={activeViewLabel}
            onOpenMenu={() => setMobileMenuOpen(true)}
            onSearch={handleSearch}
          />
        )}
        {showKycBanner && (
          <KycBanner
            mobileHeaderOffset={mobileHeaderOffset}
            isMobile={isMobile}
            percentage={completion?.percentage ?? 0}
            onComplete={() =>
              startTransition(() => {
                router.push('/settings');
              })
            }
          />
        )}

        <ErrorBoundary>{children}</ErrorBoundary>
      </div>
    </div>
  );
}

export default AppShell;
