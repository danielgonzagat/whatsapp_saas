'use client';

import { Hourglass } from 'lucide-react';
import { memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

export interface WaitForReplyNodeData {
  label: string;
  timeoutValue: number;
  timeoutUnit: 'minutes' | 'hours' | 'days';
  fallbackMessage: string;
}

const WAIT_FOR_REPLY_HANDLE_IDS = {
  REPLIED: 'replied',
  TIMEOUT: 'timeout',
} as const;

function WaitForReplyNodeComponent({ data, selected }: NodeProps<WaitForReplyNodeData>) {
  const formatTimeout = () => {
    const units: Record<string, string> = {
      minutes: 'minuto(s)',
      hours: 'hora(s)',
      days: 'dia(s)',
    };

    return `${data.timeoutValue || 0} ${units[data.timeoutUnit] || 'minuto(s)'}`;
  };

  return (
    <div
      className={`
      px-4 py-3 rounded-lg border-2 bg-[#111113] shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-[#8B5CF6] ring-2 ring-[#8B5CF6]/30' : 'border-[#222226]'}
    `}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#8B5CF6] !w-3 !h-3" />

      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-[#8B5CF6]/15 rounded-md">
          <Hourglass className="w-4 h-4 text-[#8B5CF6]" aria-hidden="true" />
        </div>
        <span className="font-medium text-sm text-[#E0DDD8]">
          {data.label || 'Aguardar Resposta'}
        </span>
      </div>

      <div className="text-xs text-[#6E6E73] text-center py-1">Timeout: {formatTimeout()}</div>

      {data.fallbackMessage && (
        <div className="text-[10px] text-[#8B5CF6] bg-[#8B5CF6]/10 px-2 py-0.5 rounded-md mt-1 truncate">
          {data.fallbackMessage}
        </div>
      )}

      <div className="flex justify-between mt-3">
        <Handle
          type="source"
          position={Position.Bottom}
          id={WAIT_FOR_REPLY_HANDLE_IDS.REPLIED}
          className="!bg-green-500 !w-3 !h-3 !left-[25%]"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id={WAIT_FOR_REPLY_HANDLE_IDS.TIMEOUT}
          className="!bg-red-500 !w-3 !h-3 !left-[75%]"
        />
      </div>

      <div className="flex justify-between text-[10px] text-[#3A3A3F] mt-1 px-2">
        <span>Respondeu</span>
        <span>Timeout</span>
      </div>
    </div>
  );
}

export const WaitForReplyNode = memo(WaitForReplyNodeComponent);
