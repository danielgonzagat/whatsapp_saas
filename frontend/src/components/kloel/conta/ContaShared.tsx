'use client';

import { kloelT } from '@/lib/i18n/t';
import React, { useId } from 'react';
import Icons from './ContaIcons';
import { SORA, MONO, EMBER } from './ContaConstants';

const STATUS_CONFIG = {
  pending: { label: 'Pendente', color: '#F59E0B', bg: 'rgba(245,158,11,.06)', icon: Icons.clock },
  submitted: { label: 'Em analise', color: '#3B82F6', bg: 'rgba(59,130,246,.06)', icon: Icons.eye },
  approved: { label: 'Aprovado', color: '#10B981', bg: 'rgba(16,185,129,.06)', icon: Icons.check },
  rejected: { label: 'Reprovado', color: '#EF4444', bg: 'rgba(239,68,68,.06)', icon: Icons.alert },
};

export function StatusBadge({ status }: { status: string }) {
  const st = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        background: st.bg,
        borderRadius: 4,
      }}
    >
      <span style={{ color: st.color }}>{st.icon(10)}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: st.color, fontFamily: SORA }}>
        {st.label}
      </span>
    </div>
  );
}

export function Field({
  label,
  placeholder,
  value,
  onChange,
  onBlur: onBlurProp,
  type = 'text',
  mono = false,
  half = false,
  required = true,
  disabled = false,
  rows,
  suffix,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: string;
  mono?: boolean;
  half?: boolean;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  suffix?: React.ReactNode;
}) {
  const baseStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    background: disabled ? 'var(--app-bg-primary)' : 'var(--app-bg-input)',
    border: '1px solid var(--app-border-primary)',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: mono ? MONO : SORA,
    color: disabled ? 'var(--app-text-placeholder)' : 'var(--app-text-primary)',
    boxSizing: 'border-box' as const,
    transition: 'border-color .15s',
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'text',
    resize: 'none' as const,
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!disabled) {
      e.currentTarget.style.borderColor = EMBER;
      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(232,93,48,.06)';
    }
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = 'var(--app-border-primary)';
    e.currentTarget.style.boxShadow = 'none';
    onBlurProp?.();
  };

  const fieldId = useId();

  return (
    <div style={{ flex: half ? 1 : 'none', width: half ? 'auto' : '100%' }}>
      <label
        htmlFor={`${fieldId}-input`}
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--app-text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 6,
          fontFamily: SORA,
        }}
      >
        {label} {required && <span style={{ color: EMBER, fontSize: 8 }}>*</span>}
      </label>
      <div style={{ position: 'relative' as const }}>
        {rows ? (
          <textarea
            id={`${fieldId}-input`}
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            style={baseStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        ) : (
          <input
            id={`${fieldId}-input`}
            aria-label={label}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            style={baseStyle}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        )}
        {suffix && (
          <span
            style={{
              position: 'absolute' as const,
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function SaveButton({
  saving,
  onClick,
  label = 'Salvar alteracoes',
}: {
  saving: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      style={{
        padding: '11px 28px',
        background: saving ? 'var(--app-text-placeholder)' : EMBER,
        border: 'none',
        borderRadius: 6,
        color: 'var(--app-text-on-accent)',
        fontSize: 13,
        fontWeight: 600,
        cursor: saving ? 'not-allowed' : 'pointer',
        fontFamily: SORA,
        transition: 'all 150ms ease',
        opacity: saving ? 0.7 : 1,
      }}
    >
      {saving ? 'Salvando...' : label}
    </button>
  );
}

export function SaveStatusLabel({ status }: { status: 'idle' | 'success' | 'error' }) {
  if (status === 'success') {
    return (
      <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', fontFamily: SORA }}>
        {kloelT(`Salvo!`)}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', fontFamily: SORA }}>
        {kloelT(`Erro ao salvar`)}
      </span>
    );
  }
  return null;
}

export function ErrorText({ message }: { message: string | null | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <span
      style={{
        fontSize: 11,
        color: '#EF4444',
        marginTop: 8,
        display: 'block',
        fontFamily: SORA,
      }}
    >
      {message}
    </span>
  );
}

export function SaveActions({
  error,
  saveStatus,
  saving,
  onSave,
}: {
  error: string | null | undefined;
  saveStatus: 'idle' | 'success' | 'error';
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <>
      <ErrorText message={error} />
      <div
        style={{
          marginTop: 20,
          display: 'flex',
          justifyContent: 'flex-end' as const,
          alignItems: 'center',
          gap: 12,
        }}
      >
        <SaveStatusLabel status={saveStatus} />
        <SaveButton saving={saving} onClick={onSave} />
      </div>
    </>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: 24,
        marginBottom: 16,
      }}
    >
      <h2
        style={{
          fontSize: 15,
          fontWeight: 600,
          margin: 0,
          color: 'var(--app-text-primary)',
          fontFamily: SORA,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            margin: '4px 0 0',
            fontFamily: SORA,
          }}
        >
          {subtitle}
        </p>
      )}
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={EMBER}
      strokeWidth={2.5}
      style={{ animation: 'spin 1s linear infinite' }}
      aria-hidden="true"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d={kloelT(`M12 2a10 10 0 0 1 10 10`)} strokeLinecap="round" />
    </svg>
  );
}
