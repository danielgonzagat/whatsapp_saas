import CRMPipelineView from '@/components/kloel/crm/CRMPipelineView';
import { SORA } from './utils';
import type { PipelineStage, PipelineDeal } from './types';

interface PipelineTabProps {
  stages: PipelineStage[];
  isLoading: boolean;
}

export function PipelineTab({ stages, isLoading }: PipelineTabProps) {
  if (isLoading || stages.length === 0) {
    return <CRMPipelineView />;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {stages.map((stage) => {
          const deals: PipelineDeal[] = stage.deals || [];
          const totalValue = deals.reduce((sum: number, d) => sum + (d.value || 0), 0);
          return (
            <div
              key={stage.id}
              style={{
                flex: 1,
                minWidth: 120,
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: '12px 14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: stage.color || 'colors.ember.primary',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--app-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '.05em',
                    fontFamily: SORA,
                  }}
                >
                  {stage.name}
                </span>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains), 'JetBrains Mono', monospace",
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'var(--app-text-primary)',
                  display: 'block',
                }}
              >
                {deals.length}
              </span>
              <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
                {totalValue > 0
                  ? 'R$ ' + totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                  : 'R$ 0,00'}
              </span>
            </div>
          );
        })}
      </div>
      <CRMPipelineView />
    </div>
  );
}
