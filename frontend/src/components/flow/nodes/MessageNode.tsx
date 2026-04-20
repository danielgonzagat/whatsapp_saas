'use client';

import { kloelT } from '@/lib/i18n/t';
import { MessageCircle } from 'lucide-react';
import { memo } from 'react';
import { Handle, type NodeProps, Position } from 'reactflow';

/** Message node data shape. */
export interface MessageNodeData {
  /** Label property. */
  label: string;
  /** Message property. */
  message: string;
  /** Media url property. */
  mediaUrl?: string;
  /** Media type property. */
  mediaType?: 'image' | 'video' | 'audio' | 'document';
}

function MessageNodeComponent({ data, selected }: NodeProps<MessageNodeData>) {
  return (
    <div
      className={`
      px-4 py-3 rounded-lg border-2 bg-[#111113] shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-green-500 ring-2 ring-green-500/30' : 'border-[#222226]'}
    `}
    >
      <Handle type="target" position={Position.Top} className="!bg-green-500 !w-3 !h-3" />

      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-green-500/15 rounded-md">
          <MessageCircle className="w-4 h-4 text-green-400" aria-hidden="true" />
        </div>
        <span className="font-medium text-sm text-[#E0DDD8]">{data.label || 'Mensagem'}</span>
      </div>

      <div className="text-xs text-[#6E6E73] truncate">
        {data.message || 'Configure a mensagem...'}
      </div>

      {data.mediaUrl && (
        <div className="mt-2 text-xs text-blue-500 flex items-center gap-1">
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            style={{ display: 'inline', verticalAlign: 'middle' }}
            aria-hidden="true"
          >
            <path d={kloelT(`M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48`)} />
          </svg>{' '}
          {data.mediaType || 'midia'}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-3 !h-3" />
    </div>
  );
}

/** Message node. */
export const MessageNode = memo(MessageNodeComponent);
