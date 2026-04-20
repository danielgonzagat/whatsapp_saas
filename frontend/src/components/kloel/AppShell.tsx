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
import { SidebarToggleIcon } from './sidebar/SidebarToggleIcon';
import { NAV } from './sidebar/sidebar-config';
import { useSidebarState } from './sidebar/useSidebarState';

const U0300__U036F_RE = /[\u0300-\u036f]/g;
const S_RE = /\s+/g;
// ════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════

interface AppShellProps {
  children: ReactNode;
}

// ════════════════════════════════════════════
// VIEW -> ROUTE MAPPING
// ════════════════════════════════════════════

const VIEW_ROUTES: Record<string, string> = {
  home: '/dashboard',
  produtos: '/products',
  marketing: '/marketing',
  sites: '/sites',
  canvas: '/canvas',
  vendas: '/vendas',
  carteira: '/carteira',
  relatorio: '/analytics',
  parcerias: '/parcerias',
  ferramentas: '/ferramentas',
  anuncios: '/anuncios',
};

const SUB_ROUTES: Record<string, string> = {
  'produtos-meus-produtos': '/products',
  'produtos-checkout': '/checkout',
  'produtos-area-de-membros': '/produtos/area-membros',
  'produtos-afiliar-se': '/produtos/afiliar-se',
  'marketing-conversas': '/marketing',
  'marketing-visao-geral': '/marketing',
  'marketing-whatsapp': '/marketing/whatsapp',
  'marketing-instagram': '/marketing/instagram',
  'marketing-tiktok': '/marketing/tiktok',
  'marketing-facebook': '/marketing/facebook',
  'marketing-email': '/marketing/email',
  'sites-dominios': '/sites/dominios',
  'sites-hospedagem': '/sites/hospedagem',
  'sites-criar-site': '/sites/criar',
  'sites-editar-site': '/sites/editar',
  'sites-apps': '/sites/apps',
  'sites-protecao': '/sites/protecao',
  'anuncios-war-room': '/anuncios',
  'anuncios-meta-ads': '/anuncios/meta',
  'anuncios-google-ads': '/anuncios/google',
  'anuncios-tiktok-ads': '/anuncios/tiktok',
  'anuncios-rastreamento': '/anuncios/rastreamento',
  'anuncios-regras-ia': '/anuncios/regras',
  'vendas-gestao-de-vendas': '/vendas',
  'vendas-gestao-de-assinaturas': '/vendas/assinaturas',
  'vendas-gestao-produtos-fisicos': '/vendas/fisicos',
  'vendas-pipeline-crm': '/vendas/pipeline',
  crm: '/vendas/pipeline',
  'carteira-saldo': '/carteira/saldo',
  'carteira-extrato': '/carteira/extrato',
  'carteira-saques': '/carteira/saques',
  'carteira-antecipacoes': '/carteira/antecipacoes',
  'parcerias-central-de-colaboradores': '/parcerias/colaboradores',
  'parcerias-afiliados-e-produtores': '/parcerias/afiliados',
  'parcerias-chat': '/parcerias/chat',
  'relatorio-vendas': '/analytics?tab=vendas',
  'relatorio-operacoes': '/analytics?tab=vendas',
  'relatorio-after-pay': '/analytics?tab=afterpay',
  'relatorio-churn-rate': '/analytics?tab=churn',
  'relatorio-abandonos': '/analytics?tab=abandonos',
  'relatorio-desemp.-afiliados': '/analytics?tab=afiliados',
  'relatorio-indicadores': '/analytics?tab=indicadores',
  'relatorio-assinaturas': '/analytics?tab=assinaturas',
  'relatorio-indicadores-produto': '/analytics?tab=ind_prod',
  'relatorio-motivos-recusa': '/analytics?tab=recusa',
  'relatorio-origem-vendas': '/analytics?tab=origem',
  'relatorio-metricas-produtos': '/analytics?tab=metricas',
  'relatorio-estornos': '/analytics?tab=estornos',
  'relatorio-hist.-chargeback': '/analytics?tab=chargeback',
  'ferramentas-impulsione-suas-vendas': '/ferramentas/impulsione',
  'ferramentas-recupere-vendas': '/ferramentas/recupere',
  'ferramentas-fale-com-seus-leads': '/ferramentas/fale',
  'ferramentas-gerencie-seu-negocio': '/ferramentas/gerencie',
  'ferramentas-ver-todas': '/ferramentas/ver-todas',
};

