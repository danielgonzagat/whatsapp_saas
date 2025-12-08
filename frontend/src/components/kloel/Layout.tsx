'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { colors, motion, radius, shadows, zIndex } from '@/lib/design-tokens';

// ============================================
// TYPES
// ============================================

/** Stage size variants per Blueprint */
export type StageSize = 'dock' | 'L' | 'XL';

export interface StageProps {
  /** Stage size */
  size?: StageSize;
  /** Content */
  children: ReactNode;
  /** Additional class */
  className?: string;
}

// ============================================
// STAGE SIZES
// ============================================

const STAGE_WIDTHS: Record<StageSize, string> = {
  dock: 'max-w-[480px]',    // Dock: compact view
  L: 'max-w-[720px]',       // L: standard expanded
  XL: 'max-w-[1080px]',     // XL: full data view
};

// ============================================
// LAYER A: SHELL (always visible structure)
// ============================================

interface ShellProps {
  children: ReactNode;
  className?: string;
}

export function Shell({ children, className }: ShellProps) {
  return (
    <div
      className={cn(
        'min-h-screen w-full flex flex-col',
        className
      )}
      style={{
        backgroundColor: colors.background.obsidian,
        color: colors.text.primary,
      }}
    >
      {children}
    </div>
  );
}

// ============================================
// LAYER B: CENTER STAGE (main content area)
// ============================================

export function CenterStage({ 
  size = 'L', 
  children, 
  className 
}: StageProps) {
  return (
    <div
      className={cn(
        'w-full mx-auto px-4 sm:px-6',
        STAGE_WIDTHS[size],
        className
      )}
      style={{
        transition: `all ${motion.duration.normal} ${motion.easing.default}`,
      }}
    >
      {children}
    </div>
  );
}

// ============================================
// LAYER C: SURFACE (cards, modals, overlays)
// ============================================

interface SurfaceProps {
  children: ReactNode;
  className?: string;
  variant?: 'card' | 'elevated' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const SURFACE_VARIANTS = {
  card: {
    backgroundColor: colors.background.surface1,
    border: `1px solid ${colors.stroke}`,
    boxShadow: shadows.card,
  },
  elevated: {
    backgroundColor: colors.background.surface1,
    border: `1px solid ${colors.stroke}`,
    boxShadow: shadows.elevated,
  },
  glass: {
    backgroundColor: `${colors.background.surface1}80`,
    border: `1px solid ${colors.divider}`,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
  },
};

const SURFACE_PADDING = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Surface({ 
  children, 
  className, 
  variant = 'card',
  padding = 'md',
}: SurfaceProps) {
  return (
    <div
      className={cn(
        'rounded-xl',
        SURFACE_PADDING[padding],
        className
      )}
      style={{
        ...SURFACE_VARIANTS[variant],
        borderRadius: radius.xl,
        transition: `all ${motion.duration.normal} ${motion.easing.default}`,
      }}
    >
      {children}
    </div>
  );
}

// ============================================
// MODAL SURFACE
// ============================================

interface ModalSurfaceProps {
  children: ReactNode;
  className?: string;
  open?: boolean;
  onClose?: () => void;
}

export function ModalSurface({ 
  children, 
  className,
  open = true,
  onClose,
}: ModalSurfaceProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: zIndex.modal }}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0"
        style={{ 
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      />
      
      {/* Content */}
      <div
        className={cn(
          'relative w-full max-w-lg rounded-2xl p-6',
          className
        )}
        style={{
          backgroundColor: colors.background.surface1,
          border: `1px solid ${colors.stroke}`,
          boxShadow: shadows.elevated,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================
// CONTENT SECTIONS
// ============================================

interface SectionProps {
  children: ReactNode;
  className?: string;
  spacing?: 'none' | 'sm' | 'md' | 'lg';
}

const SECTION_SPACING = {
  none: '',
  sm: 'py-4',
  md: 'py-8',
  lg: 'py-12',
};

export function Section({ 
  children, 
  className,
  spacing = 'md',
}: SectionProps) {
  return (
    <section className={cn(SECTION_SPACING[spacing], className)}>
      {children}
    </section>
  );
}

// ============================================
// DIVIDERS
// ============================================

interface DividerProps {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

export function Divider({ 
  className,
  orientation = 'horizontal',
}: DividerProps) {
  return (
    <div 
      className={cn(
        orientation === 'horizontal' ? 'w-full h-px' : 'h-full w-px',
        className
      )}
      style={{ backgroundColor: colors.divider }}
    />
  );
}

// ============================================
// FLEX LAYOUTS
// ============================================

interface FlexProps {
  children: ReactNode;
  className?: string;
  direction?: 'row' | 'col';
  gap?: 0 | 1 | 2 | 3 | 4 | 6 | 8;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
}

const GAP_MAP = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8',
};

const ALIGN_MAP = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const JUSTIFY_MAP = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

export function Flex({ 
  children, 
  className,
  direction = 'row',
  gap = 4,
  align = 'center',
  justify = 'start',
}: FlexProps) {
  return (
    <div 
      className={cn(
        'flex',
        direction === 'col' ? 'flex-col' : 'flex-row',
        GAP_MAP[gap],
        ALIGN_MAP[align],
        JUSTIFY_MAP[justify],
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================
// GRID LAYOUTS
// ============================================

interface GridProps {
  children: ReactNode;
  className?: string;
  cols?: 1 | 2 | 3 | 4;
  gap?: 2 | 3 | 4 | 6 | 8;
}

const COLS_MAP = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

export function Grid({ 
  children, 
  className,
  cols = 2,
  gap = 4,
}: GridProps) {
  return (
    <div 
      className={cn(
        'grid',
        COLS_MAP[cols],
        GAP_MAP[gap],
        className
      )}
    >
      {children}
    </div>
  );
}
