'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';

const EMBER = 'colors.ember.primary';
const BORDER = 'var(--border-space, colors.border.space)';
const TEXT = 'var(--text-starlight, colors.text.silver)';
const TEXT_ON_ACCENT = 'var(--app-text-on-accent)';
const SECONDARY = 'var(--text-moonlight, colors.text.muted)';
const FAINT = 'var(--text-dust, colors.text.dim)';
const SURFACE = 'var(--bg-space, colors.background.surface)';
const ELEVATED = 'var(--bg-nebula, colors.background.elevated)';

export const PIXEL_TYPES = ['META', 'GOOGLE_ADS', 'TIKTOK', 'TABOOLA', 'OUTBRAIN', 'CUSTOM'] as const;

export interface Pixel {
  id: string;
  type: string;
  pixelId: string;
  accessToken?: string;
}

export interface PixelFormState {
  type: string;
  pixelId: string;
  accessToken: string;
}

const labelStyle = {
  fontFamily: "'Sora', sans-serif",
  fontSize: 10,
  fontWeight: 600,
  color: SECONDARY,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: 6,
  display: 'block',
} as const;

const inputStyle = {
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
} as const;

export function PixelRow({
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

export function PixelAddPanel({
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
              color: colors.semantic.error,
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
