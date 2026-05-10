'use client';
import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { type DragEvent as ReactDragEvent, useCallback, useState } from 'react';
import { CRM_ICONS } from './crm-pipeline-icons';
import { type CRMDeal, type CRMStage, fmtBRL, MONO } from './crm-pipeline-utils';
import { DealCardSkeleton } from './CRMPipelineView.parts';
import { DealCard } from './DealCard';
import { DealCreateInlineForm } from './DealCreateInlineForm';

const IC = CRM_ICONS;

interface PipelineStageColumnProps {
  stage: CRMStage;
  deals: CRMDeal[];
  total: number;
  isLoadingDeals: boolean;
  dragDealId: string | null;
  pipelineId: string;
  onDragStart: (e: ReactDragEvent<HTMLDivElement>, dealId: string) => void;
  onDropDeal: (stageId: string) => void;
  onDealClick: (deal: CRMDeal) => void;
  onCreateDeal: (payload: Record<string, unknown>) => Promise<unknown>;
  onDealCreated: () => void;
}

export function PipelineStageColumn({
  stage,
  deals,
  total,
  isLoadingDeals,
  dragDealId,
  pipelineId,
  onDragStart,
  onDropDeal,
  onDealClick,
  onCreateDeal,
  onDealCreated,
}: PipelineStageColumnProps) {
  const sid = stage._id || stage.id || '';
  const [adding, setAdding] = useState(false);

  const handleDragOver = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>) => {
      e.preventDefault();
      onDropDeal(sid);
    },
    [onDropDeal, sid],
  );

  return (
    <div
      key={sid}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        minWidth: 280,
        width: 280,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 8,
        flexShrink: 0,
        maxHeight: '100%',
      }}
    >
      <div
        style={{
          padding: '14px 14px 10px',
          borderBottom: '1px solid var(--app-border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--app-text-primary)',
              textTransform: 'uppercase',
              letterSpacing: '.04em',
            }}
          >
            {stage.name}
          </span>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              background: 'var(--app-bg-secondary)',
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            {deals.length}
          </span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: colors.ember.primary }}>
          {fmtBRL(total)}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {isLoadingDeals ? (
          <>
            <DealCardSkeleton />
            <DealCardSkeleton />
            <DealCardSkeleton />
          </>
        ) : (
          deals.map((deal) => {
            const did = deal._id || deal.id || '';
            return (
              <DealCard
                key={did}
                deal={deal}
                isDragging={dragDealId === did}
                onDragStart={onDragStart}
                onClick={() => onDealClick(deal)}
              />
            );
          })
        )}

        {adding ? (
          <DealCreateInlineForm
            pipelineId={pipelineId}
            stageId={sid}
            onCreateDeal={onCreateDeal}
            onCreated={() => {
              setAdding(false);
              onDealCreated();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: 'transparent',
              border: `1px dashed ${colors.stroke}`,
              borderRadius: 6,
              color: 'var(--app-text-secondary)',
              fontSize: 11,
              fontFamily: "var(--font-sora), 'Sora', sans-serif",
              padding: '8px 0',
              cursor: 'pointer',
              transition: 'border-color 150ms',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = colors.ember.primary;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = colors.background.border;
            }}
          >
            {IC.plus(12)} {kloelT('Novo deal')}
          </button>
        )}
      </div>
    </div>
  );
}
