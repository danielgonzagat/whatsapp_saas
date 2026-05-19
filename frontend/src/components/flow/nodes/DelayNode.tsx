'use client';

import { Clock } from 'lucide-react';
import { memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

/** Delay node data shape. */
export interface DelayNodeData {
  /** Label property. */
  label: string;
  /** Delay type property. */
  delayType: 'seconds' | 'minutes' | 'hours' | 'days' | 'until';
  /** Delay value property. */
  delayValue: number;
  /** Until time property. */
  untilTime?: string;
}

function DelayNodeComponent({ data, selected }: NodeProps<DelayNodeData>) {
  const formatDelay = () => {
    if (data.delayType === 'until') {
      return `Até ${data.untilTime || 'horário definido'}`;
    }

    const units: Record<string, string> = {
      seconds: 'segundo(s)',
      minutes: 'minuto(s)',
      hours: 'hora(s)',
      days: 'dia(s)',
    };

    return `${data.delayValue || 0} ${units[data.delayType] || 'segundos'}`;
  };

  return (
    <div
      className={`
      px-4 py-3 rounded-lg border-2 bg-[var(--bg-surface)] shadow-md min-w-[180px] max-w-[240px]
      ${selected ? 'border-[var(--ember-primary)] ring-2 ring-[var(--ember-primary)]/30' : 'border-[var(--bg-border)]'}
    `}
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--ember-primary)] !w-3 !h-3" />

      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-[var(--ember-primary)]/15 rounded-md">
          <Clock className="w-4 h-4 text-[var(--ember-primary)]" aria-hidden="true" />
        </div>
        <span className="font-medium text-sm text-[var(--text-silver)]">{data.label || 'Delay'}</span>
      </div>

      <div className="text-xs text-[var(--text-muted)] text-center py-1">{formatDelay()}</div>

      <Handle type="source" position={Position.Bottom} className="!bg-[var(--ember-primary)] !w-3 !h-3" />
    </div>
  );
}

/** Delay node. */
export const DelayNode = memo(DelayNodeComponent);
