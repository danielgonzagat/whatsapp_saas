'use client';

import { kloelT } from '@/lib/i18n/t';
import { MessageSquare } from 'lucide-react';
import { memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

/** Input node data shape. */
export interface InputNodeData {
  /** Label property. */
  label: string;
  /** Question property. */
  question: string;
  /** Variable name property. */
  variableName: string;
  /** Input type property. */
  inputType: 'text' | 'number' | 'email' | 'phone' | 'date' | 'options';
  /** Options property. */
  options?: string[];
  /** Validation property. */
  validation?: string;
  /** Timeout property. */
  timeout?: number;
}

function InputNodeComponent({ data, selected }: NodeProps<InputNodeData>) {
  return (
    <div
      className={`
      px-4 py-3 rounded-lg border-2 bg-[#111113] shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-[#222226]'}
    `}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3" />

      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-blue-500/15 rounded-md">
          <MessageSquare className="w-4 h-4 text-blue-400" aria-hidden="true" />
        </div>
        <span className="font-medium text-sm text-[#E0DDD8]">{data.label || 'Entrada'}</span>
      </div>

      <div className="text-xs text-[#6E6E73] mb-1">{data.question || 'Qual sua pergunta?'}</div>

      {data.variableName && (
        <div className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md inline-block">
          
          {kloelT(`→ $`)}{'{'}${data.variableName}
          {'}'}
        </div>
      )}

      {data.inputType === 'options' && data.options && data.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.options.slice(0, 3).map((opt) => (
            <span
              key={opt}
              className="text-[10px] bg-[#19191C] text-[#E0DDD8] px-1.5 py-0.5 rounded"
            >
              {opt}
            </span>
          ))}
          {data.options.length > 3 && (
            <span className="text-[10px] text-[#3A3A3F]">+{data.options.length - 3}</span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3" />
    </div>
  );
}

/** Input node. */
export const InputNode = memo(InputNodeComponent);
