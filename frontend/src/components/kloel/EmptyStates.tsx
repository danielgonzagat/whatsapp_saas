'use client';

/**
 * ============================================
 * EMPTY STATES LIBRARY
 * ============================================
 * Biblioteca de empty states contextuais para todas as páginas.
 * "Nunca deixe o usuário olhando para o vazio."
 *
 * Cada empty state tem:
 * - Ilustração/ícone contextual
 * - Mensagem principal clara
 * - Sugestão de ação imediata
 * - Prompt opcional para o agente
 * ============================================
 */

import { colors } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import {
  EMPTY_STATE_CONFIGS,
  type EmptyStateConfig,
  type EmptyStateVariant,
  SIZE_STYLES,
  VARIANT_STYLES,
} from './EmptyStates.data';

// Re-export pure data + types so existing consumers keep working.
export {
  EMPTY_STATE_CONFIGS,
  SIZE_STYLES,
  VARIANT_STYLES,
};
export type { EmptyStateConfig, EmptyStateVariant };

// ============================================
// COMPONENT PROPS
// ============================================

/** Contextual empty state props shape. */
export interface ContextualEmptyStateProps {
  /** Context/page type */
  context: keyof typeof EMPTY_STATE_CONFIGS;
  /** Variant of empty state */
  variant?: EmptyStateVariant;
  /** Override title */
  title?: string;
  /** Override description */
  description?: string;
  /** Primary action callback */
  onAction?: () => void;
  /** Fill composer with prompt */
  onFillComposer?: (prompt: string) => void;
  /** Secondary action callback */
  onSecondaryAction?: () => void;
  /** Custom icon */
  icon?: LucideIcon;
  /** Additional class */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

// ============================================
// COMPONENT
// ============================================

export function ContextualEmptyState({
  context,
  variant = 'default',
  title: customTitle,
  description: customDescription,
  onAction,
  onFillComposer,
  onSecondaryAction,
  icon: customIcon,
  className,
  size = 'md',
}: ContextualEmptyStateProps) {
  const config = EMPTY_STATE_CONFIGS[context] || EMPTY_STATE_CONFIGS.generic;
  const variantStyle = VARIANT_STYLES[variant];
  const sizeStyle = SIZE_STYLES[size];

  const Icon = customIcon || config.icon;
  const title = customTitle || config.title;
  const description = customDescription || config.description;

  const handlePrimaryAction = () => {
    if (onAction) {
      onAction();
    } else if (onFillComposer && config.actionPrompt) {
      onFillComposer(config.actionPrompt);
    }
  };

  const handleSecondaryAction = () => {
    if (onSecondaryAction) {
      onSecondaryAction();
    } else if (onFillComposer && config.secondaryAction?.prompt) {
      onFillComposer(config.secondaryAction.prompt);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-2xl',
        sizeStyle.padding,
        className,
      )}
      style={{
        backgroundColor: variantStyle.bgColor,
        border: variantStyle.borderColor
          ? `1px solid ${variantStyle.borderColor}`
          : `1px dashed ${colors.stroke}`,
      }}
    >
      {/* Icon */}
      <div
        className={cn('rounded-2xl flex items-center justify-center mb-4', sizeStyle.iconBox)}
        style={{
          backgroundColor: `${variantStyle.iconColor}15`,
        }}
      >
        <Icon className={sizeStyle.iconSize} style={{ color: variantStyle.iconColor }} />
      </div>

      {/* Title */}
      <h3 className={cn('font-semibold', sizeStyle.title)} style={{ color: colors.text.primary }}>
        {title}
      </h3>

      {/* Description */}
      <p
        className={cn('mt-1.5 max-w-sm', sizeStyle.description)}
        style={{ color: colors.text.muted }}
      >
        {description}
      </p>

      {/* Actions */}
      {(config.actionLabel || config.secondaryAction) && (
        <div className="flex items-center gap-3 mt-5">
          {config.actionLabel && (
            <button
              type="button"
              onClick={handlePrimaryAction}
              className={cn(
                'rounded-lg font-medium transition-all hover:opacity-90',
                sizeStyle.buttonSize,
              )}
              style={{
                backgroundColor: colors.brand.green,
                color: colors.background.obsidian,
              }}
            >
              {config.actionLabel}
            </button>
          )}

          {config.secondaryAction && (
            <button
              type="button"
              onClick={handleSecondaryAction}
              className={cn(
                'rounded-lg font-medium transition-all hover:bg-white/5',
                sizeStyle.buttonSize,
              )}
              style={{
                backgroundColor: 'transparent',
                color: colors.text.secondary,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              {config.secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// SIMPLE INLINE EMPTY STATE
// ============================================

interface InlineEmptyStateProps {
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/** Inline empty state. */
export function InlineEmptyState({ message, action, className }: InlineEmptyStateProps) {
  return (
    <div
      className={cn('flex items-center justify-center gap-3 py-6 px-4', className)}
      style={{ color: colors.text.muted }}
    >
      <span className="text-sm">{message}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-sm font-medium hover:underline"
          style={{ color: colors.brand.cyan }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ============================================
// SKELETON PLACEHOLDER
// ============================================

interface SkeletonEmptyStateProps {
  lines?: number;
  className?: string;
}

/** Skeleton empty state. */
export function SkeletonEmptyState({ lines = 3, className }: SkeletonEmptyStateProps) {
  const lineItems = Array.from({ length: lines }, (_, i) => ({
    id: `skeleton-line-${i}-of-${lines}`,
    isLast: i === lines - 1,
  }));
  return (
    <div className={cn('animate-pulse space-y-3', className)}>
      {lineItems.map((line) => (
        <div
          key={line.id}
          className="h-4 rounded"
          style={{
            backgroundColor: colors.background.surface2,
            width: line.isLast ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  );
}

export default ContextualEmptyState;
