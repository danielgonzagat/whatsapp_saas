'use client';

import { kloelT } from '@/lib/i18n/t';
// PULSE:OK — useCheckoutEditor hook has built-in SWR optimistic update + mutate on every config patch. setTimeout calls are UI state resets (save indicator, highlight), not fake_save facades.

export const dynamic = 'force-dynamic';

import { type CheckoutConfig, useCheckoutEditor } from '@/hooks/useCheckoutEditor';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import { buildPayUrl, isValidCheckoutCode } from '@/lib/subdomains';
import {
  ArrowLeft,
  Check,
  Copy,
  Monitor,
  Plus,
  Smartphone,
  Star,
  Tablet,
  Trash2,
} from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { type CSSProperties, useCallback, useEffect, useRef, useState, useId } from 'react';
import { normalizeCheckoutCode } from './checkout-editor-utils';
import { colors } from '@/lib/design-tokens';

// ════════════════════════════════════════════
// DESIGN TOKENS (imported from Kloel Monitor DNA)
// ════════════════════════════════════════════

const C = {
  void: colors.background.void,
  surface: colors.background.surface,
  elevated: colors.background.elevated,
  border: colors.border.space,
  ember: colors.ember.primary,
  text: colors.text.silver,
  muted: colors.text.muted,
  dim: colors.text.dim,
} as const;

const FONT = "'Sora', sans-serif";
const MONO = "'JetBrains Mono', monospace";
const R = 6;

// ════════════════════════════════════════════
// REUSABLE STYLE HELPERS
// ════════════════════════════════════════════

const sectionStyle: CSSProperties = {
  marginBottom: 24,
  padding: 20,
  backgroundColor: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: R,
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 500,
  color: C.muted,
  fontFamily: FONT,
  letterSpacing: '0.02em',
  textTransform: 'uppercase' as const,
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: FONT,
  color: C.text,
  backgroundColor: C.elevated,
  border: `1px solid ${C.border}`,
  borderRadius: R,
  outline: 'none',
  boxSizing: 'border-box',
};

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 16px 0',
  fontSize: 14,
  fontWeight: 600,
  color: C.text,
  fontFamily: FONT,
};

const toggleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 0',
};

const smallBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 500,
  fontFamily: FONT,
  color: C.text,
  backgroundColor: C.elevated,
  border: `1px solid ${C.border}`,
  borderRadius: R,
  cursor: 'pointer',
};

const removeBtnStyle: CSSProperties = {
  ...smallBtnStyle,
  color: C.ember,
  backgroundColor: 'transparent',
  border: 'none',
  padding: '4px 8px',
};

// ════════════════════════════════════════════
// TOGGLE COMPONENT
// ════════════════════════════════════════════

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div style={toggleRow}>
      <span style={{ fontSize: 13, color: C.text, fontFamily: FONT }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          position: 'relative',
          width: 40,
          height: 22,
          borderRadius: 11,
          border: 'none',
          backgroundColor: checked ? C.ember : C.border,
          cursor: 'pointer',
          transition: 'background-color 150ms ease',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 20 : 2,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: '#fff',
            transition: 'left 150ms ease',
          }}
        />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════
// COLOR PICKER FIELD
// ════════════════════════════════════════════

function ColorField({
  label: lbl,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const colorId = useId();
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={`${colorId}-color`} style={labelStyle}>
        {lbl}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          id={`${colorId}-color`}
          aria-label={`${lbl} (seletor de cor)`}
          type="color"
          value={value || '#000000'} // PULSE_VISUAL_OK: color picker default, universal
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            border: `1px solid ${C.border}`,
            borderRadius: R,
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
        />
        <input
          aria-label={lbl}
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1, fontFamily: MONO, fontSize: 13 }}
          placeholder={kloelT(`#000000`)} // PULSE_VISUAL_OK: color picker placeholder, universal
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// TEXT FIELD
// ════════════════════════════════════════════

function Field({
  label: lbl,
  value,
  onChange,
  placeholder,
  multiline,
  type,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
}) {
  const fieldId = useId();
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={`${fieldId}-field`} style={labelStyle}>
        {lbl}
      </label>
      {multiline ? (
        <textarea
          id={`${fieldId}-field`}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
        />
      ) : (
        <input
          id={`${fieldId}-field`}
          aria-label={lbl}
          type={type || 'text'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
    </div>
  );
}

function LoadingBar({
  width = '100%',
  height = 12,
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: R,
        background:
          'linear-gradient(90deg, rgba(34,34,38,0.92) 0%, rgba(41,41,46,0.98) 50%, rgba(34,34,38,0.92) 100%)',
        ...style,
      }}
    />
  );
}

function CheckoutEditorLoadingOverlay({ showContextCard }: { showContextCard: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: 20,
        background: 'linear-gradient(180deg, rgba(10,10,12,0.96) 0%, rgba(10,10,12,0.985) 100%)',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          marginBottom: 16,
          fontSize: 11,
          fontWeight: 700,
          color: C.ember,
          fontFamily: MONO,
          letterSpacing: '0.08em',
        }}
      >
        {kloelT(`SINCRONIZANDO EDITOR`)}
      </div>

      {showContextCard && (
        <div style={{ ...sectionStyle, marginBottom: 20, backgroundColor: 'rgba(232,93,48,0.05)' }}>
          <LoadingBar width="38%" height={10} style={{ marginBottom: 12 }} />
          <LoadingBar width="64%" height={16} style={{ marginBottom: 10 }} />
          <LoadingBar width="92%" height={10} style={{ marginBottom: 8 }} />
          <LoadingBar width="74%" height={10} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={`checkout-skeleton-${index}`} style={{ ...sectionStyle, marginBottom: 0 }}>
            <LoadingBar width={`${28 + index * 7}%`} height={14} style={{ marginBottom: 16 }} />
            <LoadingBar width="100%" height={36} style={{ marginBottom: 10 }} />
            <LoadingBar width="82%" height={36} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckoutPreviewLoadingOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(180deg, rgba(24,24,27,0.94) 0%, rgba(17,17,19,0.98) 100%)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          padding: 20,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          backgroundColor: C.surface,
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
        }}
      >
        <LoadingBar width="32%" height={10} style={{ marginBottom: 16 }} />
        <LoadingBar width="68%" height={18} style={{ marginBottom: 10 }} />
        <LoadingBar width="88%" height={12} style={{ marginBottom: 24 }} />
        <LoadingBar width="100%" height={240} style={{ marginBottom: 18, borderRadius: 10 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <LoadingBar height={40} />
          <LoadingBar height={40} />
          <LoadingBar height={40} />
          <LoadingBar height={40} />
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// DEVICE WIDTHS
// ════════════════════════════════════════════

const DEVICES = [
  { id: 'desktop', icon: Monitor, width: '100%' },
  { id: 'tablet', icon: Tablet, width: '768px' },
  { id: 'mobile', icon: Smartphone, width: '375px' },
] as const;

type DeviceId = (typeof DEVICES)[number]['id'];
import "../../../../__companions__/page.companion";
