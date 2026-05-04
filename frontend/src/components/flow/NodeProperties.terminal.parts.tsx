'use client';

import { kloelT } from '@/lib/i18n/t';
import type { NodeFieldsProps } from './NodeProperties.types';

/** Wait-for-reply node fields. */
export function WaitForReplyFields({ id, node, handleChange }: NodeFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-wait-nome`}>
          {kloelT(`Nome`)}
        </label>
        <input
          aria-label="Nome"
          type="text"
          value={node.data.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
          placeholder={kloelT(`Aguardar Resposta`)}
          id={`${id}-wait-nome`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-wait-timeout`}>
          {kloelT(`Timeout`)}
        </label>
        <input
          aria-label="Timeout"
          type="number"
          value={node.data.timeoutValue || 0}
          onChange={(e) => handleChange('timeoutValue', Number.parseInt(e.target.value, 10))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
          min="0"
          id={`${id}-wait-timeout`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-wait-unit`}>
          {kloelT(`Unidade`)}
        </label>
        <select
          value={node.data.timeoutUnit || 'minutes'}
          onChange={(e) => handleChange('timeoutUnit', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
          id={`${id}-wait-unit`}
        >
          <option value="minutes">{kloelT(`Minutos`)}</option>
          <option value="hours">{kloelT(`Horas`)}</option>
          <option value="days">{kloelT(`Dias`)}</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-wait-fallback`}>
          {kloelT(`Mensagem de fallback`)}
        </label>
        <textarea
          value={node.data.fallbackMessage || ''}
          onChange={(e) => handleChange('fallbackMessage', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 min-h-[80px]"
          placeholder={kloelT(`Mensagem enviada quando o timeout expira...`)}
          id={`${id}-wait-fallback`}
        />
        <p className="text-xs text-gray-500">
          {kloelT(`Enviada automaticamente quando o tempo limite expira sem resposta`)}
        </p>
      </div>
    </>
  );
}

/** End-node fields. */
export function EndFields({ id, node, handleChange }: NodeFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-end-nome`}>
          {kloelT(`Nome`)}
        </label>
        <input
          aria-label="Nome"
          type="text"
          value={node.data.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-end-nome`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-end-action`}>
          {kloelT(`Ação final`)}
        </label>
        <select
          value={node.data.endAction || 'complete'}
          onChange={(e) => handleChange('endAction', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-end-action`}
        >
          <option value="complete">{kloelT(`Finalizar conversa`)}</option>
          <option value="redirect">{kloelT(`Redirecionar para outro fluxo`)}</option>
          <option value="handoff">{kloelT(`Transferir para atendente`)}</option>
        </select>
      </div>
      {node.data.endAction === 'handoff' && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-end-handoff`}>
            {kloelT(`Mensagem de transferência`)}
          </label>
          <textarea
            value={node.data.handoffMessage || ''}
            onChange={(e) => handleChange('handoffMessage', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={kloelT(`Aguarde, vou transferir para um atendente...`)}
            id={`${id}-end-handoff`}
          />
        </div>
      )}
    </>
  );
}

/** Default fallback when node type is unknown/unselected. */
export function UnknownFields() {
  return (
    <p className="text-gray-500 text-sm">
      {kloelT(`Selecione um nó para editar suas propriedades.`)}
    </p>
  );
}
