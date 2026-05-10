'use client';

import { kloelT } from '@/lib/i18n/t';
import { X } from 'lucide-react';
import { useId } from 'react';
import type { Node } from 'reactflow';
import { StartFields, MessageFields, InputFields, ConditionFields, DelayFields } from './NodeProperties.flow.parts';
import { ActionFields, AiFields } from './NodeProperties.action.parts';
import { WaitForReplyFields, EndFields, UnknownFields } from './NodeProperties.terminal.parts';

interface NodePropertiesProps {
  node: Node | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

export function NodeProperties({ node, onUpdate, onClose }: NodePropertiesProps) {
  const id = useId();
  if (!node) {
    return null;
  }

  const handleChange = (field: string, value: unknown) => {
    onUpdate(node.id, { ...node.data, [field]: value });
  };

  const nodeFieldsProps = { id, node, handleChange };

  const renderFields = () => {
    switch (node.type) {
      case 'start':
        return <StartFields {...nodeFieldsProps} />;
      case 'message':
        return <MessageFields {...nodeFieldsProps} />;
      case 'input':
        return <InputFields {...nodeFieldsProps} />;
      case 'condition':
        return <ConditionFields {...nodeFieldsProps} />;
      case 'delay':
        return <DelayFields {...nodeFieldsProps} />;
      case 'action':
        return <ActionFields {...nodeFieldsProps} />;
      case 'ai':
        return <AiFields {...nodeFieldsProps} />;
      case 'waitForReply':
        return <WaitForReplyFields {...nodeFieldsProps} />;
      case 'end':
        return <EndFields {...nodeFieldsProps} />;
      default:
        return <UnknownFields />;
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">{kloelT(`Propriedades`)}</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Fechar painel de propriedades"
        >
          <X className="w-5 h-5 text-gray-500" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">{renderFields()}</div>

      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          {kloelT(`ID:`)} {node.id}
        </p>
      </div>
    </div>
  );
}
