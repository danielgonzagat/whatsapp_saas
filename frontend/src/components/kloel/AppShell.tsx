'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  PenSquare,
  Search,
  Settings,
  MessageSquare,
  Smartphone,
  Users,
  BarChart3,
  Activity,
  Package,
  ChevronLeft,
  ChevronRight,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, shadows, zIndex } from '@/lib/design-tokens';
import { CommandPalette } from './CommandPalette';
import useCommandPalette from '@/hooks/useCommandPalette';

// ============================================
// TYPES
// ============================================

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: number | string;
  separator?: boolean;
  action?: 'palette';
}

interface AppShellProps {
  children: ReactNode;
  autopilotActive?: boolean;
}

// ============================================
// NAVIGATION — Marketing Artificial
// ============================================

const NAV_ITEMS: NavItem[] = [
  { id: 'new-chat', label: '+ Novo bate-papo', icon: PenSquare, href: '/chat?new=1' },
  { id: 'search', label: 'Procurar', icon: Search, href: '#', action: 'palette' },
  { id: 'settings', label: 'Configurar Kloel', icon: Settings, href: '/settings', separator: true },
  { id: 'chat', label: 'Conversas', icon: MessageSquare, href: '/chat' },
  { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone, href: '/whatsapp' },
  { id: 'products', label: 'Produtos', icon: Package, href: '/products' },
  { id: 'crm', label: 'CRM e pipeline', icon: Users, href: '/leads' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
  { id: 'activity', label: 'Atividade', icon: Activity, href: '/autopilot' },
];

// ============================================
// SIDEBAR
// ============================================

interface SidebarProps {
  isExpanded: boolean;
  onToggle: () => void;
  onOpenPalette: () => void;
}

function Sidebar({ isExpanded, onToggle, onOpenPalette }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 h-full flex flex-col transition-all duration-200',
        isExpanded ? 'w-[260px]' : 'w-[50px]'
      )}
      style={{
        backgroundColor: colors.background.surface1,
        borderRight: `1px solid ${colors.stroke}`,
        zIndex: zIndex.sticky,
      }}
    >
      {/* Logo — "Kloel" in serif humanized typography */}
      <div
        className="flex items-center h-14 px-4 gap-2"
        style={{ borderBottom: `1px solid ${colors.divider}` }}
      >
        {isExpanded ? (
          <Link href="/" className="flex items-center gap-2">
            <span
              className="text-xl font-serif"
              style={{
                fontFamily: 'var(--font-serif), "Libre Baskerville", Georgia, serif',
                fontWeight: 700,
                color: colors.brand.primary,
                letterSpacing: '-0.02em',
              }}
            >
              Kloel
            </span>
          </Link>
        ) : (
          <Link
            href="/"
            className="w-8 h-8 flex items-center justify-center"
            style={{
              fontFamily: 'var(--font-serif), "Libre Baskerville", Georgia, serif',
              fontWeight: 700,
              fontSize: '18px',
              color: colors.brand.primary,
            }}
          >
            K
          </Link>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href !== '#' &&
            item.href !== '/chat?new=1' &&
            pathname.startsWith(item.href.split('?')[0]);
          const Icon = item.icon;

          return (
            <div key={item.id}>
              {item.separator && (
                <div
                  className="my-2 mx-3"
                  style={{ borderTop: `1px solid ${colors.divider}` }}
                />
              )}
              {item.action === 'palette' ? (
                <button
                  onClick={onOpenPalette}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg transition-all w-full text-left',
                    isExpanded ? 'justify-start' : 'justify-center'
                  )}
                  style={{ color: colors.text.secondary }}
                >
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {isExpanded && (
                    <span className="text-[13px] font-medium">{item.label}</span>
                  )}
                  {isExpanded && (
                    <kbd
                      className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        backgroundColor: colors.background.surface2,
                        color: colors.text.muted,
                        border: `1px solid ${colors.stroke}`,
                      }}
                    >
                      ⌘K
                    </kbd>
                  )}
                </button>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg transition-all relative group',
                    isExpanded ? 'justify-start' : 'justify-center'
                  )}
                  style={{
                    backgroundColor: isActive ? `${colors.brand.primary}12` : 'transparent',
                    color: isActive ? colors.brand.primary : colors.text.secondary,
                  }}
                >
                  {isActive && (
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full"
                      style={{ backgroundColor: colors.brand.primary }}
                    />
                  )}
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {isExpanded && (
                    <span className="text-[13px] font-medium truncate">
                      {item.label}
                    </span>
                  )}
                  {item.badge && isExpanded && (
                    <span
                      className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: colors.brand.accent,
                        color: '#fff',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                  {!isExpanded && (
                    <div
                      className="absolute left-full ml-2 px-2 py-1 rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap text-xs"
                      style={{
                        backgroundColor: colors.background.surface2,
                        color: colors.text.primary,
                        boxShadow: shadows.card,
                        zIndex: zIndex.tooltip,
                      }}
                    >
                      {item.label}
                    </div>
                  )}
                </Link>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom: Toggle */}
      <div
        className="py-3 px-2"
        style={{ borderTop: `1px solid ${colors.divider}` }}
      >
        <button
          onClick={onToggle}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg transition-all w-full',
            isExpanded ? 'justify-start' : 'justify-center'
          )}
          style={{ color: colors.text.muted }}
        >
          {isExpanded ? (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs font-medium">Recolher</span>
            </>
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function AppShell({ children, autopilotActive = false }: AppShellProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { paletteProps, executeCommand, open: openPalette } = useCommandPalette();

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: colors.background.base }}
    >
      <CommandPalette {...paletteProps} onSelect={executeCommand} />

      {/* Sidebar — Desktop */}
      <div className="hidden lg:block">
        <Sidebar
          isExpanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
          onOpenPalette={openPalette}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 lg:hidden" style={{ zIndex: zIndex.modal }}>
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-[260px] h-full">
            <Sidebar
              isExpanded={true}
              onToggle={() => setMobileMenuOpen(false)}
              onOpenPalette={openPalette}
            />
          </div>
        </div>
      )}

      {/* Mobile Topbar */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 h-12 flex items-center px-4"
        style={{
          backgroundColor: `${colors.background.base}F0`,
          borderBottom: `1px solid ${colors.divider}`,
          backdropFilter: 'blur(12px)',
          zIndex: zIndex.sticky,
        }}
      >
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-lg"
          style={{ color: colors.text.secondary }}
        >
          <Menu className="w-5 h-5" />
        </button>
        <span
          className="ml-2 font-serif text-lg"
          style={{
            fontFamily: 'var(--font-serif), "Libre Baskerville", Georgia, serif',
            fontWeight: 700,
            color: colors.brand.primary,
          }}
        >
          Kloel
        </span>
      </div>

      {/* Main Content */}
      <main
        className="min-h-screen transition-all duration-200 lg:pt-0 pt-12"
        style={{
          marginLeft: 0,
          paddingLeft: sidebarExpanded ? 260 : 50,
        }}
      >
        {children}
      </main>
    </div>
  );
}
