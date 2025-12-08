'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

// -------------- DESIGN TOKENS --------------
const COLORS = {
  bg: '#050608',
  surface: '#111317',
  surfaceHover: '#181B20',
  green: '#28E07B',
  greenHover: '#1FC66A',
  textPrimary: '#F5F5F7',
  textSecondary: '#A0A3AA',
  border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
};

// -------------- MISSION CARD --------------
interface MissionCardProps {
  /** Card icon */
  icon: React.ElementType;
  /** Card title */
  title: string;
  /** Card description */
  description: string;
  /** Badge text (optional) */
  badge?: string;
  /** Badge color variant */
  badgeVariant?: 'green' | 'blue' | 'yellow' | 'red' | 'purple';
  /** Click handler */
  onClick?: () => void;
  /** Whether this card is highlighted/recommended */
  highlighted?: boolean;
  /** Custom class */
  className?: string;
}

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  green: { bg: 'rgba(40,224,123,0.15)', text: '#28E07B' },
  blue: { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' },
  yellow: { bg: 'rgba(234,179,8,0.15)', text: '#EAB308' },
  red: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  purple: { bg: 'rgba(168,85,247,0.15)', text: '#A855F7' },
};

export function MissionCard({
  icon: Icon,
  title,
  description,
  badge,
  badgeVariant = 'green',
  onClick,
  highlighted = false,
  className,
}: MissionCardProps) {
  const badgeColor = BADGE_COLORS[badgeVariant] || BADGE_COLORS.green;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-start p-5 rounded-2xl text-left transition-all duration-200',
        'hover:scale-[1.02] hover:shadow-xl',
        className
      )}
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${highlighted ? COLORS.green : COLORS.border}`,
      }}
    >
      {/* Highlighted glow */}
      {highlighted && (
        <div
          className="absolute inset-0 rounded-2xl opacity-20 blur-xl"
          style={{ backgroundColor: COLORS.green }}
        />
      )}

      {/* Badge */}
      {badge && (
        <span
          className="px-2.5 py-1 rounded-full text-xs font-medium mb-3"
          style={{
            backgroundColor: badgeColor.bg,
            color: badgeColor.text,
          }}
        >
          {badge}
        </span>
      )}

      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors"
        style={{
          backgroundColor: highlighted ? COLORS.green : COLORS.surfaceHover,
          color: highlighted ? COLORS.bg : COLORS.green,
        }}
      >
        <Icon className="w-5 h-5" />
      </div>

      {/* Title */}
      <h3
        className="text-base font-semibold mb-1.5"
        style={{ color: COLORS.textPrimary }}
      >
        {title}
      </h3>

      {/* Description */}
      <p
        className="text-sm leading-relaxed"
        style={{ color: COLORS.textSecondary }}
      >
        {description}
      </p>

      {/* Arrow indicator on hover */}
      <div
        className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: COLORS.green }}
      >
        <ArrowRight className="w-5 h-5" />
      </div>
    </button>
  );
}

// -------------- MISSION GRID --------------
interface MissionGridProps {
  children: ReactNode;
  /** Number of columns */
  columns?: 2 | 3 | 4;
  className?: string;
}

export function MissionGrid({
  children,
  columns = 3,
  className,
}: MissionGridProps) {
  const colsClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={cn('grid gap-4', colsClass[columns], className)}>
      {children}
    </div>
  );
}

// -------------- STAT CARD --------------
interface StatCardProps {
  /** Card icon */
  icon: React.ElementType;
  /** Label */
  label: string;
  /** Main value */
  value: string | number;
  /** Change/delta (e.g., "+12%") */
  change?: string;
  /** Whether change is positive */
  changePositive?: boolean;
  /** Click handler */
  onClick?: () => void;
  className?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  change,
  changePositive = true,
  onClick,
  className,
}: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex items-center gap-4 p-4 rounded-xl text-left transition-all duration-200',
        'hover:scale-[1.02]',
        className
      )}
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: COLORS.surfaceHover,
          color: COLORS.green,
        }}
      >
        <Icon className="w-6 h-6" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm truncate"
          style={{ color: COLORS.textSecondary }}
        >
          {label}
        </p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span
            className="text-2xl font-semibold"
            style={{ color: COLORS.textPrimary }}
          >
            {value}
          </span>
          {change && (
            <span
              className="text-sm font-medium"
              style={{
                color: changePositive ? '#28E07B' : '#EF4444',
              }}
            >
              {change}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export type { MissionCardProps, StatCardProps };
