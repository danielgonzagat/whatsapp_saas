'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Clock } from 'lucide-react';

export interface DelayNodeData {
  label: string;
  delayType: 'seconds' | 'minutes' | 'hours' | 'days' | 'until';
  delayValue: number;
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
      px-4 py-3 rounded-lg border-2 bg-[#111113] shadow-md min-w-[180px] max-w-[240px]
      ${selected ? 'border-[#E85D30] ring-2 ring-[#E85D30]/30' : 'border-[#222226]'}
    `}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#E85D30] !w-3 !h-3" />

      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-[#E85D30]/15 rounded-md">
          <Clock className="w-4 h-4 text-[#E85D30]" />
        </div>
        <span className="font-medium text-sm text-[#E0DDD8]">{data.label || 'Delay'}</span>
      </div>

      <div className="text-xs text-[#6E6E73] text-center py-1">{formatDelay()}</div>

      <Handle type="source" position={Position.Bottom} className="!bg-[#E85D30] !w-3 !h-3" />
    </div>
  );
}

export const DelayNode = memo(DelayNodeComponent);
