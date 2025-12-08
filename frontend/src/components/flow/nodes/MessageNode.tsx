"use client";

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MessageCircle } from 'lucide-react';

export interface MessageNodeData {
  label: string;
  message: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
}

function MessageNodeComponent({ data, selected }: NodeProps<MessageNodeData>) {
  return (
    <div className={`
      px-4 py-3 rounded-lg border-2 bg-white shadow-md min-w-[200px] max-w-[280px]
      ${selected ? 'border-green-500 ring-2 ring-green-200' : 'border-green-300'}
    `}>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-green-500 !w-3 !h-3"
      />
      
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-green-100 rounded-md">
          <MessageCircle className="w-4 h-4 text-green-600" />
        </div>
        <span className="font-medium text-sm text-gray-700">
          {data.label || 'Mensagem'}
        </span>
      </div>
      
      <div className="text-xs text-gray-500 truncate">
        {data.message || 'Configure a mensagem...'}
      </div>
      
      {data.mediaUrl && (
        <div className="mt-2 text-xs text-blue-500 flex items-center gap-1">
          📎 {data.mediaType || 'mídia'}
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-green-500 !w-3 !h-3"
      />
    </div>
  );
}

export const MessageNode = memo(MessageNodeComponent);
