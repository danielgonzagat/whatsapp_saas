"use client";

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Brain } from 'lucide-react';

export interface AINodeData {
  label: string;
  prompt: string;
  model: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-3.5-turbo';
  temperature: number;
  maxTokens: number;
  saveResponseTo?: string;
  systemPrompt?: string;
}

function AINodeComponent({ data, selected }: NodeProps<AINodeData>) {
  return (
    <div className={`
      px-4 py-3 rounded-lg border-2 bg-gradient-to-br from-white to-indigo-50 shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-indigo-300'}
    `}>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-indigo-500 !w-3 !h-3"
      />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-indigo-100 rounded-md animate-pulse">
          <Brain className="w-4 h-4 text-indigo-600" />
        </div>
        <span className="font-medium text-sm text-gray-700">
          {data.label || 'KLOEL IA'}
        </span>
        <span className="ml-auto text-[9px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
          {data.model || 'gpt-4o'}
        </span>
      </div>
      
      <div className="text-xs text-gray-500 line-clamp-2">
        {data.prompt || 'Configure o prompt da IA...'}
      </div>
      
      {data.saveResponseTo && (
        <div className="mt-2 text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md inline-block">
          → ${'{'}${data.saveResponseTo}{'}'}
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-500 !w-3 !h-3"
      />
    </div>
  );
}

export const AINode = memo(AINodeComponent);
