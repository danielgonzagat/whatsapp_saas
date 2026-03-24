'use client';

import { ReactNode, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import { CommandPalette } from './CommandPalette';
import useCommandPalette from '@/hooks/useCommandPalette';
import { KloelSidebar } from './sidebar/KloelSidebar';
import { ErrorBoundary } from './ErrorBoundary';

// ════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════

interface AppShellProps {
  children: ReactNode;
  autopilotActive?: boolean;
}

// ════════════════════════════════════════════
// VIEW → ROUTE MAPPING
// ════════════════════════════════════════════

const VIEW_ROUTES: Record<string, string> = {
  dashboard: '/',
  chat: '/chat',
  produtos: '/products',
  marketing: '/marketing',
  vendas: '/vendas',
  carteira: '/carteira',
  relatorio: '/analytics',
  parcerias: '/parcerias',
  ferramentas: '/ferramentas',
};

const SUB_ROUTES: Record<string, string> = {
  // Produtos
  'produtos-meus-produtos': '/products',
  'produtos-area-de-membros': '/products?tab=membros',
  'produtos-afiliar-se': '/products?tab=afiliar',
  // Marketing
  'marketing-criacao-de-site': '/flow',
  'marketing-whatsapp': '/whatsapp',
  'marketing-direct': '/marketing/direct',
  'marketing-tiktok': '/marketing/tiktok',
  'marketing-messenger': '/marketing/messenger',
  'marketing-email': '/campaigns',
  // Vendas
  'vendas-gestao-de-vendas': '/leads',
  'vendas-gestao-de-assinaturas': '/vendas/assinaturas',
  'vendas-gestao-produtos-fisicos': '/vendas/fisicos',
  // Carteira
  'carteira-saldo': '/carteira/saldo',
  'carteira-extrato': '/carteira/extrato',
  'carteira-movimentacoes-do-mes': '/carteira/movimentacoes',
  'carteira-saques': '/carteira/saques',
  'carteira-antecipacoes': '/carteira/antecipacoes',
  // Parcerias
  'parcerias-central-de-colaboradores': '/parcerias/colaboradores',
  'parcerias-afiliados': '/parcerias/afiliados',
  'parcerias-chat-com-afiliados': '/parcerias/chat',
  // Ferramentas
  'ferramentas-impulsione-suas-vendas': '/ferramentas/impulsione',
  'ferramentas-gerencie-seu-negocio': '/ferramentas/gerencie',
  'ferramentas-ver-todas': '/ferramentas/ver-todas',
};

function resolveRoute(view: string, subView?: string): string {
  if (subView) {
    const subKey = subView;
    if (SUB_ROUTES[subKey]) return SUB_ROUTES[subKey];
    // Fallback: try the view route
  }
  return VIEW_ROUTES[view] || '/';
}

function resolveActiveView(pathname: string): string {
  if (pathname === '/' || pathname === '/chat') return 'dashboard';
  if (pathname.startsWith('/products')) return 'produtos';
  if (pathname.startsWith('/marketing') || pathname.startsWith('/campaigns') || pathname.startsWith('/flow')) return 'marketing';
  if (pathname.startsWith('/whatsapp')) return 'marketing';
  if (pathname.startsWith('/leads') || pathname.startsWith('/vendas') || pathname.startsWith('/sales')) return 'vendas';
  if (pathname.startsWith('/carteira') || pathname.startsWith('/billing') || pathname.startsWith('/payments')) return 'carteira';
  if (pathname.startsWith('/analytics') || pathname.startsWith('/metrics') || pathname.startsWith('/relatorio')) return 'relatorio';
  if (pathname.startsWith('/parcerias')) return 'parcerias';
  if (pathname.startsWith('/ferramentas') || pathname.startsWith('/autopilot') || pathname.startsWith('/tools')) return 'ferramentas';
  return 'dashboard';
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { paletteProps, executeCommand, open: openPalette } = useCommandPalette();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeView = resolveActiveView(pathname);

  const handleNavigate = useCallback((view: string, subView?: string) => {
    const route = resolveRoute(view, subView);
    router.push(route);
    setMobileMenuOpen(false);
  }, [router]);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: colors.background.void,
        fontFamily: "'DM Sans', sans-serif",
        color: colors.text.starlight,
        overflow: 'hidden',
      }}
    >
      <CommandPalette {...paletteProps} onSelect={executeCommand} />

      {/* Sidebar — Desktop/Tablet */}
      <div className="hidden lg:block">
        <KloelSidebar
          activeView={activeView}
          onNavigate={handleNavigate}
        />
      </div>

      {/* Mobile Menu Button */}
      <button
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg"
        style={{
          background: colors.background.space,
          border: `1px solid ${colors.border.void}`,
          color: colors.text.moonlight,
        }}
        onClick={() => setMobileMenuOpen(true)}
      >
        <Menu size={20} />
      </button>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 lg:hidden" style={{ zIndex: 300 }}>
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(6, 6, 12, 0.8)' }}
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative h-full" style={{ width: 260 }}>
            <KloelSidebar
              activeView={activeView}
              onNavigate={handleNavigate}
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
          overflow: 'hidden',
        }}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default AppShell;
