"use client";

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Flag } from 'lucide-react';

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
    <div className={`
      px-4 py-3 rounded-full border-2 bg-gradient-to-br from-red-50 to-rose-100 shadow-md min-w-[160px]
      ${selected ? 'border-red-500 ring-2 ring-red-200' : 'border-red-400'}
    `}>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-red-500 !w-4 !h-4"
      />
      
      <div className="flex items-center gap-2 justify-center">
        <div className="p-2 bg-red-500 rounded-full">
          <Flag className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-semibold text-sm text-red-700">
            {data.label || 'Fim'}
          </span>
          <div className="text-[10px] text-red-600">
            {getEndDescription()}
          </div>
        </div>
      </div>
    </div>
  );
}

export const EndNode = memo(EndNodeComponent);
