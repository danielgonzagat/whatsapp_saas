"use client";

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Play } from 'lucide-react';

export interface StartNodeData {
  label: string;
  trigger: 'keyword' | 'event' | 'manual' | 'schedule';
  keyword?: string;
  eventType?: string;
  schedule?: string;
}

function StartNodeComponent({ data, selected }: NodeProps<StartNodeData>) {
  const getTriggerDescription = () => {
    switch (data.trigger) {
      case 'keyword':
        return data.keyword ? `Palavra: "${data.keyword}"` : 'Configure palavra-chave';
      case 'event':
        return data.eventType ? `Evento: ${data.eventType}` : 'Configure evento';
      case 'schedule':
        return data.schedule ? `Agendado: ${data.schedule}` : 'Configure horário';
      case 'manual':
      default:
        return 'Execução manual';
    }
  };

  return (
    <div className={`
      px-4 py-3 rounded-full border-2 bg-gradient-to-br from-emerald-50 to-green-100 shadow-md min-w-[160px]
      ${selected ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-emerald-400'}
    `}>
      <div className="flex items-center gap-2 justify-center">
        <div className="p-2 bg-emerald-500 rounded-full">
          <Play className="w-4 h-4 text-white" fill="white" />
        </div>
        <div>
          <span className="font-semibold text-sm text-emerald-700">
            {data.label || 'Início'}
          </span>
          <div className="text-[10px] text-emerald-600">
            {getTriggerDescription()}
          </div>
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-emerald-500 !w-4 !h-4"
      />
    </div>
  );
}

export const StartNode = memo(StartNodeComponent);
