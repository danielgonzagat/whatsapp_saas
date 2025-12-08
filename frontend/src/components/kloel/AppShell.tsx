'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard,
  MessageSquare,
  Users,
  Package,
  CreditCard,
  Zap,
  Bot,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  HelpCircle,
  LogOut,
  Menu,
  Command,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, motion, radius, shadows, zIndex } from '@/lib/design-tokens';
import { ContextCapsuleMini } from './ContextCapsule';
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
}

interface AppShellProps {
  children: ReactNode;
  /** Is Autopilot globally active? */
  autopilotActive?: boolean;
}

// ============================================
// NAVIGATION
// ============================================

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'chat', label: 'Conversas', icon: MessageSquare, href: '/chat', badge: 12 },
  { id: 'leads', label: 'Leads', icon: Users, href: '/leads' },
  { id: 'products', label: 'Produtos', icon: Package, href: '/products' },
  { id: 'sales', label: 'Vendas', icon: CreditCard, href: '/sales' },
  { id: 'campaigns', label: 'Campanhas', icon: Zap, href: '/campaigns' },
  { id: 'autopilot', label: 'Autopilot', icon: Bot, href: '/autopilot' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: 'settings', label: 'Configurações', icon: Settings, href: '/settings' },
];

// ============================================
// SIDEBAR
// ============================================

interface SidebarProps {
  isExpanded: boolean;
  onToggle: () => void;
}

function Sidebar({ isExpanded, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 h-full flex flex-col transition-all duration-200',
        isExpanded ? 'w-[220px]' : 'w-[68px]'
      )}
      style={{
        backgroundColor: colors.background.surface1,
        borderRight: `1px solid ${colors.stroke}`,
        zIndex: zIndex.sticky,
      }}
    >
      {/* Logo */}
      <div 
        className="flex items-center h-16 px-4 gap-3"
        style={{ borderBottom: `1px solid ${colors.divider}` }}
      >
        <div 
          className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-lg"
          style={{ 
            backgroundColor: colors.brand.green,
            color: colors.background.obsidian,
          }}
        >
          K
        </div>
        {isExpanded && (
          <span 
            className="font-semibold text-lg"
            style={{ color: colors.text.primary }}
          >
            KLOEL
          </span>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all relative group',
                isExpanded ? 'justify-start' : 'justify-center'
              )}
              style={{
                backgroundColor: isActive ? `${colors.brand.green}15` : 'transparent',
                color: isActive ? colors.brand.green : colors.text.secondary,
              }}
            >
              {/* Active indicator */}
              {isActive && (
                <div 
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full"
                  style={{ backgroundColor: colors.brand.green }}
                />
              )}
              
              <Icon className="w-5 h-5 flex-shrink-0" />
              
              {isExpanded && (
                <span className="text-sm font-medium truncate">
                  {item.label}
                </span>
              )}
              
              {/* Badge */}
              {item.badge && isExpanded && (
                <span 
                  className="ml-auto text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: colors.brand.cyan,
                    color: colors.background.obsidian,
                  }}
                >
                  {item.badge}
                </span>
              )}
              
              {/* Tooltip on collapsed */}
              {!isExpanded && (
                <div 
                  className="absolute left-full ml-2 px-2 py-1 rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap"
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
          );
        })}
      </nav>

      {/* Bottom Items */}
      <div 
        className="py-4 px-2 space-y-1"
        style={{ borderTop: `1px solid ${colors.divider}` }}
      >
        {BOTTOM_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all',
                isExpanded ? 'justify-start' : 'justify-center'
              )}
              style={{
                color: isActive ? colors.brand.green : colors.text.muted,
              }}
            >
              <Icon className="w-5 h-5" />
              {isExpanded && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}

        {/* Toggle Button */}
        <button
          onClick={onToggle}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full',
            isExpanded ? 'justify-start' : 'justify-center'
          )}
          style={{ color: colors.text.muted }}
        >
          {isExpanded ? (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Recolher</span>
            </>
          ) : (
            <ChevronRight className="w-5 h-5" />
          )}
        </button>
      </div>
    </aside>
  );
}

// ============================================
// TOPBAR
// ============================================

