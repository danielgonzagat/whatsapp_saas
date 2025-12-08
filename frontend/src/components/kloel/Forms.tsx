'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef, useState } from 'react';
import { Eye, EyeOff, Search, AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, motion, radius } from '@/lib/design-tokens';

// ============================================
// TEXT INPUT
// ============================================

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      fullWidth = true,
      className,
      type,
      disabled,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    return (
      <div className={cn(fullWidth ? 'w-full' : 'inline-flex flex-col', className)}>
        {label && (
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: colors.text.secondary }}
          >
            {label}
          </label>
        )}

        <div className="relative">
          {leftIcon && (
            <div
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: colors.text.muted }}
            >
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            type={inputType}
            disabled={disabled}
            className={cn(
              'w-full h-10 px-3 rounded-lg text-sm transition-all',
              'focus:outline-none focus:ring-2',
              leftIcon && 'pl-10',
              (rightIcon || isPassword) && 'pr-10',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            style={{
              backgroundColor: colors.background.surface1,
              border: `1px solid ${error ? colors.state.error : colors.stroke}`,
              color: colors.text.primary,
              transition: `all ${motion.duration.fast} ${motion.easing.default}`,
            }}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: colors.text.muted }}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}

          {rightIcon && !isPassword && (
            <div
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: colors.text.muted }}
            >
              {rightIcon}
            </div>
          )}
        </div>

        {(error || hint) && (
          <p
            className="mt-1.5 text-sm flex items-center gap-1"
            style={{ color: error ? colors.state.error : colors.text.muted }}
          >
            {error && <AlertCircle className="w-3.5 h-3.5" />}
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// ============================================
// SEARCH INPUT
// ============================================

interface SearchInputProps extends Omit<InputProps, 'leftIcon' | 'type'> {
  onSearch?: (value: string) => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onSearch, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="search"
        leftIcon={<Search className="w-4 h-4" />}
        placeholder="Buscar..."
        {...props}
      />
    );
  }
);

SearchInput.displayName = 'SearchInput';

// ============================================
// TEXTAREA
// ============================================

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, fullWidth = true, className, disabled, ...props }, ref) => {
    return (
      <div className={cn(fullWidth ? 'w-full' : 'inline-flex flex-col', className)}>
        {label && (
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: colors.text.secondary }}
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          disabled={disabled}
          className={cn(
            'w-full min-h-[100px] px-3 py-2.5 rounded-lg text-sm transition-all resize-y',
            'focus:outline-none focus:ring-2',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${error ? colors.state.error : colors.stroke}`,
            color: colors.text.primary,
          }}
          {...props}
        />

        {(error || hint) && (
          <p
            className="mt-1.5 text-sm flex items-center gap-1"
            style={{ color: error ? colors.state.error : colors.text.muted }}
          >
            {error && <AlertCircle className="w-3.5 h-3.5" />}
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// ============================================
// SELECT
// ============================================

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, fullWidth = true, className, disabled, ...props }, ref) => {
    return (
      <div className={cn(fullWidth ? 'w-full' : 'inline-flex flex-col', className)}>
        {label && (
          <label
            className="block text-sm font-medium mb-1.5"
            style={{ color: colors.text.secondary }}
          >
            {label}
          </label>
        )}

        <select
          ref={ref}
          disabled={disabled}
          className={cn(
            'w-full h-10 px-3 rounded-lg text-sm appearance-none cursor-pointer transition-all',
            'focus:outline-none focus:ring-2',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${error ? colors.state.error : colors.stroke}`,
            color: colors.text.primary,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23737B8C' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
            backgroundPosition: 'right 0.5rem center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '1.5em 1.5em',
            paddingRight: '2.5rem',
          }}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        {(error || hint) && (
          <p
            className="mt-1.5 text-sm flex items-center gap-1"
            style={{ color: error ? colors.state.error : colors.text.muted }}
          >
            {error && <AlertCircle className="w-3.5 h-3.5" />}
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

// ============================================
// CHECKBOX
// ============================================

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, disabled, checked, ...props }, ref) => {
    return (
      <label
        className={cn(
          'flex items-start gap-3 cursor-pointer',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        <div className="relative flex-shrink-0 mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            disabled={disabled}
            checked={checked}
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center transition-all',
              'peer-focus:ring-2 peer-focus:ring-offset-1'
            )}
            style={{
              backgroundColor: checked ? colors.brand.green : colors.background.surface1,
              border: `1px solid ${checked ? colors.brand.green : colors.stroke}`,
            }}
          >
            {checked && (
              <Check className="w-3.5 h-3.5" style={{ color: colors.background.obsidian }} />
            )}
          </div>
        </div>

        {(label || description) && (
          <div>
            {label && (
              <span className="text-sm font-medium" style={{ color: colors.text.primary }}>
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
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

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
}

export function Toggle({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className,
}: ToggleProps) {
  const sizes = {
    sm: { track: 'w-8 h-5', thumb: 'w-4 h-4', translate: 'translate-x-3' },
    md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
  };

  const s = sizes[size];

  return (
    <label
      className={cn(
        'flex items-start gap-3 cursor-pointer',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative inline-flex flex-shrink-0 rounded-full transition-colors',
          s.track
        )}
        style={{
          backgroundColor: checked ? colors.brand.green : colors.background.surface2,
        }}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 rounded-full transition-transform',
            s.thumb,
            checked && s.translate
          )}
          style={{
            backgroundColor: colors.text.primary,
          }}
        />
      </button>

      {(label || description) && (
        <div>
          {label && (
            <span className="text-sm font-medium" style={{ color: colors.text.primary }}>
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
    </label>
  );
}
