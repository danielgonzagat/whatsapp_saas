'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { NP, EMBER, MONO } from './AnunciosShared';
import { RuleEditorForm } from './RuleEditorForm';
import type { AdRule } from './anuncios-types';

export function RuleNerveFiber({
  rule,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  editCondition,
  editAction,
  onEditConditionChange,
  onEditActionChange,
  onToggle,
  onDelete,
}: {
  rule: AdRule;
  editingId: string | null;
  onStartEdit: (r: AdRule) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  editCondition: string;
  editAction: string;
  onEditConditionChange: (v: string) => void;
  onEditActionChange: (v: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isEditing = editingId === rule.id;

  return (
    <div
      style={{
        background: 'var(--app-bg-secondary)',
        borderRadius: 6,
        borderLeft: `3px solid ${rule.active ? EMBER : colors.text.dim}`,
        opacity: rule.active ? 1 : 0.5,
        transition: 'opacity 150ms ease',
        overflow: 'hidden' as const,
      }}
    >
      {isEditing ? (
        <RuleEditorForm
          condition={editCondition}
          action={editAction}
          onConditionChange={onEditConditionChange}
          onActionChange={onEditActionChange}
          onSave={() => onSaveEdit(rule.id)}
          onCancel={onCancelEdit}
          saveLabel={kloelT(`Salvar`)}
          idPrefix={`edit-${rule.id}`}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontFamily: MONO, color: 'var(--app-text-primary)', marginBottom: 2 }}>
              IF {rule.condition}
            </div>
            <div style={{ fontSize: 11, fontFamily: MONO, color: EMBER }}>
              {kloelT(`&rarr;`)} {rule.action}
            </div>
          </div>
          <NP color={rule.active ? EMBER : colors.text.dim} intensity={rule.active ? 1.2 : 0.3} width={80} height={20} />
          <span style={{ fontSize: 16, fontFamily: MONO, fontWeight: 700, color: 'var(--app-text-primary)', minWidth: 36, textAlign: 'right' as const }}>
            {rule.fires}
          </span>
          <button
            type="button"
            onClick={() => onStartEdit(rule)}
            style={{ background: 'none', border: 'none', color: 'var(--app-text-secondary)', cursor: 'pointer', padding: 4, display: 'flex' }}
            title={kloelT(`Editar regra`)}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d={kloelT(`M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1`)} />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onToggle(rule.id)}
            style={{ width: 36, height: 20, borderRadius: 8, border: 'none', background: rule.active ? EMBER : colors.text.dim, cursor: 'pointer', position: 'relative' as const, transition: 'background 150ms ease', flexShrink: 0 }}
          >
            <span style={{ position: 'absolute' as const, top: 3, left: rule.active ? 19 : 3, width: 14, height: 14, borderRadius: '16%', background: colors.text.silver, transition: 'left 150ms ease' } as React.CSSProperties} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(rule.id)}
            style={{ background: 'none', border: 'none', color: 'var(--app-text-secondary)', cursor: 'pointer', padding: 4, fontSize: 14, fontFamily: MONO, transition: 'color 150ms ease' }}
            title={kloelT(`Remover regra`)}
          >
            {kloelT(`&times;`)}
          </button>
        </div>
      )}
    </div>
  );
}
