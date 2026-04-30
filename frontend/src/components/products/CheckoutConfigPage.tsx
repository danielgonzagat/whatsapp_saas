'use client';
import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { Save } from 'lucide-react';
import { type CSSProperties, useCallback, useEffect, useState, useId } from 'react';
import { mutate } from 'swr';
import { colors } from '@/lib/design-tokens';

interface CheckoutConfigState {
  checkoutName: string;
  enableBoleto: boolean;
  enableCreditCard: boolean;
  enablePix: boolean;
  chatEnabled: boolean;
  chatWelcomeMessage: string;
  chatDelay: number;
  chatPosition: string;
  chatColor: string;
  chatOfferDiscount: boolean;
  chatDiscountCode: string;
  chatSupportPhone: string;
  enableCoupon: boolean;
  enableTimer: boolean;
  timerMinutes: number;
  timerMessage: string;
  socialProofEnabled: boolean;
  socialProofCustomNames: string;
  enableSteps: boolean;
  [key: string]: unknown;
}

interface CheckoutConfigInput extends Partial<CheckoutConfigState> {
  id?: string;
}

interface Props {
  planId: string;
  config: CheckoutConfigInput | null | undefined;
  onSave: (data: CheckoutConfigState) => void;
}

/* ── Design Tokens ── */

const VOID = 'var(--bg-void, colors.background.void)';
const SURFACE = 'var(--bg-space, colors.background.surface)';
const ELEVATED = 'var(--bg-nebula, colors.background.elevated)';
const BORDER = 'var(--border-space, colors.border.space)';
const TEXT = 'var(--text-starlight, colors.text.silver)';
const SECONDARY = 'var(--text-moonlight, colors.text.muted)';
const FAINT = 'var(--text-dust, colors.text.dim)';
const TEXT_ON_ACCENT = 'var(--app-text-on-accent, #FFFFFF)';
const EMBER = 'colors.ember.primary';
const GREEN = '#10B981';

/* ── Shared Styles ── */

const sectionTitleStyle: CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: 14,
  fontWeight: 600,
  color: TEXT,
  marginBottom: 16,
  marginTop: 0,
};

const labelStyle: CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: 10,
  fontWeight: 600,
  color: SECONDARY,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
};

const inputStyle: CSSProperties = {
  backgroundColor: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: '10px 14px',
  color: TEXT,
  fontSize: 13,
  fontFamily: "'Sora', sans-serif",
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 80,
  resize: 'vertical',
  lineHeight: 1.5,
};

const dividerStyle: CSSProperties = {
  height: 1,
  backgroundColor: BORDER,
  border: 'none',
  margin: '28px 0',
};

/* ── Toggle Component ── */

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        backgroundColor: checked ? GREEN : BORDER,
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        padding: 0,
        flexShrink: 0,
        transition: 'background-color 0.2s ease',
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: TEXT_ON_ACCENT,
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          transition: 'left 0.2s ease',
        }}
      />
    </button>
  );
}

/* ── Checkbox Component ── */

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        fontFamily: "'Sora', sans-serif",
        fontSize: 13,
        color: TEXT,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChange(!checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `1px solid ${checked ? EMBER : BORDER}`,
          backgroundColor: checked ? EMBER : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
        }}
        aria-hidden="true"
      >
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={TEXT_ON_ACCENT}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      {label}
    </label>
  );
}

/* ── Radio Component ── */

