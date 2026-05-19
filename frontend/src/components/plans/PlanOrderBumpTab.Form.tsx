import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';

/* ── Design Tokens ── */

const BG_SURFACE = 'colors.background.surface';
const BG_ELEVATED = 'colors.background.elevated';
const BORDER = 'colors.border.space';
const TEXT_PRIMARY = 'colors.text.silver';
const TEXT_MUTED = 'colors.text.muted';
const TEXT_DIM = 'colors.text.dim';
const EMBER = 'colors.ember.primary';
const FONT_BODY = "'Sora', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

/* ── Types ── */
export interface BumpFormData {
  productName: string;
  title: string;
  priceInCents: number;
  compareAtPrice: number;
  checkboxLabel: string;
  description: string;
  [key: string]: unknown;
}

export const defaultForm: BumpFormData = {
  productName: '',
  title: '',
  priceInCents: 0,
  compareAtPrice: 0,
  checkboxLabel: 'Sim, eu quero!',
  description: '',
};

/* ── Styles ── */
const labelStyle: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: '11px',
  fontWeight: 600,
  color: TEXT_DIM,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: '6px',
  display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: BG_ELEVATED,
  border: `1px solid ${BORDER}`,
  color: TEXT_PRIMARY,
  borderRadius: '6px',
  padding: '10px 14px',
  fontSize: '14px',
  fontFamily: FONT_BODY,
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '80px',
  resize: 'vertical' as const,
};

export const cardStyle: React.CSSProperties = {
  background: BG_SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '6px',
  padding: '20px',
};

/* ── BumpFormPanel Component ── */
interface BumpFormPanelProps {
  form: BumpFormData;
  setForm: React.Dispatch<React.SetStateAction<BumpFormData>>;
  editingId: string | null;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  fid: string;
}

export function BumpFormPanel({
  form,
  setForm,
  editingId,
  saving,
  onSave,
  onCancel,
  fid,
}: BumpFormPanelProps) {
  return (
    <div
      style={{
        ...cardStyle,
        borderColor: `${EMBER}40`,
      }}
    >
      <h4
        style={{
          fontFamily: FONT_BODY,
          fontSize: '14px',
          fontWeight: 600,
          color: TEXT_PRIMARY,
          margin: '0 0 20px 0',
        }}
      >
        {editingId ? 'Editar Bump' : 'Novo Bump'}
      </h4>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* productName */}
        <div>
          <label style={labelStyle} htmlFor={`${fid}-product-name`}>
            {kloelT(`Product Name`)}
          </label>
          <input
            aria-label="Nome do produto"
            type="text"
            value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })}
            placeholder={kloelT(`Nome do produto`)}
            style={inputStyle}
            id={`${fid}-product-name`}
          />
        </div>

        {/* title */}
        <div>
          <label style={labelStyle} htmlFor={`${fid}-title`}>
            {kloelT(`Title`)}
          </label>
          <input
            aria-label="Titulo da oferta"
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={kloelT(`Titulo da oferta`)}
            style={inputStyle}
            id={`${fid}-title`}
          />
        </div>

        {/* priceInCents */}
        <div>
          <label style={labelStyle} htmlFor={`${fid}-price`}>
            {kloelT(`Preco (centavos)`)}
          </label>
          <input
            aria-label="Preco em centavos"
            type="number"
            value={form.priceInCents}
            onChange={(e) => setForm({ ...form, priceInCents: Number(e.target.value) })}
            placeholder={kloelT(`Ex: 4990`)}
            style={{ ...inputStyle, fontFamily: FONT_MONO }}
            id={`${fid}-price`}
          />
        </div>

        {/* compareAtPrice */}
        <div>
          <label style={labelStyle} htmlFor={`${fid}-compare-price`}>
            {kloelT(`Preco comparativo (centavos)`)}
          </label>
          <input
            aria-label="Preco comparativo em centavos"
            type="number"
            value={form.compareAtPrice}
            onChange={(e) => setForm({ ...form, compareAtPrice: Number(e.target.value) })}
            placeholder={kloelT(`Ex: 9990`)}
            style={{ ...inputStyle, fontFamily: FONT_MONO }}
            id={`${fid}-compare-price`}
          />
        </div>

        {/* checkboxLabel */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle} htmlFor={`${fid}-checkbox-label`}>
            {kloelT(`Checkbox Label`)}
          </label>
          <input
            aria-label="Texto do checkbox"
            type="text"
            value={form.checkboxLabel}
            onChange={(e) => setForm({ ...form, checkboxLabel: e.target.value })}
            style={inputStyle}
            id={`${fid}-checkbox-label`}
          />
        </div>

        {/* description */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle} htmlFor={`${fid}-desc`}>
            {kloelT(`Descricao`)}
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={kloelT(`Descreva o bump...`)}
            style={textareaStyle}
            id={`${fid}-desc`}
          />
        </div>
      </div>

      {/* Form Actions */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            background: EMBER,
            color: colors.text.silver,
            border: 'none',
            borderRadius: '6px',
            padding: '10px 24px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: FONT_BODY,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            transition: 'opacity 150ms ease',
          }}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            color: TEXT_MUTED,
            border: `1px solid ${BORDER}`,
            borderRadius: '6px',
            padding: '10px 24px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: FONT_BODY,
            cursor: 'pointer',
            transition: 'color 150ms ease',
          }}
        >
          {kloelT(`Cancelar`)}
        </button>
      </div>
    </div>
  );
}
