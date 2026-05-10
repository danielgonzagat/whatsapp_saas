'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useToast } from '@/components/kloel/ToastProvider';
import { useOrderBumps } from '@/hooks/useCheckoutPlans';
import { useState, useId } from 'react';

import { GiftIcon, EditIcon, TrashIcon, PlusIcon } from './PlanOrderBumpTab.icons';
import {
  BumpFormPanel,
  type BumpFormData,
  defaultForm,
  cardStyle,
} from './PlanOrderBumpTab.Form';

/* ── Design Tokens ── */

const BG_SURFACE = 'colors.background.surface';
const BORDER = 'colors.border.space';
const TEXT_PRIMARY = 'colors.text.silver';
const TEXT_MUTED = 'colors.text.muted';
const TEXT_DIM = 'colors.text.dim';
const EMBER = 'colors.ember.primary';
const GREEN = colors.semantic.success;
const RED = colors.semantic.error;
const FONT_BODY = "'Sora', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

/** Plan order bump tab. */
export function PlanOrderBumpTab({ planId }: { planId: string }) {
  const fid = useId();
  const { showToast } = useToast();
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
      showToast(editingId ? 'Bump atualizado' : 'Bump criado', 'success');
    } catch {
      showToast('Erro ao salvar bump', 'error');
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
      showToast('Bump removido', 'success');
    } catch {
      showToast('Erro ao remover bump', 'error');
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
            color: colors.text.silver,
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
        <BumpFormPanel
          form={form}
          setForm={setForm}
          editingId={editingId}
          saving={saving}
          onSave={handleSave}
          onCancel={handleCancel}
          fid={fid}
        />
      )}

      {/* Bump List */}
      {isLoading ? (
        <p style={{ fontFamily: FONT_BODY, fontSize: '13px', color: TEXT_MUTED }}>
          {kloelT(`Carregando...`)}
        </p>
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
