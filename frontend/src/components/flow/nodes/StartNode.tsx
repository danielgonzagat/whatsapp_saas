'use client';

import { Play } from 'lucide-react';
import { memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

/** Start node data shape. */
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
      default:
        return 'Execução manual';
    }
  };

  return (
    <div
      className={`
      px-4 py-3 rounded-full border-2 bg-[#111113] shadow-md min-w-[160px]
      ${selected ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-[#222226]'}
    `}
    >
      <div className="flex items-center gap-2 justify-center">
        <div className="p-2 bg-emerald-500/20 rounded-full">
          <Play className="w-4 h-4 text-emerald-400" fill="currentColor" aria-hidden="true" />
        </div>
        <div>
          <span className="font-semibold text-sm text-emerald-400">{data.label || 'Início'}</span>
          <div className="text-[10px] text-emerald-500/70">{getTriggerDescription()}</div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-4 !h-4" />
    </div>
  );
}

/** Start node. */
export const StartNode = memo(StartNodeComponent);
