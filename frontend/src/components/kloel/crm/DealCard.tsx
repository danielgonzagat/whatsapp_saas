'use client';
import { colors } from '@/lib/design-tokens';

import { type DragEvent as ReactDragEvent } from 'react';
import { type CRMDeal, fmtBRL, MONO } from './crm-pipeline-utils';

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  high: { label: 'Alta', color: colors.semantic.error },
  medium: { label: 'Média', color: colors.semantic.warning },
  low: { label: 'Baixa', color: 'var(--app-text-secondary)' },
};

interface DealCardProps {
  deal: CRMDeal;
  isDragging: boolean;
  onDragStart: (e: ReactDragEvent<HTMLDivElement>, dealId: string) => void;
  onClick: () => void;
}

export function DealCard({ deal, isDragging, onDragStart, onClick }: DealCardProps) {
  const did = deal._id || deal.id || '';
  const pr = PRIORITY_CFG[deal.priority || ''] || PRIORITY_CFG.medium;

  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(e) => onDragStart(e, did)}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        background: 'var(--app-bg-secondary)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: '10px 12px',
        cursor: 'grab',
        transition: 'border-color 150ms',
        opacity: isDragging ? 0.5 : 1,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          marginBottom: 6,
          lineHeight: 1.3,
        }}
      >
        {deal.title}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: colors.ember.primary,
            fontWeight: 600,
          }}
        >
          {fmtBRL(deal.value || 0)}
        </span>
        {deal.priority && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9,
              fontWeight: 700,
              color: pr.color,
              background: `${pr.color}14`,
              padding: '2px 6px',
              borderRadius: 3,
              textTransform: 'uppercase',
              letterSpacing: '.04em',
            }}
          >
            {pr.label}
          </span>
        )}
      </div>
      {(deal.contact?.name || deal.contactName) && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--app-text-secondary)',
            marginTop: 6,
          }}
        >
          {deal.contact?.name || deal.contactName}
        </div>
      )}
    </div>
  );
}
