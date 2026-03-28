"use client";

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';

export interface ConditionNodeData {
  label: string;
  condition: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'greaterThan' | 'lessThan';
  value: string;
}

function ConditionNodeComponent({ data, selected }: NodeProps<ConditionNodeData>) {
  return (
    <div className={`
      px-4 py-3 rounded-lg border-2 bg-[#111113] shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-yellow-500 ring-2 ring-yellow-500/30' : 'border-[#222226]'}
    `}>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-yellow-500 !w-3 !h-3"
      />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-yellow-500/15 rounded-md">
          <GitBranch className="w-4 h-4 text-yellow-400" />
        </div>
        <span className="font-medium text-sm text-[#E0DDD8]">
          {data.label || 'Condição'}
        </span>
      </div>
      
      <div className="text-xs text-[#6E6E73]">
        {data.condition ? (
          <span>Se <strong>{data.condition}</strong> {data.operator} <strong>{data.value}</strong></span>
        ) : (
          'Configure a condição...'
        )}
      </div>
      
      <div className="flex justify-between mt-3">
        <Handle
          type="source"
          position={Position.Bottom}
          id="true"
          className="!bg-green-500 !w-3 !h-3 !left-[25%]"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="false"
          className="!bg-red-500 !w-3 !h-3 !left-[75%]"
        />
      </div>
      
      <div className="flex justify-between text-[10px] text-[#3A3A3F] mt-1 px-2">
        <span>✓ Sim</span>
        <span>✗ Não</span>
      </div>
    </div>
  );
}

export const ConditionNode = memo(ConditionNodeComponent);
