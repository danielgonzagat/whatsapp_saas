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
}

const labelStyle = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  color: '#ADA5A5',
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
  border: '1px solid #2C2C2C',
  borderRadius: 4,
  backgroundColor: '#1A1A1A',
  color: '#F5F5F5',
  fontFamily: 'JetBrains Mono, monospace',
} as const;

export function LabeledFormField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  children,
  style,
}: LabeledFormFieldProps) {
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
          style={inputStyle}
        />
      )}
    </div>
  );
}
