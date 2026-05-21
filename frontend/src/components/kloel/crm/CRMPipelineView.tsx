'use client';

import { kloelT } from '@/lib/i18n/t';
import { useCRMMutations, useDeals, usePipelines } from '@/hooks/useCRM';
import { type DragEvent as ReactDragEvent, useCallback, useState } from 'react';
import { SORA } from './crm-pipeline-utils';
import { type CRMDeal, type CRMPipeline } from './crm-pipeline-utils';
import { PipelineColumnSkeleton } from './CRMPipelineView.parts';
import { NoPipelinesEmptyState } from './NoPipelinesEmptyState';
import { PipelineToolbar } from './PipelineToolbar';
import { PipelineStageColumn } from './PipelineStageColumn';
import { DealDetailModal } from './DealDetailModal';

export default function CRMPipelineView() {
  const { pipelines, isLoading: plLoading } = usePipelines();
  const { createDeal, moveDeal } = useCRMMutations();

  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [detailDeal, setDetailDeal] = useState<CRMDeal | null>(null);
  const [dragDealId, setDragDealId] = useState<string | null>(null);

  const pipeArr: CRMPipeline[] = Array.isArray(pipelines) ? (pipelines as CRMPipeline[]) : [];
  const pipeId = selectedPipeline || pipeArr[0]?._id || pipeArr[0]?.id || '';

  const {
    deals,
    isLoading: dlLoading,
    mutate: mutateDeals,
  } = useDeals(pipeId ? { pipeline: pipeId } : undefined);
  const dealArr: CRMDeal[] = Array.isArray(deals) ? (deals as CRMDeal[]) : [];

  const currentPipeline = pipeArr.find((p) => (p._id || p.id) === pipeId);
  const stages = currentPipeline?.stages || [];
  const showPipelineLoading = plLoading;
  const showDealLoading = dlLoading && !dealArr.length;

  const onDragStart = useCallback((e: ReactDragEvent<HTMLDivElement>, dealId: string) => {
    setDragDealId(dealId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDropDeal = useCallback(
    async (stageId: string) => {
      const currentDragId = dragDealId;
      if (!currentDragId) {
        return;
      }
      try {
        await moveDeal(currentDragId, stageId);
        await mutateDeals();
      } catch {
        /* silent */
      }
      setDragDealId(null);
    },
    [dragDealId, moveDeal, mutateDeals],
  );

  function dealsForStage(stageId: string) {
    return dealArr.filter((d) => {
      const s = d.stage;
      if (typeof s === 'string') {
        return s === stageId;
      }
      return (s?._id || s?.id) === stageId;
    });
  }

  function stageTotal(stageId: string) {
    return dealsForStage(stageId).reduce((sum: number, d: CRMDeal) => sum + (d.value || 0), 0);
  }

  if (!showPipelineLoading && !pipeArr.length) {
    return <NoPipelinesEmptyState />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: SORA }}>
      <PipelineToolbar
        pipelines={pipeArr}
        selectedPipelineId={pipeId}
        stageCount={stages.length}
        dealCount={dealArr.length}
        isLoading={showPipelineLoading}
        onSelectPipeline={setSelectedPipeline}
      />

      <div
        style={{
          display: 'flex',
          gap: 12,
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 8,
        }}
      >
        {showPipelineLoading ? (
          <>
            <PipelineColumnSkeleton />
            <PipelineColumnSkeleton />
            <PipelineColumnSkeleton />
          </>
        ) : stages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              color: 'var(--app-text-secondary)',
              fontSize: 13,
            }}
          >
            {kloelT('Este pipeline nao possui etapas.')}
          </div>
        ) : (
          stages.map((stage) => {
            const sid = stage._id || stage.id || '';
            return (
              <PipelineStageColumn
                key={sid}
                stage={stage}
                deals={dealsForStage(sid)}
                total={stageTotal(sid)}
                isLoadingDeals={showDealLoading}
                dragDealId={dragDealId}
                pipelineId={pipeId}
                onDragStart={onDragStart}
                onDropDeal={handleDropDeal}
                onDealClick={setDetailDeal}
                onCreateDeal={createDeal}
                onDealCreated={mutateDeals}
              />
            );
          })
        )}
      </div>

      {detailDeal && (
        <DealDetailModal
          deal={detailDeal}
          stages={stages}
          onClose={() => setDetailDeal(null)}
        />
      )}
    </div>
  );
}
