'use client';
import { colors, typography } from '@/lib/design-tokens';
import React, { useId } from 'react';

export const cosmosLabelStyle: React.CSSProperties = {
  fontFamily: typography.fontFamily.display,
  fontSize: '11px',
  fontWeight: 600,
  color: colors.text.dust,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
};

export const cardStyle: React.CSSProperties = {
  background: colors.background.space,
  border: `1px solid ${colors.border.space}`,
  borderRadius: '6px',
};

export const inputStyle: React.CSSProperties = {
  background: colors.background.nebula,
  border: `1px solid ${colors.border.space}`,
  color: colors.text.starlight,
  borderRadius: '6px',
};

export const selectClass = 'w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none';
export const inputClass = selectClass;
export const labelStyle = cosmosLabelStyle;

export const sectionTitle = (t: string) => (
  <h3
    className="mb-4 text-sm font-semibold uppercase"
    style={{
      fontFamily: typography.fontFamily.display,
      color: colors.text.starlight,
      letterSpacing: '0.02em',
    }}
  >
    {t}
  </h3>
);

export const CosmosRadioGroup = ({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) => {
  const groupId = useId();
  return (
    <fieldset>
      <legend className="mb-2 block" style={cosmosLabelStyle}>
        {label}
      </legend>
      <div className="space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            htmlFor={`${groupId}-${opt.value}`}
            className="flex cursor-pointer items-start gap-2.5"
          >
            <input
              id={`${groupId}-${opt.value}`}
              type="radio"
              name={`${groupId}-group`}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              style={{ accentColor: colors.accent.webb }}
              className="mt-0.5"
            />
            <span className="text-sm font-medium" style={{ color: colors.text.starlight }}>
              {opt.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};
