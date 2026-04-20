'use client';

import { Brain } from 'lucide-react';
import { memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

/** Ai node data shape. */
export interface AINodeData {
  /** Label property. */
  label: string;
  /** Prompt property. */
  prompt: string;
  /** Ai role property. */
  aiRole?: 'writer' | 'brain';
  /** Model property. */
  model?: string;
  /** Temperature property. */
  temperature: number;
  /** Max tokens property. */
  maxTokens: number;
  /** Save response to property. */
  saveResponseTo?: string;
  /** System prompt property. */
  systemPrompt?: string;
}

function AINodeComponent({ data, selected }: NodeProps<AINodeData>) {
  return (
    <div
      className={`
      px-4 py-3 rounded-lg border-2 bg-[#111113] shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-[#222226]'}
    `}
    >
      <Handle type="target" position={Position.Top} className="!bg-indigo-500 !w-3 !h-3" />

      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-indigo-500/15 rounded-md animate-pulse">
          <Brain className="w-4 h-4 text-indigo-400" aria-hidden="true" />
        </div>
        <span className="font-medium text-sm text-[#E0DDD8]">{data.label || 'KLOEL IA'}</span>
        <span className="ml-auto text-[9px] bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded">
          {data.aiRole === 'brain' ? 'pensar' : 'responder'}
        </span>
      </div>

      <div className="text-xs text-[#6E6E73] line-clamp-2">
        {data.prompt || 'Configure o prompt da IA...'}
      </div>

      {data.saveResponseTo && (
        <div className="mt-2 text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md inline-block">
          → ${'{'}${data.saveResponseTo}
          {'}'}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-indigo-500 !w-3 !h-3" />
    </div>
  );
}

/** Ai node. */
export const AINode = memo(AINodeComponent);
