'use client';

import { ReactNode, useState, useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Bell, MessageSquare, Zap, GitBranch, DollarSign } from 'lucide-react';
import { CommandPalette } from './CommandPalette';
import useCommandPalette from '@/hooks/useCommandPalette';
import { KloelSidebar } from './sidebar/KloelSidebar';
import { ErrorBoundary } from './ErrorBoundary';
import { useKycStatus, useKycCompletion } from '@/hooks/useKyc';
import { useSocket } from '@/hooks/useSocket';
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
  'relatorio-vendas': '/analytics?tab=vendas',
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
// NOTIFICATION BELL
// ════════════════════════════════════════════

interface Notification {
  id: string;
  type: 'message' | 'autopilot' | 'flow' | 'sale';
  text: string;
  route: string;
  time: number;
}

const NOTIF_ICONS = { message: MessageSquare, autopilot: Zap, flow: GitBranch, sale: DollarSign };

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function NotificationBell({ onNavigate }: { onNavigate: (route: string) => void }) {
  const { subscribe } = useSocket();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const push = useCallback((n: Omit<Notification, 'id' | 'time'>) => {
    const entry = { ...n, id: crypto.randomUUID(), time: Date.now() };
    setItems(prev => [entry, ...prev].slice(0, 20));
    setUnread(c => c + 1);
  }, []);

  useEffect(() => {
    const unsubs = [
      subscribe('message:new', (d: any) => push({ type: 'message', text: `Nova mensagem de ${d.contact ?? 'contato'}`, route: '/chat' })),
      subscribe('autopilot:action', (d: any) => push({ type: 'autopilot', text: `Autopilot vendeu R$ ${d.value ?? '0'}`, route: '/autopilot' })),
      subscribe('flow:completed', (d: any) => push({ type: 'flow', text: `Flow ${d.name ?? ''} concluido`, route: '/canvas' })),
      subscribe('sale:new', (d: any) => push({ type: 'sale', text: `Nova venda R$ ${d.value ?? '0'}`, route: '/vendas' })),
    ];
    return () => unsubs.forEach(u => u());
  }, [subscribe, push]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, position: 'relative', color: '#6E6E73' }}>
        <Bell size={20} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 0, right: 0, background: '#E85D30', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Sora', sans-serif" }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 300, background: '#111113', border: '1px solid #222226', borderRadius: 8, zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,.5)', fontFamily: "'Sora', sans-serif" }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #1A1A1E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#E0DDD8' }}>Notificacoes</span>
            {unread > 0 && (
              <button onClick={() => setUnread(0)} style={{ background: 'none', border: 'none', color: '#E85D30', fontSize: 11, cursor: 'pointer', fontFamily: "'Sora', sans-serif" }}>
                Marcar todas como lidas
              </button>
            )}
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#52525b', fontSize: 12 }}>Nenhuma notificacao</div>
            ) : items.map(n => {
              const Icon = NOTIF_ICONS[n.type];
              return (
                <button key={n.id} onClick={() => { onNavigate(n.route); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid #1A1A1E', cursor: 'pointer', textAlign: 'left' }}>
                  <Icon size={14} style={{ color: '#E85D30', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: '#E0DDD8', lineHeight: 1.4 }}>{n.text}</span>
                  <span style={{ fontSize: 10, color: '#52525b', flexShrink: 0 }}>{timeAgo(n.time)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
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
  const [paletteMode, setPaletteMode] = useState<'full' | 'conversations'>('full');
  const { status: kycData, isLoading: kycLoading, error: kycError } = useKycStatus();
  const { completion } = useKycCompletion();

  const activeView = resolveActiveView(pathname);

  // KYC blocker: show overlay when not approved and not on settings page
  // Fail-open: if loading or error, don't block
  const isSettingsPage = pathname.startsWith('/settings') || pathname.startsWith('/account');
  const kycComplete = completion?.percentage >= 100;
  const showKycBlocker = !kycLoading && !kycError && kycData && kycData.kycStatus !== 'approved' && !kycComplete && !isSettingsPage;

  const handleNavigate = useCallback((view: string, subView?: string) => {
    const route = resolveRoute(view, subView);
    router.push(route);
    setMobileMenuOpen(false);
  }, [router]);

  const handleNewChat = useCallback(() => {
    if (pathname === '/' || pathname === '/dashboard') {
      window.dispatchEvent(new Event('kloel:new-chat'));
    } else {
      router.push('/dashboard');
      setTimeout(() => window.dispatchEvent(new Event('kloel:new-chat')), 500);
    }
    setMobileMenuOpen(false);
  }, [router, pathname]);

  const handleSearch = useCallback(() => {
    setPaletteMode('conversations');
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
      <CommandPalette {...paletteProps} onSelect={executeCommand} mode={paletteMode} />

      {/* Sidebar -- Desktop/Tablet */}
      <div className="hidden lg:block">
        <KloelSidebar
          activeView={activeView}
          onNavigate={handleNavigate}
          onNewChat={handleNewChat}
          onSearch={handleSearch}
        />
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
        {/* Notification Bell - top right */}
        <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 40 }}>
          <NotificationBell onNavigate={(route) => router.push(route)} />
        </div>

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