interface TopbarProps {
  sidebarExpanded: boolean;
  autopilotActive?: boolean;
  onMobileMenuClick: () => void;
  onOpenPalette: () => void;
}

function Topbar({ sidebarExpanded, autopilotActive, onMobileMenuClick, onOpenPalette }: TopbarProps) {
  const pathname = usePathname();
  
  // Determine current page
  const currentPage = NAV_ITEMS.find(item => pathname.startsWith(item.href))?.id;

  return (
    <header
      className="fixed top-0 right-0 h-14 flex items-center justify-between px-4 transition-all duration-200"
      style={{
        left: sidebarExpanded ? 220 : 68,
        backgroundColor: `${colors.background.obsidian}95`,
        borderBottom: `1px solid ${colors.divider}`,
        backdropFilter: 'blur(12px)',
        zIndex: zIndex.sticky,
      }}
    >
      {/* Left: Mobile menu + Context */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuClick}
          className="lg:hidden p-2 rounded-lg"
          style={{ color: colors.text.muted }}
        >
          <Menu className="w-5 h-5" />
        </button>
        
        <ContextCapsuleMini 
          page={currentPage as 'dashboard'} 
          autopilotActive={autopilotActive} 
        />
        
        {/* Command Palette Trigger */}
        <button
          onClick={onOpenPalette}
          className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
          style={{
            backgroundColor: colors.background.surface2,
            border: `1px solid ${colors.stroke}`,
          }}
        >
          <Command className="w-4 h-4" style={{ color: colors.text.muted }} />
          <span className="text-sm" style={{ color: colors.text.muted }}>
            Buscar ações...
          </span>
          <kbd 
            className="px-1.5 py-0.5 rounded text-xs font-medium ml-2"
            style={{ 
              backgroundColor: colors.background.obsidian,
              color: colors.text.muted,
            }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          className="p-2 rounded-lg transition-colors hover:bg-white/5 relative"
          style={{ color: colors.text.muted }}
        >
          <Bell className="w-5 h-5" />
          <span 
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
            style={{ backgroundColor: colors.brand.green }}
          />
        </button>
        
        <button
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: colors.text.muted }}
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* User Avatar */}
        <button
          className="w-8 h-8 rounded-full overflow-hidden ml-2"
          style={{ 
            backgroundColor: colors.background.surface2,
            border: `2px solid ${colors.stroke}`,
          }}
        >
          <div 
            className="w-full h-full flex items-center justify-center text-sm font-medium"
            style={{ color: colors.text.primary }}
          >
            U
          </div>
        </button>
      </div>
    </header>
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
      style={{ backgroundColor: colors.background.obsidian }}
    >
      {/* Command Palette (Ctrl/⌘+K) */}
      <CommandPalette
        {...paletteProps}
        onSelect={executeCommand}
      />

      {/* Sidebar - Desktop */}
      <div className="hidden lg:block">
        <Sidebar 
          isExpanded={sidebarExpanded} 
          onToggle={() => setSidebarExpanded(!sidebarExpanded)} 
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 lg:hidden"
          style={{ zIndex: zIndex.modal }}
        >
          <div 
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-[220px] h-full">
            <Sidebar 
              isExpanded={true} 
              onToggle={() => setMobileMenuOpen(false)} 
            />
          </div>
        </div>
      )}

      {/* Topbar */}
      <div className="hidden lg:block">
        <Topbar 
          sidebarExpanded={sidebarExpanded}
          autopilotActive={autopilotActive}
          onMobileMenuClick={() => setMobileMenuOpen(true)}
          onOpenPalette={openPalette}
        />
      </div>

      {/* Mobile Topbar */}
      <div className="lg:hidden">
        <Topbar 
          sidebarExpanded={false}
          autopilotActive={autopilotActive}
          onMobileMenuClick={() => setMobileMenuOpen(true)}
          onOpenPalette={openPalette}
        />
      </div>

      {/* Main Content */}
      <main
        className="pt-14 min-h-screen transition-all duration-200"
        style={{
          marginLeft: 0,
          paddingLeft: sidebarExpanded ? 220 : 68,
        }}
      >
        <div className="lg:pl-0 pl-0">
          {children}
        </div>
      </main>
    </div>
  );
}