const MOBILE_VIEW_LABELS: Record<string, string> = {
  home: 'Home',
  produtos: 'Produtos',
  marketing: 'Marketing',
  sites: 'Sites',
  canvas: 'Canvas',
  vendas: 'Vendas',
  carteira: 'Carteira',
  relatorio: 'Relatórios',
  parcerias: 'Parcerias',
  ferramentas: 'Ferramentas',
  anuncios: 'Anúncios',
};

function resolveRoute(view: string, subView?: string): string {
  if (subView) {
    // Convert label to slug key: "Conversas" → "marketing-conversas"
    const slug = subView
      .toLowerCase()
      .normalize('NFD')
      .replace(U0300__U036F_RE, '')
      .replace(S_RE, '-');
    const subKey = `${view}-${slug}`;
    if (SUB_ROUTES[subKey]) {
      return SUB_ROUTES[subKey];
    }
    // Fallback: try the raw subView as key
    if (SUB_ROUTES[subView]) {
      return SUB_ROUTES[subView];
    }
  }
  return VIEW_ROUTES[view] || '/';
}

function resolveActiveView(pathname: string): string {
  if (pathname === KLOEL_CHAT_ROUTE) {
    return '';
  }
  if (pathname === '/dashboard') {
    return 'home';
  }
  if (pathname.startsWith('/products') || pathname.startsWith('/produtos')) {
    return 'produtos';
  }
  if (pathname.startsWith('/sites')) {
    return 'sites';
  }
  if (
    pathname.startsWith('/marketing') ||
    pathname.startsWith('/campaigns') ||
    pathname.startsWith('/flow') ||
    pathname.startsWith('/funnels') ||
    pathname.startsWith('/whatsapp') ||
    pathname.startsWith('/webinarios')
  ) {
    return 'marketing';
  }
  if (pathname.startsWith('/canvas')) {
    return 'canvas';
  }
  if (
    pathname.startsWith('/leads') ||
    pathname.startsWith('/vendas') ||
    pathname.startsWith('/sales')
  ) {
    return 'vendas';
  }
  if (
    pathname.startsWith('/carteira') ||
    pathname.startsWith('/billing') ||
    pathname.startsWith('/payments')
  ) {
    return 'carteira';
  }
  if (
    pathname.startsWith('/analytics') ||
    pathname.startsWith('/metrics') ||
    pathname.startsWith('/relatorio')
  ) {
    return 'relatorio';
  }
  if (pathname.startsWith('/parcerias')) {
    return 'parcerias';
  }
  if (pathname.startsWith('/anuncios')) {
    return 'anuncios';
  }
  if (
    pathname.startsWith('/ferramentas') ||
    pathname.startsWith('/autopilot') ||
    pathname.startsWith('/tools') ||
    pathname.startsWith('/inbox') ||
    pathname.startsWith('/followups') ||
    pathname.startsWith('/video') ||
    pathname.startsWith('/cia') ||
    pathname.startsWith('/scrapers')
  ) {
    return 'ferramentas';
  }
  return '';
}

function routeMatchesCurrent(
  route: string,
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
): boolean {
  const [routePath, routeQuery] = route.split('?');
  if (routePath !== pathname) {
    return false;
  }
  if (!routeQuery) {
    return true;
  }

  const expectedParams = new URLSearchParams(routeQuery);
  for (const [key, value] of expectedParams.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }
  return true;
}

function resolveActiveSubView(
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
): string | null {
  for (const item of NAV) {
    for (const sub of item.sub) {
      const route = resolveRoute(item.key, sub);
      if (routeMatchesCurrent(route, pathname, searchParams)) {
        return `${item.key}:${sub}`;
      }
    }
  }

  return null;
}

// ════════════════════════════════════════════

