'use client';

import { 
  MapPin, 
  Target,
  Zap,
  Bot,
  MessageSquare,
  BarChart3,
  Users,
  Settings,
  Package,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, motion, radius } from '@/lib/design-tokens';

// ============================================
// TYPES
// ============================================

export type PageContext = 
  | 'dashboard'
  | 'chat'
  | 'leads'
  | 'sales'
  | 'products'
  | 'campaigns'
  | 'autopilot'
  | 'analytics'
  | 'settings';

export interface ContextItem {
  label: string;
  value: string;
  type?: 'location' | 'focus' | 'status';
}

export interface ContextCapsuleProps {
  /** Current page context */
  page?: PageContext;
  /** Custom items to display */
  items?: ContextItem[];
  /** Is Autopilot active? */
  autopilotActive?: boolean;
  /** Current focus/filter */
  focus?: string;
  /** Additional class */
  className?: string;
  /** Compact mode */
  compact?: boolean;
}

// ============================================
// PAGE ICONS
// ============================================

const PAGE_ICONS: Record<PageContext, React.ElementType> = {
  dashboard: BarChart3,
  chat: MessageSquare,
  leads: Users,
  sales: CreditCard,
  products: Package,
  campaigns: Zap,
  autopilot: Bot,
  analytics: BarChart3,
  settings: Settings,
};

const PAGE_LABELS: Record<PageContext, string> = {
  dashboard: 'Dashboard',
  chat: 'Conversas',
  leads: 'Leads',
  sales: 'Vendas',
  products: 'Produtos',
  campaigns: 'Campanhas',
  autopilot: 'Autopilot',
  analytics: 'Analytics',
  settings: 'Configurações',
};

// ============================================
// COMPONENT
// ============================================

export function ContextCapsule({
  page,
  items = [],
  autopilotActive,
  focus,
  className,
  compact = false,
}: ContextCapsuleProps) {
  // Build context items
  const contextItems: ContextItem[] = [];

  // Add page context
  if (page) {
    contextItems.push({
      label: 'Você está em',
      value: PAGE_LABELS[page],
      type: 'location',
    });
  }

  // Add focus
  if (focus) {
    contextItems.push({
      label: 'Foco',
      value: focus,
      type: 'focus',
    });
  }

  // Add autopilot status
  if (autopilotActive !== undefined) {
    contextItems.push({
      label: 'Autopilot',
      value: autopilotActive ? 'ON' : 'OFF',
      type: 'status',
    });
  }

  // Add custom items
  contextItems.push(...items);

  if (contextItems.length === 0) return null;

  const PageIcon = page ? PAGE_ICONS[page] : null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-3 flex-wrap',
        compact ? 'px-3 py-1.5' : 'px-4 py-2',
        className
      )}
      style={{
        backgroundColor: `${colors.background.surface1}80`,
        borderRadius: radius.full,
        border: `1px solid ${colors.divider}`,
        backdropFilter: 'blur(8px)',
        transition: `all ${motion.duration.normal} ${motion.easing.default}`,
      }}
    >
      {contextItems.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          {/* Separator */}
          {idx > 0 && (
            <span 
              className="text-xs"
              style={{ color: colors.text.muted }}
            >
              |
            </span>
          )}

          {/* Icon for location */}
          {item.type === 'location' && PageIcon && (
            <PageIcon 
              className="w-4 h-4" 
              style={{ color: colors.brand.cyan }}
            />
          )}
          {item.type === 'focus' && (
            <Target 
              className="w-4 h-4" 
              style={{ color: colors.brand.green }}
            />
          )}
          {item.type === 'status' && (
            <Zap 
              className="w-4 h-4" 
              style={{ 
                color: item.value === 'ON' ? colors.brand.green : colors.text.muted 
              }}
            />
          )}

          {/* Content */}
          <span className="text-sm" style={{ color: colors.text.muted }}>
            {item.label}:
          </span>
          <span 
            className={cn(
              'text-sm font-medium',
              item.type === 'status' && item.value === 'ON' && 'uppercase'
            )}
            style={{ 
              color: item.type === 'status' && item.value === 'ON' 
                ? colors.brand.green 
                : colors.text.primary 
            }}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================
// MINI VARIANT (for Topbar)
// ============================================

export function ContextCapsuleMini({
  page,
  autopilotActive,
  className,
}: Pick<ContextCapsuleProps, 'page' | 'autopilotActive' | 'className'>) {
  const PageIcon = page ? PAGE_ICONS[page] : null;
  const label = page ? PAGE_LABELS[page] : null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5',
        className
      )}
      style={{
        backgroundColor: colors.background.surface1,
        borderRadius: radius.full,
        border: `1px solid ${colors.stroke}`,
      }}
    >
      {PageIcon && (
        <PageIcon 
          className="w-4 h-4" 
          style={{ color: colors.brand.cyan }}
        />
      )}
      {label && (
        <span 
          className="text-sm font-medium"
          style={{ color: colors.text.primary }}
        >
          {label}
        </span>
      )}
      {autopilotActive !== undefined && (
        <>
          <span 
            className="w-px h-4"
            style={{ backgroundColor: colors.divider }}
          />
          <div className="flex items-center gap-1.5">
            <span 
              className="w-2 h-2 rounded-full"
              style={{ 
                backgroundColor: autopilotActive ? colors.brand.green : colors.text.muted 
              }}
            />
            <span 
              className="text-xs font-medium uppercase"
              style={{ 
                color: autopilotActive ? colors.brand.green : colors.text.muted 
              }}
            >
              {autopilotActive ? 'Auto ON' : 'Auto OFF'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
