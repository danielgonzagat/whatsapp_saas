'use client';

import { kloelT } from '@/lib/i18n/t';
import { useOrderBumps } from '@/hooks/useCheckoutPlans';
import { useState, useId } from 'react';

/* ── Inline SVG Icons ── */
const GiftIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d={kloelT(`M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z`)} />
    <path d={kloelT(`M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z`)} />
  </svg>
);

const EditIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={kloelT(`M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7`)} />
    <path d={kloelT(`M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z`)} />
  </svg>
);

const TrashIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d={kloelT(`M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2`)} />
  </svg>
);

const PlusIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/* ── Design Tokens ── */
const _BG_VOID = '#0A0A0C';
const BG_SURFACE = '#111113';
const BG_ELEVATED = '#19191C';
const BORDER = '#222226';
const TEXT_PRIMARY = '#E0DDD8';
const TEXT_MUTED = '#6E6E73';
const TEXT_DIM = '#3A3A3F';
const EMBER = '#E85D30';
const GREEN = '#10B981';
const RED = '#EF4444';
const FONT_BODY = "'Sora', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

/* ── Types ── */
interface BumpFormData {
  productName: string;
  title: string;
  priceInCents: number;
  compareAtPrice: number;
  checkboxLabel: string;
  description: string;
  [key: string]: unknown;
}

const defaultForm: BumpFormData = {
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

const cardStyle: React.CSSProperties = {
  background: BG_SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: '6px',
  padding: '20px',
};

/** Plan order bump tab. */
export function PlanOrderBumpTab({ planId }: { planId: string }) {
  const fid = useId();
  const { bumps, isLoading, createBump, updateBump, deleteBump } = useOrderBumps(planId);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BumpFormData>(defaultForm);
  const [saving, setSaving] = useState(false);

  const formatCents = (cents: number): string => {
    return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await updateBump(editingId, form);
      } else {
        await createBump(form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(defaultForm);
    } catch (e) {
      console.error('Failed to save bump', e);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (bump: { id: string } & Record<string, unknown>) => {
    setForm({
      productName: typeof bump.productName === 'string' ? bump.productName : '',
      title: typeof bump.title === 'string' ? bump.title : '',
      priceInCents: typeof bump.priceInCents === 'number' ? bump.priceInCents : 0,
      compareAtPrice: typeof bump.compareAtPrice === 'number' ? bump.compareAtPrice : 0,
      checkboxLabel: typeof bump.checkboxLabel === 'string' ? bump.checkboxLabel : 'Sim, eu quero!',
      description: typeof bump.description === 'string' ? bump.description : '',
    });
    setEditingId(bump.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBump(id);
    } catch (e) {
      console.error('Failed to delete bump', e);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(defaultForm);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3
          style={{
            fontFamily: FONT_BODY,
            fontSize: '18px',
            fontWeight: 600,
            color: TEXT_PRIMARY,
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          
          {kloelT(`Order Bumps`)}
        </h3>
        <button
          type="button"
          onClick={() => {
            setForm(defaultForm);
            setEditingId(null);
            setShowForm(true);
          }}
          disabled={showForm}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: EMBER,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: FONT_BODY,
            cursor: showForm ? 'not-allowed' : 'pointer',
            opacity: showForm ? 0.5 : 1,
            transition: 'opacity 150ms ease',
          }}
        >
          <PlusIcon />
          
          {kloelT(`Adicionar Bump`)}
        </button>
      </div>

      {/* Description */}
      <p
        style={{
          fontFamily: FONT_BODY,
          fontSize: '13px',
          color: TEXT_MUTED,
          margin: 0,
          lineHeight: '1.5',
        }}
      >
        
        {kloelT(`Oferta adicional antes do botao Finalizar. Max 3 por plano.`)}
      </p>

      {/* Inline Form */}
      {showForm && (
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
              onClick={handleSave}
              disabled={saving}
              style={{
                background: EMBER,
                color: '#FFFFFF',
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
              onClick={handleCancel}
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
      )}

      {/* Bump List */}
      {isLoading ? (
        <p style={{ fontFamily: FONT_BODY, fontSize: '13px', color: TEXT_MUTED }}>{kloelT(`Carregando...`)}</p>
      ) : bumps.length === 0 ? (
        <div
          style={{
            ...cardStyle,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 20px',
          }}
        >
          <div style={{ color: TEXT_DIM, marginBottom: '12px' }}>
            <GiftIcon />
          </div>
          <p
            style={{
              fontFamily: FONT_BODY,
              fontSize: '14px',
              color: TEXT_MUTED,
              margin: 0,
            }}
          >
            
            {kloelT(`Nenhum bump configurado`)}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {bumps.map((bump) => {
            const productName = typeof bump.productName === 'string' ? bump.productName : '';
            const title = typeof bump.title === 'string' ? bump.title : '';
            const priceInCents = typeof bump.priceInCents === 'number' ? bump.priceInCents : 0;
            const compareAtPrice =
              typeof bump.compareAtPrice === 'number' ? bump.compareAtPrice : 0;
            const isActive = bump.active !== false;
            return (
              <div
                key={bump.id}
                style={{
                  background: BG_SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: '6px',
                  borderLeft: `3px solid ${EMBER}`,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                {/* Gift Icon */}
                <div style={{ color: EMBER, flexShrink: 0 }}>
                  <GiftIcon />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT_BODY,
                        fontSize: '14px',
                        fontWeight: 600,
                        color: TEXT_PRIMARY,
                      }}
                    >
                      {productName}
                    </span>
                    {/* Active badge */}
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 600,
                        fontFamily: FONT_BODY,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase' as const,
                        background: isActive ? `${GREEN}15` : `${TEXT_DIM}20`,
                        color: isActive ? GREEN : TEXT_MUTED,
                      }}
                    >
                      {isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: '12px',
                      color: TEXT_MUTED,
                      margin: 0,
                    }}
                  >
                    {title}
                  </p>
                </div>

                {/* Prices */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexShrink: 0 }}>
                  {compareAtPrice > 0 && (
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: '12px',
                        color: TEXT_DIM,
                        textDecoration: 'line-through',
                      }}
                    >
                      {formatCents(compareAtPrice)}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: '14px',
                      fontWeight: 600,
                      color: EMBER,
                    }}
                  >
                    {formatCents(priceInCents)}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleEdit(bump)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: TEXT_MUTED,
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 150ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = TEXT_PRIMARY;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = TEXT_MUTED;
                    }}
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(bump.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: TEXT_MUTED,
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 150ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = RED;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = TEXT_MUTED;
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