function MobileTopBar({
  activeViewLabel,
  onOpenMenu,
  onSearch,
}: {
  activeViewLabel: string;
  onOpenMenu: () => void;
  onSearch: () => void;
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 24,
        padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 12px',
        borderBottom: `1px solid ${KLOEL_THEME.borderPrimary}`,
        background: `color-mix(in srgb, ${KLOEL_THEME.bgPrimary} 96%, transparent)`,
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir navegação"
          style={{
            width: 40,
            height: 40,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: KLOEL_THEME.bgCard,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            borderRadius: 12,
            color: KLOEL_THEME.textPrimary,
            flexShrink: 0,
            boxShadow: KLOEL_THEME.shadowSm,
          }}
        >
          <SidebarToggleIcon color={KLOEL_THEME.textPrimary} size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: KLOEL_THEME.textTertiary,
              fontFamily: "'JetBrains Mono', monospace",
              marginBottom: 2,
            }}
          >
            Kloel
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: KLOEL_THEME.textPrimary,
              fontFamily: "'Sora', sans-serif",
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeViewLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={onSearch}
          aria-label="Buscar"
          style={{
            height: 40,
            padding: '0 12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: KLOEL_THEME.bgCard,
            border: `1px solid ${KLOEL_THEME.borderPrimary}`,
            borderRadius: 12,
            color: KLOEL_THEME.textSecondary,
            fontFamily: "'Sora', sans-serif",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
            boxShadow: KLOEL_THEME.shadowSm,
          }}
        >
          Buscar
        </button>
      </div>
    </div>
  );
}

function KycBanner({
  mobileHeaderOffset,
  isMobile,
  percentage,
  onComplete,
}: {
  mobileHeaderOffset: number;
  isMobile: boolean;
  percentage: number;
  onComplete: () => void;
}) {
  return (
    <div
      style={{
        position: 'sticky',
        top: mobileHeaderOffset,
        zIndex: 15,
        padding: isMobile ? '12px 16px 0' : '16px 20px 0',
        background: `linear-gradient(180deg, color-mix(in srgb, ${KLOEL_THEME.bgPrimary} 98%, transparent) 0%, color-mix(in srgb, ${KLOEL_THEME.bgPrimary} 90%, transparent) 80%, transparent 100%)`,
      }}
    >
      <div
        style={{
          background: 'color-mix(in srgb, var(--app-warning) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--app-warning) 22%, transparent)',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
        }}
      >
        <div style={{ color: KLOEL_THEME.warning, display: 'flex', alignItems: 'center' }}>
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: KLOEL_THEME.textPrimary,
              fontFamily: "'Sora', sans-serif",
            }}
          >
            Cadastro incompleto
          </div>
          <div
            style={{
              fontSize: 11,
              color: KLOEL_THEME.textSecondary,
              marginTop: 4,
              lineHeight: 1.5,
              fontFamily: "'Sora', sans-serif",
            }}
          >
            A navegação continua liberada. Finalize o cadastro para publicar, sacar e liberar todas
            as operações sensíveis.
          </div>
        </div>
        <div style={{ textAlign: 'right' as const, minWidth: 80 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: KLOEL_THEME.warning,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {percentage}%
          </div>
          <div
            style={{
              fontSize: 9,
              color: KLOEL_THEME.textTertiary,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            completo
          </div>
        </div>
        <button
          type="button"
          onClick={onComplete}
          style={{
            background: KLOEL_THEME.accent,
            color: KLOEL_THEME.textOnAccent,
            border: 'none',
            borderRadius: 6,
            padding: '10px 16px',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "'Sora', sans-serif",
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Completar cadastro
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════

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

  // KYC notice: keep the shell interactive and surface compliance as a banner,
  // never as a blocking overlay after authentication succeeds.
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
      if (routeMatchesCurrent(route, pathname, searchParams) || route === currentRoute) {
        setMobileMenuOpen(false);
        return;
      }

      startTransition(() => {
        router.push(route);
      });
      setMobileMenuOpen(false);
    },
    [currentRoute, pathname, router, searchParams],
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

      {/* Sidebar -- Desktop/Tablet */}
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

      {/* Mobile Sidebar Overlay */}
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

      {/* Main Content Area */}
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
