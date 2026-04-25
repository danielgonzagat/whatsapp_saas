'use client';

// Shared micro-primitives extracted to eliminate clone groups in:
//   canvas-editor-property-bar.tsx (18 clones)
//   canvas-editor-tools-panel.tsx  (6 clones)
// All primitives are pure presentational — no state, no side-effects.

import { UI } from '@/lib/ui-tokens';
import { FONT_SORA as S, FONT_JETBRAINS as M } from './canvas-editor.types';

// ── Property bar primitives ────────────────────────────────────────────────

/** Shared label span used inside property bar controls. */
const labelSpanStyle: React.CSSProperties = {
  fontSize: 9,
  color: UI.muted,
  fontFamily: S,
};

/** Shared range input style. */
const rangeInputStyle: React.CSSProperties = {
  width: 50,
  accentColor: UI.accent,
  cursor: 'pointer',
};

/** Shared color input style. */
const colorInputStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  padding: 0,
};

/** Number input used for font-size and stroke-width controls. */
export const propNumberInputStyle: React.CSSProperties = {
  background: UI.bg,
  border: '1px solid UI.border',
  borderRadius: UI.radiusSm,
  color: UI.text,
  fontSize: 10,
  fontFamily: M,
  padding: '3px 4px',
  outline: 'none',
  textAlign: 'center',
};

/** A labelled range slider used in the property bar. */
export function RangeControl({
  label,
  min,
  max,
  value,
  defaultValue,
  onChange,
  showValue,
}: {
  label: string;
  min: number;
  max: number;
  value?: number;
  defaultValue?: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showValue?: string;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={labelSpanStyle}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        onChange={onChange}
        style={rangeInputStyle}
      />
      {showValue !== undefined ? (
        <span style={{ fontSize: 9, color: UI.tertiary, fontFamily: M, width: 24 }}>
          {showValue}
        </span>
      ) : null}
    </label>
  );
}

/** A labelled color picker used in the property bar. */
export function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
      <span style={labelSpanStyle}>{label}</span>
      <input type="color" value={value} onChange={onChange} style={colorInputStyle} />
    </label>
  );
}

/** A toggle button used in the property bar toolbar (B, I, U, align). */
export function ToolbarToggleButton({
  active,
  onClick,
  title,
  fontWeight,
  fontStyle,
  textDecoration,
  fontFamily,
  children,
}: React.PropsWithChildren<{
  active: boolean;
  onClick: () => void;
  title?: string;
  fontWeight?: React.CSSProperties['fontWeight'];
  fontStyle?: React.CSSProperties['fontStyle'];
  textDecoration?: React.CSSProperties['textDecoration'];
  fontFamily?: React.CSSProperties['fontFamily'];
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        background: active ? 'UI.border' : 'none',
        border: 'none',
        color: UI.text,
        cursor: 'pointer',
        padding: '2px 6px',
        borderRadius: UI.radiusSm,
        fontSize: 12,
        fontFamily: fontFamily ?? S,
        fontWeight: fontWeight,
        fontStyle: fontStyle,
        textDecoration: textDecoration,
      }}
    >
      {children}
    </button>
  );
}

// ── Tools panel primitives ─────────────────────────────────────────────────

/** A tool card button with a coloured icon square and a label. */
export function ToolCard({
  icon,
  iconBg,
  label,
  cardBg,
  borderColor,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  cardBg?: string;
  borderColor?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${borderColor ?? UI.border}`,
        borderRadius: UI.radiusMd,
        background: cardBg ?? UI.surface,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '12px 14px',
        gap: 10,
        justifyContent: 'flex-start',
        transition: 'border-color 200ms, background 200ms',
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: UI.radiusMd,
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 11, color: UI.text, fontFamily: S, fontWeight: 600 }}>{label}</span>
    </button>
  );
}
