import { colors } from '@/lib/design-tokens';
import { ReactNode } from 'react';

interface LabeledFormFieldProps {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'email';
  placeholder?: string;
  children?: ReactNode;
  style?: React.CSSProperties;
  error?: string;
  min?: number;
  max?: number;
  step?: number | string;
}

const labelStyle = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  color: colors.text.muted,
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '.08em',
} as const;

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  marginBottom: 0,
  fontSize: 11,
  fontWeight: 600,
  border: `1px solid ${colors.border.glow}`,
  borderRadius: 4,
  backgroundColor: colors.background.void,
  color: colors.text.silver,
  fontFamily: 'JetBrains Mono, monospace',
} as const;

/** Labeled form field. */
export function LabeledFormField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  children,
  style,
  error,
  min,
  max,
  step,
}: LabeledFormFieldProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div style={style}>
      <label style={labelStyle} htmlFor={id}>
        {label}
      </label>
      {children ? (
        children
      ) : (
        <input
          type={type}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, border: error ? `1px solid ${colors.state.error}` : inputStyle.border }}
          min={min}
          max={max}
          step={step}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
      )}
      {error ? (
        <div id={errorId} role="alert" style={{ marginTop: 6, color: colors.state.error, fontSize: 11 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
