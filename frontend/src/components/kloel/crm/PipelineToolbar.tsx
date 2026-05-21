'use client';

import { kloelT } from '@/lib/i18n/t';
import { CRM_ICONS } from './crm-pipeline-icons';
import { type CRMPipeline, SORA } from './crm-pipeline-utils';
import { LoadingStrip } from './CRMPipelineView.parts';

const IC = CRM_ICONS;

interface PipelineToolbarProps {
  pipelines: CRMPipeline[];
  selectedPipelineId: string;
  stageCount: number;
  dealCount: number;
  isLoading: boolean;
  onSelectPipeline: (id: string) => void;
}

export function PipelineToolbar({
  pipelines,
  selectedPipelineId,
  stageCount,
  dealCount,
  isLoading,
  onSelectPipeline,
}: PipelineToolbarProps) {
  if (isLoading) {
    return (
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', flexShrink: 0 }}
      >
        <LoadingStrip width={170} height={34} />
        <LoadingStrip width={120} height={12} />
      </div>
    );
  }

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', flexShrink: 0 }}
    >
      <div style={{ position: 'relative' }}>
        <select
          value={selectedPipelineId}
          onChange={(e) => onSelectPipeline(e.target.value)}
          style={{
            appearance: 'none',
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 32px 8px 12px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {pipelines.map((p) => (
            <option key={p._id || p.id} value={p._id || p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--app-text-secondary)',
            pointerEvents: 'none',
          }}
        >
          {IC.chevron(14)}
        </span>
      </div>
      <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>
        {stageCount} {kloelT('etapas \u00b7')} {dealCount} deal
        {dealCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
