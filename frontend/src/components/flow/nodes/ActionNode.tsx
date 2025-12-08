"use client";

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Zap } from 'lucide-react';

export interface ActionNodeData {
  label: string;
  actionType: 'tag' | 'variable' | 'webhook' | 'assignAgent' | 'notification' | 'createLead' | 'updateLead';
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
    <div className={`
      px-4 py-3 rounded-lg border-2 bg-white shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-purple-300'}
    `}>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-purple-500 !w-3 !h-3"
      />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-purple-100 rounded-md">
          <Zap className="w-4 h-4 text-purple-600" />
        </div>
        <span className="font-medium text-sm text-gray-700">
          {data.label || 'Ação'}
        </span>
      </div>
      
      <div className="text-xs text-gray-500">
        {data.actionType ? (
          <span className="bg-purple-50 px-2 py-1 rounded-md">
            {actionLabels[data.actionType] || data.actionType}
          </span>
        ) : (
          'Configure a ação...'
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-purple-500 !w-3 !h-3"
      />
    </div>
  );
}

export const ActionNode = memo(ActionNodeComponent);
