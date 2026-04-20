'use client';

import { Trash2, X } from 'lucide-react';
import { DIVIDER, EMBER, F, MUTED, SURFACE, TEXT } from './conversations-utils';

interface SelectionToolbarProps {
  count: number;
  onDelete: () => void;
  onCancel: () => void;
}

/** Selection toolbar. */
export function SelectionToolbar({ count, onDelete, onCancel }: SelectionToolbarProps) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 24,
        alignSelf: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 6,
        border: `1px solid ${DIVIDER}`,
        background: 'color-mix(in srgb, var(--app-bg-card) 96%, transparent)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <span
        style={{
          color: TEXT,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {count} selecionada{count > 1 ? 's' : ''}
      </span>
      <button
        type="button"
        onClick={onDelete}
        style={{
          height: 34,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          borderRadius: 6,
          border: `1px solid rgba(232,93,48,0.18)`,
          background: 'rgba(232,93,48,0.08)',
          color: EMBER,
          padding: '0 12px',
          fontFamily: F,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <Trash2 size={14} aria-hidden="true" />
        Excluir
      </button>
      <button
        type="button"
        onClick={onCancel}
        title="Cancelar seleção"
        style={{
          width: 34,
          height: 34,
          borderRadius: 6,
          border: `1px solid ${DIVIDER}`,
          background: SURFACE,
          color: MUTED,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
