'use client';

import { ReactNode } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  ArrowRight,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, motion, radius, shadows } from '@/lib/design-tokens';

// ============================================
// STAT CARD
// ============================================

interface StatCardProps {
  /** Label/title */
  label: string;
  /** Main value */
  value: string | number;
  /** Optional icon */
  icon?: LucideIcon;
  /** Change indicator */
  change?: {
    value: number;
    label?: string;
  };
  /** Size */
  size?: 'sm' | 'md' | 'lg';
  /** Additional class */
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  change,
  size = 'md',
  className,
}: StatCardProps) {
  const isPositive = change && change.value > 0;
  const isNegative = change && change.value < 0;

  const sizeStyles = {
    sm: { padding: 'p-3', valueSize: 'text-xl', labelSize: 'text-xs' },
    md: { padding: 'p-4', valueSize: 'text-2xl', labelSize: 'text-sm' },
    lg: { padding: 'p-5', valueSize: 'text-3xl', labelSize: 'text-sm' },
  };

  const styles = sizeStyles[size];

  return (
    <div
      className={cn(styles.padding, 'rounded-xl', className)}
      style={{
        backgroundColor: colors.background.surface1,
        border: `1px solid ${colors.stroke}`,
        boxShadow: shadows.card,
        transition: `all ${motion.duration.normal} ${motion.easing.default}`,
      }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p 
            className={cn(styles.labelSize, 'font-medium')}
            style={{ color: colors.text.muted }}
          >
            {label}
          </p>
          <p 
            className={cn(styles.valueSize, 'font-bold')}
            style={{ color: colors.text.primary }}
          >
            {value}
          </p>
        </div>

        {Icon && (
          <div 
            className="p-2 rounded-lg"
            style={{ backgroundColor: `${colors.brand.cyan}15` }}
          >
            <Icon className="w-5 h-5" style={{ color: colors.brand.cyan }} />
          </div>
        )}
      </div>

      {change && (
        <div className="flex items-center gap-1.5 mt-2">
          {isPositive && <TrendingUp className="w-4 h-4" style={{ color: colors.state.success }} />}
          {isNegative && <TrendingDown className="w-4 h-4" style={{ color: colors.state.error }} />}
          {!isPositive && !isNegative && <Minus className="w-4 h-4" style={{ color: colors.text.muted }} />}
          
          <span 
            className="text-sm font-medium"
            style={{ 
              color: isPositive 
                ? colors.state.success 
                : isNegative 
                  ? colors.state.error 
                  : colors.text.muted 
            }}
          >
            {isPositive && '+'}{change.value}%
          </span>
          
          {change.label && (
            <span 
              className="text-sm"
              style={{ color: colors.text.muted }}
            >
              {change.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// ACTION CARD (Mission Card)
// ============================================

interface ActionCardProps {
  /** Title */
  title: string;
  /** Description */
  description?: string;
  /** Icon */
  icon?: LucideIcon;
  /** Action label */
  actionLabel?: string;
  /** On click */
  onClick?: () => void;
  /** Color accent */
  accent?: 'green' | 'cyan' | 'warning' | 'error';
  /** Additional class */
  className?: string;
}

const ACCENT_COLORS = {
  green: colors.brand.green,
  cyan: colors.brand.cyan,
  warning: colors.state.warning,
  error: colors.state.error,
};

export function ActionCard({
  title,
  description,
  icon: Icon,
  actionLabel = 'Ver mais',
  onClick,
  accent = 'cyan',
  className,
}: ActionCardProps) {
  const accentColor = ACCENT_COLORS[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-xl transition-all group hover:scale-[1.01]',
        className
      )}
      style={{
        backgroundColor: colors.background.surface1,
        border: `1px solid ${colors.stroke}`,
        boxShadow: shadows.card,
        transition: `all ${motion.duration.normal} ${motion.easing.default}`,
      }}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div 
            className="p-2 rounded-lg flex-shrink-0"
            style={{ backgroundColor: `${accentColor}15` }}
          >
            <Icon className="w-5 h-5" style={{ color: accentColor }} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3 
            className="font-semibold text-base"
            style={{ color: colors.text.primary }}
          >
            {title}
          </h3>
          
          {description && (
            <p 
              className="text-sm mt-0.5 line-clamp-2"
              style={{ color: colors.text.secondary }}
            >
              {description}
            </p>
          )}
        </div>

        <ArrowRight 
          className="w-5 h-5 flex-shrink-0 mt-0.5 transition-transform group-hover:translate-x-1"
          style={{ color: colors.text.muted }}
        />
      </div>

      {actionLabel && (
        <div 
          className="mt-3 text-sm font-medium"
          style={{ color: accentColor }}
        >
          {actionLabel}
        </div>
      )}
    </button>
  );
}

// ============================================
// INFO CARD
// ============================================

interface InfoCardProps {
  /** Content */
  children: ReactNode;
  /** Variant */
  variant?: 'info' | 'success' | 'warning' | 'error';
  /** Icon */
  icon?: LucideIcon;
  /** Additional class */
  className?: string;
}

const VARIANT_STYLES = {
  info: {
    bg: `${colors.state.info}10`,
    border: `${colors.state.info}30`,
    icon: colors.state.info,
  },
  success: {
    bg: `${colors.state.success}10`,
    border: `${colors.state.success}30`,
    icon: colors.state.success,
  },
  warning: {
    bg: `${colors.state.warning}10`,
    border: `${colors.state.warning}30`,
    icon: colors.state.warning,
  },
  error: {
    bg: `${colors.state.error}10`,
    border: `${colors.state.error}30`,
    icon: colors.state.error,
  },
};

export function InfoCard({
  children,
  variant = 'info',
  icon: Icon,
  className,
}: InfoCardProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      className={cn('flex items-start gap-3 p-4 rounded-xl', className)}
      style={{
        backgroundColor: styles.bg,
        border: `1px solid ${styles.border}`,
      }}
    >
      {Icon && (
        <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: styles.icon }} />
      )}
      <div 
        className="text-sm"
        style={{ color: colors.text.primary }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================
// EMPTY STATE
// ============================================

interface EmptyStateProps {
  /** Title */
  title: string;
  /** Description */
  description?: string;
  /** Icon */
  icon?: LucideIcon;
  /** Action */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Additional class */
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}
    >
      {Icon && (
        <div 
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ backgroundColor: colors.background.surface1 }}
        >
          <Icon className="w-8 h-8" style={{ color: colors.text.muted }} />
        </div>
      )}

      <h3 
        className="text-lg font-semibold"
        style={{ color: colors.text.primary }}
      >
        {title}
      </h3>

      {description && (
        <p 
          className="text-sm mt-1 max-w-sm"
          style={{ color: colors.text.muted }}
        >
          {description}
        </p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: colors.brand.green,
            color: colors.background.obsidian,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
