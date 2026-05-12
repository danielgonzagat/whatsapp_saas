'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { EMBER, SORA, MONO } from './AnunciosShared';

interface RuleEditorFormProps {
  condition: string;
  action: string;
  onConditionChange: (v: string) => void;
  onActionChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
  idPrefix: string;
}

export function RuleEditorForm({
  condition,
  action,
  onConditionChange,
  onActionChange,
  onSave,
  onCancel,
  saveLabel,
  idPrefix,
}: RuleEditorFormProps) {
  return (
    <div style={{ padding: '12px 12px', display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
      <div>
        <label
          style={{ fontSize: 9, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, display: 'block', marginBottom: 4 }}
          htmlFor={`${idPrefix}-cond`}
        >
          {kloelT(`CONDICAO (IF)`)}
        </label>
        <input
          aria-label="Condicao da regra (IF)"
          type="text"
          value={condition}
          onChange={(e) => onConditionChange(e.target.value)}
          style={{ width: '100%', padding: '7px 10px', background: 'var(--app-bg-card)', border: '1px solid colors.text.dim', borderRadius: 6, color: 'var(--app-text-primary)', fontSize: 12, fontFamily: MONO, outline: 'none', boxSizing: 'border-box' as const }}
          id={`${idPrefix}-cond`}
        />
      </div>
      <div>
        <label
          style={{ fontSize: 9, fontFamily: MONO, color: 'var(--app-text-secondary)', letterSpacing: 1, display: 'block', marginBottom: 4 }}
          htmlFor={`${idPrefix}-act`}
        >
          {kloelT(`ACAO (THEN)`)}
        </label>
        <input
          aria-label="Acao da regra (THEN)"
          type="text"
          value={action}
          onChange={(e) => onActionChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') {onSave();} if (e.key === 'Escape') {onCancel();} }}
          style={{ width: '100%', padding: '7px 10px', background: 'var(--app-bg-card)', border: '1px solid colors.text.dim', borderRadius: 6, color: 'var(--app-text-primary)', fontSize: 12, fontFamily: MONO, outline: 'none', boxSizing: 'border-box' as const }}
          id={`${idPrefix}-act`}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: 'none', border: '1px solid colors.text.dim', borderRadius: 6, padding: '6px 12px', color: 'var(--app-text-secondary)', fontSize: 11, fontFamily: SORA, cursor: 'pointer' }}
        >
          {kloelT(`Cancelar`)}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!condition.trim() || !action.trim()}
          style={{ background: EMBER, border: 'none', borderRadius: 6, padding: '6px 14px', color: colors.text.silver, fontSize: 11, fontFamily: SORA, fontWeight: 600, cursor: 'pointer', opacity: condition.trim() && action.trim() ? 1 : 0.5 }}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
