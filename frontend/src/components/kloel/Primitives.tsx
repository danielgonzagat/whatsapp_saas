'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, motion, radius } from '@/lib/design-tokens';

// ============================================
// BUTTON VARIANTS
// ============================================

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, { bg: string; bgHover: string; text: string; border?: string }> = {
  primary: {
    bg: colors.brand.green,
    bgHover: colors.brand.greenHover,
    text: colors.background.obsidian,
  },
  secondary: {
    bg: colors.background.surface1,
    bgHover: colors.background.surface2,
    text: colors.text.primary,
    border: colors.stroke,
  },
  ghost: {
    bg: 'transparent',
    bgHover: 'rgba(255,255,255,0.05)',
    text: colors.text.secondary,
  },
  danger: {
    bg: colors.state.error,
    bgHover: '#E5404F',
    text: '#fff',
  },
  success: {
    bg: colors.brand.green,
    bgHover: colors.brand.greenHover,
    text: colors.background.obsidian,
  },
};

const SIZE_STYLES: Record<ButtonSize, { padding: string; fontSize: string; height: string }> = {
  sm: { padding: 'px-3', fontSize: 'text-sm', height: 'h-8' },
  md: { padding: 'px-4', fontSize: 'text-sm', height: 'h-10' },
  lg: { padding: 'px-6', fontSize: 'text-base', height: 'h-12' },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className,
      children,
      style,
      ...props
    },
    ref
  ) => {
    const variantStyle = VARIANT_STYLES[variant];
    const sizeStyle = SIZE_STYLES[size];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          sizeStyle.padding,
          sizeStyle.fontSize,
          sizeStyle.height,
          className
        )}
        style={{
          backgroundColor: variantStyle.bg,
          color: variantStyle.text,
          border: variantStyle.border ? `1px solid ${variantStyle.border}` : 'none',
          transition: `all ${motion.duration.fast} ${motion.easing.default}`,
          ...style,
        }}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';

// ============================================
// ICON BUTTON
// ============================================

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon: React.ReactNode;
  'aria-label': string;
}

const ICON_SIZE_STYLES: Record<ButtonSize, { size: string }> = {
  sm: { size: 'w-8 h-8' },
  md: { size: 'w-10 h-10' },
  lg: { size: 'w-12 h-12' },
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'md',
      isLoading = false,
      disabled,
      className,
      icon,
      style,
      ...props
    },
    ref
  ) => {
    const variantStyle = VARIANT_STYLES[variant];
    const sizeStyle = ICON_SIZE_STYLES[size];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center rounded-lg transition-all',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          sizeStyle.size,
          className
        )}
        style={{
          backgroundColor: variantStyle.bg,
          color: variantStyle.text,
          border: variantStyle.border ? `1px solid ${variantStyle.border}` : 'none',
          transition: `all ${motion.duration.fast} ${motion.easing.default}`,
          ...style,
        }}
        {...props}
      >
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

// ============================================
// CHIP / TAG
// ============================================

interface ChipProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand';
  size?: 'sm' | 'md';
  className?: string;
  onClick?: () => void;
  onRemove?: () => void;
}

const CHIP_VARIANTS = {
  default: { bg: colors.background.surface2, text: colors.text.secondary },
  success: { bg: `${colors.state.success}20`, text: colors.state.success },
  warning: { bg: `${colors.state.warning}20`, text: colors.state.warning },
  error: { bg: `${colors.state.error}20`, text: colors.state.error },
  info: { bg: `${colors.state.info}20`, text: colors.state.info },
  brand: { bg: `${colors.brand.green}20`, text: colors.brand.green },
};

export function Chip({
  children,
  variant = 'default',
  size = 'md',
  className,
  onClick,
  onRemove,
}: ChipProps) {
  const style = CHIP_VARIANTS[variant];
  const Component = onClick ? 'button' : 'span';

  return (
    <Component
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        onClick && 'cursor-pointer hover:opacity-80',
        className
      )}
      style={{
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-70"
        >
          ×
        </button>
      )}
    </Component>
  );
}

// ============================================
// BADGE
// ============================================

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  dot?: boolean;
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  dot = false,
  className,
}: BadgeProps) {
  const style = CHIP_VARIANTS[variant];

  if (dot) {
    return (
      <span
        className={cn('w-2 h-2 rounded-full', className)}
        style={{ backgroundColor: style.text }}
      />
    );
  }

  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full', className)}
      style={{
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {children}
    </span>
  );
}

// ============================================
// AVATAR
// ============================================

interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy' | 'away';
  className?: string;
}

const AVATAR_SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

const STATUS_COLORS = {
  online: colors.state.success,
  offline: colors.text.muted,
  busy: colors.state.error,
  away: colors.state.warning,
};

export function Avatar({
  src,
  alt,
  name,
  size = 'md',
  status,
  className,
}: AvatarProps) {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  return (
    <div className={cn('relative inline-flex', className)}>
      <div
        className={cn(
          'rounded-full overflow-hidden flex items-center justify-center font-medium',
          AVATAR_SIZES[size]
        )}
        style={{
          backgroundColor: colors.background.surface2,
          color: colors.text.primary,
          border: `2px solid ${colors.stroke}`,
        }}
      >
        {src ? (
          <img src={src} alt={alt || name || 'Avatar'} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>

      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2',
            size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
          )}
          style={{
            backgroundColor: STATUS_COLORS[status],
            borderColor: colors.background.obsidian,
          }}
        />
      )}
    </div>
  );
}

// ============================================
// SKELETON
// ============================================

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse',
        variant === 'circular' && 'rounded-full',
        variant === 'text' && 'rounded h-4',
        variant === 'rectangular' && 'rounded-lg',
        className
      )}
      style={{
        backgroundColor: colors.background.surface2,
        width: width,
        height: height,
      }}
    />
  );
}
