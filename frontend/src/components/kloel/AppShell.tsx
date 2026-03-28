'use client';

import { ReactNode, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { CommandPalette } from './CommandPalette';
import useCommandPalette from '@/hooks/useCommandPalette';
import { KloelSidebar } from './sidebar/KloelSidebar';
import { ErrorBoundary } from './ErrorBoundary';
import { useKycStatus } from '@/hooks/useKyc';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

// ════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════

interface AppShellProps {
  children: ReactNode;
  autopilotActive?: boolean;
}

// ════════════════════════════════════════════
// VIEW -> ROUTE MAPPING
// ════════════════════════════════════════════

const VIEW_ROUTES: Record<string, string> = {
  dashboard: '/',
  chat: '/chat',
  produtos: '/products',
  marketing: '/marketing',
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
  'marketing-visao-geral': '/marketing',
  'marketing-criacao-de-site': '/marketing/site',
  'marketing-whatsapp': '/marketing/whatsapp',
  'marketing-instagram': '/marketing/instagram',
  'marketing-tiktok': '/marketing/tiktok',
  'marketing-facebook': '/marketing/facebook',
  'marketing-email': '/marketing/email',
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
  'crm': '/vendas/pipeline',
  'carteira-saldo': '/carteira/saldo',
  'carteira-extrato': '/carteira/extrato',
  'carteira-movimentacoes-do-mes': '/carteira/movimentacoes',
  'carteira-saques': '/carteira/saques',
  'carteira-antecipacoes': '/carteira/antecipacoes',
  'parcerias-central-de-colaboradores': '/parcerias/colaboradores',
  'parcerias-afiliados-e-produtores': '/parcerias/afiliados',
  'parcerias-chat': '/parcerias/chat',
  'ferramentas-impulsione-suas-vendas': '/ferramentas/impulsione',
  'ferramentas-gerencie-seu-negocio': '/ferramentas/gerencie',
  'ferramentas-ver-todas': '/ferramentas/ver-todas',
};

function resolveRoute(view: string, subView?: string): string {
  if (subView) {
    // Convert label to slug key: "Visao Geral" → "marketing-visao-geral"
    const slug = subView
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-');
    const subKey = `${view}-${slug}`;
    if (SUB_ROUTES[subKey]) return SUB_ROUTES[subKey];
    // Fallback: try the raw subView as key
    if (SUB_ROUTES[subView]) return SUB_ROUTES[subView];
  }
  return VIEW_ROUTES[view] || '/';
}

function resolveActiveView(pathname: string): string {
  if (pathname === '/' || pathname === '/chat') return 'dashboard';
  if (pathname.startsWith('/products') || pathname.startsWith('/produtos')) return 'produtos';
  if (pathname.startsWith('/marketing') || pathname.startsWith('/campaigns') || pathname.startsWith('/flow')) return 'marketing';
  if (pathname.startsWith('/whatsapp')) return 'marketing';
  if (pathname.startsWith('/canvas')) return 'canvas';
  if (pathname.startsWith('/leads') || pathname.startsWith('/vendas') || pathname.startsWith('/sales')) return 'vendas';
  if (pathname.startsWith('/carteira') || pathname.startsWith('/billing') || pathname.startsWith('/payments')) return 'carteira';
  if (pathname.startsWith('/analytics') || pathname.startsWith('/metrics') || pathname.startsWith('/relatorio')) return 'relatorio';
  if (pathname.startsWith('/parcerias')) return 'parcerias';
  if (pathname.startsWith('/anuncios')) return 'anuncios';
  if (pathname.startsWith('/ferramentas') || pathname.startsWith('/autopilot') || pathname.startsWith('/tools')) return 'ferramentas';
  return 'dashboard';
}

// ════════════════════════════════════════════
// AUTOPILOT STATUS INDICATOR
// ════════════════════════════════════════════

function AutopilotDot({ onClick }: { onClick: () => void }) {
  const { data } = useSWR<{ active: boolean; mode: string }>('/autopilot/status', swrFetcher, { refreshInterval: 30_000 });
  const active = data?.active ?? false;
  return (
    <button onClick={onClick} style={{ position: 'absolute', bottom: 14, left: 14, zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#22c55e' : '#52525b', boxShadow: active ? '0 0 6px #22c55e' : 'none', animation: active ? 'pulse-dot 2s infinite' : 'none' }} />
      <span style={{ fontSize: 10, color: active ? '#22c55e' : '#52525b', fontFamily: "'Sora', sans-serif" }}>{active ? 'Autopilot ativo' : 'Autopilot off'}</span>
      <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }`}</style>
    </button>
  );
}

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { paletteProps, executeCommand, open: openPalette } = useCommandPalette();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { status: kycData, isLoading: kycLoading } = useKycStatus();

  const activeView = resolveActiveView(pathname);

  // KYC blocker: show overlay when not approved and not on settings page
  // Fail-open: if loading or error, don't block
  const isSettingsPage = pathname.startsWith('/settings') || pathname.startsWith('/account');
  const showKycBlocker = !kycLoading && kycData && kycData.kycStatus !== 'approved' && !isSettingsPage;

  const handleNavigate = useCallback((view: string, subView?: string) => {
    const route = resolveRoute(view, subView);
    router.push(route);
    setMobileMenuOpen(false);
  }, [router]);

  const handleNewChat = useCallback(() => {
    router.push('/');
    window.dispatchEvent(new Event('kloel:new-chat'));
    setMobileMenuOpen(false);
  }, [router]);

  const handleSearch = useCallback(() => {
    openPalette();
  }, [openPalette]);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: '#0A0A0C',
        fontFamily: "'Sora', sans-serif",
        color: '#E0DDD8',
        overflow: 'visible',
      }}
    >
      <CommandPalette {...paletteProps} onSelect={executeCommand} />

      {/* Sidebar -- Desktop/Tablet */}
      <div className="hidden lg:block" style={{ position: 'relative' }}>
        <KloelSidebar
          activeView={activeView}
          onNavigate={handleNavigate}
          onNewChat={handleNewChat}
          onSearch={handleSearch}
        />
        <AutopilotDot onClick={() => router.push('/autopilot')} />
      </div>

      {/* Mobile Menu Button */}
      <button
        className="lg:hidden fixed top-3 left-3 z-50 p-2"
        style={{
          background: '#111113',
          border: '1px solid #19191C',
          color: '#6E6E73',
          borderRadius: 6,
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
            style={{ background: 'rgba(10, 10, 12, 0.8)' }}
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative h-full" style={{ width: 240 }}>
            <KloelSidebar
              activeView={activeView}
              onNavigate={handleNavigate}
              onNewChat={handleNewChat}
              onSearch={handleSearch}
            />
            <AutopilotDot onClick={() => { router.push('/autopilot'); setMobileMenuOpen(false); }} />
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
          overflowY: 'auto',
          willChange: 'scroll-position',
        }}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>

        {/* KYC Blocker Overlay */}
        {showKycBlocker && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 50,
              background: 'rgba(10, 10, 12, 0.92)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
          >
            <div
              style={{
                background: '#111113',
                border: '1px solid #222226',
                borderRadius: 6,
                padding: 32,
                maxWidth: 420,
                textAlign: 'center' as const,
              }}
            >
              <div style={{ marginBottom: 16, color: '#F59E0B' }}>
                <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 18, fontWeight: 600, color: '#E0DDD8', margin: '0 0 8px' }}>
                Cadastro incompleto
              </h2>
              <p style={{ fontSize: 13, color: '#6E6E73', margin: '0 0 24px', lineHeight: 1.5, fontFamily: "'Sora', sans-serif" }}>
                Complete seu cadastro e aguarde a aprovacao para acessar todas as funcionalidades da plataforma.
              </p>
              <button
                onClick={() => router.push('/settings')}
                style={{
                  background: '#E85D30',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '12px 28px',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'Sora', sans-serif",
                  cursor: 'pointer',
                }}
              >
                Completar cadastro
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AppShell;
