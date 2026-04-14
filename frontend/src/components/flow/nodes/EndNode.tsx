'use client';

import { Flag } from 'lucide-react';
import { memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

export interface EndNodeData {
  label: string;
  endAction: 'complete' | 'redirect' | 'handoff';
  redirectFlowId?: string;
  handoffMessage?: string;
}

function EndNodeComponent({ data, selected }: NodeProps<EndNodeData>) {
  const getEndDescription = () => {
    switch (data.endAction) {
      case 'redirect':
        return 'Redirecionar para outro fluxo';
      case 'handoff':
        return 'Transferir para atendente';
      case 'complete':
      default:
        return 'Finalizar conversa';
    }
  };

  return (
    <div
      className={`
      px-4 py-3 rounded-full border-2 bg-[#111113] shadow-md min-w-[160px]
      ${selected ? 'border-red-500 ring-2 ring-red-500/30' : 'border-[#222226]'}
    `}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-500 !w-4 !h-4" />

      <div className="flex items-center gap-2 justify-center">
        <div className="p-2 bg-red-500/20 rounded-full">
          <Flag className="w-4 h-4 text-red-400" />
        </div>
        <div>
          <span className="font-semibold text-sm text-red-400">{data.label || 'Fim'}</span>
          <div className="text-[10px] text-red-500/70">{getEndDescription()}</div>
        </div>
      </div>
    </div>
  );
}

export const EndNode = memo(EndNodeComponent);
