'use client';

import type React from 'react';
import { S, V, ls } from './product-nerve-center.shared';

const D_RE = /\D/g;
const PATTERN_RE = /\./g;
const D_RE_2 = /[^\d,]/g;
const PATTERN_RE_2 = /,+/g;
const PATTERN_RE_3 = /,/g;

const shellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  minHeight: 46,
  background: V.e,
  border: `1px solid ${V.b}`,
  borderRadius: 8,
  overflow: 'hidden',
};

const textInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'transparent',
  color: V.t,
  fontSize: 14,
  fontFamily: S,
  outline: 'none',
};

const insetPrefixStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  paddingLeft: 14,
  paddingRight: 10,
  color: 'rgba(224,221,216,0.42)',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  fontFamily: S,
  whiteSpace: 'nowrap',
};

const stepperRailStyle: React.CSSProperties = {
  width: 38,
  borderLeft: `1px solid ${V.b}`,
  display: 'grid',
  gridTemplateRows: '1fr 1fr',
  background: 'rgba(255,255,255,0.015)',
};

const stepperButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: V.t2,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background .16s ease, color .16s ease',
};

const helperTextStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 6,
  fontSize: 11,
  color: V.t3,
  lineHeight: 1.5,
};

function clamp(value: number, min: number, max?: number) {
  const withMin = Math.max(min, value);
  return max === undefined ? withMin : Math.min(withMin, max);
}

function sanitizeDigits(value: string) {
  return String(value || '').replace(D_RE, '');
}

function formatCurrencyDigits(cents: number) {
  return (Math.max(0, Math.round(Number(cents || 0))) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizePercentInput(raw: string, min: number, max: number) {
  const cleaned = String(raw || '')
    .replace(PATTERN_RE, ',')
    .replace(D_RE_2, '')
    .replace(PATTERN_RE_2, ',');

  const firstCommaIndex = cleaned.indexOf(',');
  const normalized =
    firstCommaIndex === -1
      ? cleaned
      : `${cleaned.slice(0, firstCommaIndex).replace(PATTERN_RE_3, '')},${cleaned
          .slice(firstCommaIndex + 1)
          .replace(PATTERN_RE_3, '')}`;

  if (!normalized) return `${min}`;

  const parsed = Number(normalized.replace(',', '.'));
  if (!Number.isFinite(parsed)) return `${min}`;
  return String(clamp(parsed, min, max)).replace('.', ',');
}

function StepperIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      {direction === 'up' ? (
        <polyline points="6 14 12 8 18 14" />
      ) : (
        <polyline points="6 10 12 16 18 10" />
      )}
    </svg>
  );
}

function FieldContainer({
  label,
  full,
  helper,
  children,
}: {
  label: string;
  full?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: full ? '1 1 100%' : '1 1 45%', minWidth: 0, marginBottom: 14 }}>
      <span style={ls}>{label}</span>
      {children}
      {helper ? <span style={helperTextStyle}>{helper}</span> : null}
    </div>
  );
}

export function IntegerStepperField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
  full,
  helper,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  full?: boolean;
  helper?: string;
}) {
  const safeValue = clamp(Math.round(Number(value || 0)), min, max);

  return (
    <FieldContainer label={label} full={full} helper={helper}>
      <div style={shellStyle}>
        <input
          type="text"
          inputMode="numeric"
          value={String(safeValue)}
          onChange={(event) => {
            const digits = sanitizeDigits(event.target.value);
            onChange(clamp(Number(digits || min), min, max));
          }}
          style={{ ...textInputStyle, padding: '0 14px' }}
        />
        {suffix ? <span style={{ ...insetPrefixStyle, paddingLeft: 0 }}>{suffix}</span> : null}
        <div style={stepperRailStyle}>
          <button
            type="button"
            onClick={() => onChange(clamp(safeValue + step, min, max))}
            style={{ ...stepperButtonStyle, borderBottom: `1px solid ${V.b}` }}
          >
            <StepperIcon direction="up" />
          </button>
          <button
            type="button"
            onClick={() => onChange(clamp(safeValue - step, min, max))}
            style={stepperButtonStyle}
          >
            <StepperIcon direction="down" />
          </button>
        </div>
      </div>
    </FieldContainer>
  );
}

export function CurrencyStepperField({
  label,
  cents,
  onChange,
  minCents = 0,
  stepCents = 100,
  full,
  helper,
}: {
  label: string;
  cents: number;
  onChange: (next: number) => void;
  minCents?: number;
  stepCents?: number;
  full?: boolean;
  helper?: string;
}) {
  const safeValue = Math.max(minCents, Math.round(Number(cents || 0)));

  return (
    <FieldContainer label={label} full={full} helper={helper}>
      <div style={shellStyle}>
        <span style={insetPrefixStyle}>R$</span>
        <input
          type="text"
          inputMode="numeric"
          value={formatCurrencyDigits(safeValue)}
          onChange={(event) => {
            const digits = sanitizeDigits(event.target.value);
            onChange(Math.max(minCents, Number(digits || '0')));
          }}
          style={{ ...textInputStyle, paddingRight: 8 }}
        />
        <div style={stepperRailStyle}>
          <button
            type="button"
            onClick={() => onChange(safeValue + stepCents)}
            style={{ ...stepperButtonStyle, borderBottom: `1px solid ${V.b}` }}
          >
            <StepperIcon direction="up" />
          </button>
          <button
            type="button"
            onClick={() => onChange(Math.max(minCents, safeValue - stepCents))}
            style={stepperButtonStyle}
          >
            <StepperIcon direction="down" />
          </button>
        </div>
      </div>
    </FieldContainer>
  );
}

export function PercentStepperField({
  label,
  value,
  onChange,
  min = 1,
  max = 100,
  full,
  helper,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  full?: boolean;
  helper?: string;
}) {
  const normalized = normalizePercentInput(value, min, max);
  const parsed = Number(normalized.replace(',', '.'));
  const rounded = Number.isFinite(parsed) ? clamp(Math.round(parsed), min, max) : min;

  return (
    <FieldContainer label={label} full={full} helper={helper}>
      <div style={shellStyle}>
        <input
          type="text"
          inputMode="decimal"
          value={normalized}
          onChange={(event) => onChange(normalizePercentInput(event.target.value, min, max))}
          style={{ ...textInputStyle, padding: '0 14px' }}
        />
        <span style={{ ...insetPrefixStyle, paddingLeft: 0 }}>%</span>
        <div style={stepperRailStyle}>
          <button
            type="button"
            onClick={() => onChange(String(clamp(rounded + 1, min, max)))}
            style={{ ...stepperButtonStyle, borderBottom: `1px solid ${V.b}` }}
          >
            <StepperIcon direction="up" />
          </button>
          <button
            type="button"
            onClick={() => onChange(String(clamp(rounded - 1, min, max)))}
            style={stepperButtonStyle}
          >
            <StepperIcon direction="down" />
          </button>
        </div>
      </div>
    </FieldContainer>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  full,
  helper,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  full?: boolean;
  helper?: string;
}) {
  return (
    <FieldContainer label={label} full={full} helper={helper}>
      <div style={shellStyle}>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{
            ...textInputStyle,
            padding: '0 14px',
            appearance: 'none',
            cursor: 'pointer',
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div
          style={{
            width: 42,
            borderLeft: `1px solid ${V.b}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: V.t2,
          }}
        >
          <StepperIcon direction="down" />
        </div>
      </div>
    </FieldContainer>
  );
}
