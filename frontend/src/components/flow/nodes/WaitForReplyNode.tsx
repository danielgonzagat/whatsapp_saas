'use client';

import { kloelT } from '@/lib/i18n/t';
import { Hourglass } from 'lucide-react';
import { memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

/** Wait for reply node data shape. */
export interface WaitForReplyNodeData {
  /** Label property. */
  label: string;
  /** Timeout value property. */
  timeoutValue: number;
  /** Timeout unit property. */
  timeoutUnit: 'minutes' | 'hours' | 'days';
  /** Fallback message property. */
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
      px-4 py-3 rounded-lg border-2 bg-[colors.background.surface] shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-[colors.ember.primary] ring-2 ring-[colors.ember.primary]/30' : 'border-[colors.border.space]'}
    `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-[colors.ember.primary] !w-3 !h-3"
      />

      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-[colors.ember.primary]/15 rounded-md">
          <Hourglass className="w-4 h-4 text-[colors.ember.primary]" aria-hidden="true" />
        </div>
        <span className="font-medium text-sm text-[colors.text.silver]">
          {data.label || 'Aguardar Resposta'}
        </span>
      </div>

      <div className="text-xs text-[colors.text.muted] text-center py-1">
        {kloelT(`Timeout:`)} {formatTimeout()}
      </div>

      {data.fallbackMessage && (
        <div className="text-[10px] text-[colors.ember.primary] bg-[colors.ember.primary]/10 px-2 py-0.5 rounded-md mt-1 truncate">
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

      <div className="flex justify-between text-[10px] text-[colors.text.dim] mt-1 px-2">
        <span>{kloelT(`Respondeu`)}</span>
        <span>{kloelT(`Timeout`)}</span>
      </div>
    </div>
  );
}

/** Wait for reply node. */
export const WaitForReplyNode = memo(WaitForReplyNodeComponent);
