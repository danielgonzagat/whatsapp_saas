'use client';

import { Zap } from 'lucide-react';
import { memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

export interface ActionNodeData {
  label: string;
  actionType:
    | 'tag'
    | 'variable'
    | 'webhook'
    | 'assignAgent'
    | 'notification'
    | 'createLead'
    | 'updateLead';
  config: Record<string, any>;
}

const actionLabels: Record<string, string> = {
  tag: 'Adicionar Tag',
  variable: 'Definir Variável',
  webhook: 'Chamar Webhook',
  assignAgent: 'Atribuir Agente',
  notification: 'Enviar Notificação',
  createLead: 'Criar Lead',
  updateLead: 'Atualizar Lead',
};

function ActionNodeComponent({ data, selected }: NodeProps<ActionNodeData>) {
  return (
    <div
      className={`
      px-4 py-3 rounded-lg border-2 bg-[#111113] shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-teal-500 ring-2 ring-teal-500/30' : 'border-[#222226]'}
    `}
    >
      <Handle type="target" position={Position.Top} className="!bg-teal-500 !w-3 !h-3" />

      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-teal-500/15 rounded-md">
          <Zap className="w-4 h-4 text-teal-400" />
        </div>
        <span className="font-medium text-sm text-[#E0DDD8]">{data.label || 'Ação'}</span>
      </div>

      <div className="text-xs text-[#6E6E73]">
        {data.actionType ? (
          <span className="bg-teal-500/10 px-2 py-1 rounded-md">
            {actionLabels[data.actionType] || data.actionType}
          </span>
        ) : (
          'Configure a ação...'
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-teal-500 !w-3 !h-3" />
    </div>
  );
}

export const ActionNode = memo(ActionNodeComponent);
