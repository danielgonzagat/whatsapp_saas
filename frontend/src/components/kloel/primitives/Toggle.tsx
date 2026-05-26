'use client';

import { colors } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';
import { useId } from 'react';
// ============================================
// TOGGLE / SWITCH
// ============================================

interface ToggleProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  accentColor?: string;
  offTrackColor?: string;
}
/** Toggle. */
export function Toggle({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className,
  accentColor = colors.brand.green,
  offTrackColor = colors.background.surface2,
}: ToggleProps) {
  const sizes = {
    sm: { track: 'w-8 h-5', thumb: 'w-4 h-4', translate: 'translate-x-3' },
    md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
  };

  const s = sizes[size];

  const autoId = useId();

  return (
    <div
      className={cn(
        'flex items-start gap-3 cursor-pointer',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? `${autoId}-toggle-label` : undefined}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn('relative inline-flex flex-shrink-0 rounded-full transition-colors', s.track)}
        style={{
          backgroundColor: checked ? accentColor : offTrackColor,
        }}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 rounded-full transition-transform',
            s.thumb,
            checked && s.translate,
          )}
          style={{
            backgroundColor: colors.text.primary,
          }}
        />
      </button>

      {(label || description) && (
        <div>
          {label && (
            <span
              id={`${autoId}-toggle-label`}
              className="text-sm font-medium"
              style={{ color: colors.text.primary }}
            >
              {label}
            </span>
          )}
          {description && (
            <p className="text-sm mt-0.5" style={{ color: colors.text.muted }}>
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