function Radio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        fontFamily: "'Sora', sans-serif",
        fontSize: 13,
        color: TEXT,
      }}
    >
      <input
        type="radio"
        checked={checked}
        onChange={() => onChange()}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `2px solid ${checked ? EMBER : BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {checked && (
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: EMBER,
            }}
          />
        )}
      </div>
      {label}
    </label>
  );
}

/* ── Toggle Row ── */

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontFamily: "'Sora', sans-serif", fontSize: 13, color: TEXT }}>{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

/* ── Pixels Section ── */

const PIXEL_TYPES = ['META', 'GOOGLE_ADS', 'TIKTOK', 'TABOOLA', 'OUTBRAIN', 'CUSTOM'] as const;

interface Pixel {
  id: string;
  type: string;
  pixelId: string;
  accessToken?: string;
}

interface PixelFormState {
  type: string;
  pixelId: string;
  accessToken: string;
}

function PixelRow({
  pixel,
  isEditing,
  editForm,
  saving,
  onEditFormChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
}: {
  pixel: Pixel;
  isEditing: boolean;
  editForm: PixelFormState;
  saving: boolean;
  onEditFormChange: (patch: Partial<PixelFormState>) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: '10px 14px',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {isEditing ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select
            value={editForm.type}
            onChange={(e) => onEditFormChange({ type: e.target.value })}
            style={{ ...inputStyle, padding: '6px 10px' }}
          >
            {PIXEL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            aria-label={kloelT(`ID do pixel`)}
            value={editForm.pixelId}
            onChange={(e) => onEditFormChange({ pixelId: e.target.value })}
            placeholder={kloelT(`ID do pixel`)}
            style={inputStyle}
          />
          <input
            aria-label={kloelT(`Access Token`)}
            value={editForm.accessToken || ''}
            onChange={(e) => onEditFormChange({ accessToken: e.target.value })}
            placeholder={kloelT(`Access Token (opcional)`)}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={saving}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: EMBER,
                border: 'none',
                borderRadius: 6,
                color: TEXT_ON_ACCENT,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Sora', sans-serif",
              }}
            >
              {saving ? kloelT(`Salvando...`) : kloelT(`Salvar`)}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'none',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                color: SECONDARY,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: "'Sora', sans-serif",
              }}
            >
              {kloelT(`Cancelar`)}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ flex: 1 }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                fontWeight: 600,
                color: EMBER,
                background: `${EMBER}12`,
                padding: '2px 6px',
                borderRadius: 4,
                textTransform: 'uppercase',
                marginRight: 8,
              }}
            >
              {pixel.type}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: TEXT }}>
              {pixel.pixelId}
            </span>
            {pixel.accessToken && (
              <span style={{ fontSize: 10, color: SECONDARY, marginLeft: 8 }}>
                {kloelT(`Token: ****`)}
                {pixel.accessToken.slice(-4)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onStartEdit}
            style={{
              background: 'none',
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              color: SECONDARY,
              fontSize: 11,
              padding: '4px 10px',
              cursor: 'pointer',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {kloelT(`Editar`)}
          </button>
          <button
            type="button"
            onClick={onDelete}
            style={{
              background: 'none',
              border: 'none',
              color: FAINT,
              fontSize: 11,
              padding: 4,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Remover`)}
          </button>
        </>
      )}
    </div>
  );
}

function PixelAddPanel({
  fid,
  form,
  saving,
  error,
  onFormChange,
  onCreate,
  onCancel,
}: {
  fid: string;
  form: PixelFormState;
  saving: boolean;
  error: string;
  onFormChange: (patch: Partial<PixelFormState>) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: 16,
        marginTop: 8,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={labelStyle} htmlFor={`${fid}-pixel-type`}>
            {kloelT(`Tipo de pixel`)}
          </label>
          <select
            value={form.type}
            onChange={(e) => onFormChange({ type: e.target.value })}
            style={{ ...inputStyle, padding: '10px 14px' }}
            id={`${fid}-pixel-type`}
          >
            {PIXEL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor={`${fid}-pixel-id`}>
            {kloelT(`ID do Pixel`)}
          </label>
          <input
            aria-label={kloelT(`ID do Pixel`)}
            value={form.pixelId}
            onChange={(e) => onFormChange({ pixelId: e.target.value })}
            placeholder={kloelT(`Ex: 1234567890`)}
            style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
            id={`${fid}-pixel-id`}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor={`${fid}-access-token`}>
            {kloelT(`Access Token (opcional — Meta)`)}
          </label>
          <input
            aria-label={kloelT(`Access Token Meta`)}
            value={form.accessToken}
            onChange={(e) => onFormChange({ accessToken: e.target.value })}
            placeholder={kloelT(`EAAG...`)}
            style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
            id={`${fid}-access-token`}
          />
        </div>
        {error ? (
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 12,
              color: '#EF4444',
              margin: 0,
            }}
          >
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onCreate}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: saving ? ELEVATED : EMBER,
              border: 'none',
              borderRadius: 6,
              color: saving ? SECONDARY : TEXT_ON_ACCENT,
              fontSize: 12,
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {saving ? kloelT(`Adicionando...`) : kloelT(`Adicionar pixel`)}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px 16px',
              background: 'none',
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              color: SECONDARY,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {kloelT(`Cancelar`)}
          </button>
        </div>
      </div>
    </div>
  );
}
