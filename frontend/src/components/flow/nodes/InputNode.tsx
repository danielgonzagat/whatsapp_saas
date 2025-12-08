"use client";

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MessageSquare } from 'lucide-react';

export interface InputNodeData {
  label: string;
  question: string;
  variableName: string;
  inputType: 'text' | 'number' | 'email' | 'phone' | 'date' | 'options';
  options?: string[];
  validation?: string;
  timeout?: number;
}

function InputNodeComponent({ data, selected }: NodeProps<InputNodeData>) {
  return (
    <div className={`
      px-4 py-3 rounded-lg border-2 bg-white shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-blue-300'}
    `}>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-3 !h-3"
      />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-blue-100 rounded-md">
          <MessageSquare className="w-4 h-4 text-blue-600" />
        </div>
        <span className="font-medium text-sm text-gray-700">
          {data.label || 'Entrada'}
        </span>
      </div>
      
      <div className="text-xs text-gray-500 mb-1">
        {data.question || 'Qual sua pergunta?'}
      </div>
      
      {data.variableName && (
        <div className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md inline-block">
          → ${'{'}${data.variableName}{'}'}
        </div>
      )}
      
      {data.inputType === 'options' && data.options && data.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.options.slice(0, 3).map((opt, i) => (
            <span key={i} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">
              {opt}
            </span>
          ))}
          {data.options.length > 3 && (
            <span className="text-[10px] text-gray-400">+{data.options.length - 3}</span>
          )}
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !w-3 !h-3"
      />
    </div>
  );
}

export const InputNode = memo(InputNodeComponent);
