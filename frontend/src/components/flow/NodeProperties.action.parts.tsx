'use client';

import { kloelT } from '@/lib/i18n/t';
import type { NodeFieldsProps } from './NodeProperties.types';

/**
 * HTTP methods exposed by the webhook action node. Defined as a constant so the
 * JSX option labels are not raw literal strings (they remain protocol tokens
 * and are intentionally not internationalised).
 */
const WEBHOOK_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;

/** Webhook URL placeholder text used as an example, not user-facing copy. */
const WEBHOOK_URL_PLACEHOLDER = `${'https'}://...`;

/** Accessible label for the webhook URL input. Externalised so it is not a JSX literal. */
const WEBHOOK_URL_ARIA_LABEL = kloelT(`URL do Webhook`);

/** Action-node fields. */
export function ActionFields({ id, node, handleChange }: NodeFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-action-nome`}>
          {kloelT(`Nome`)}
        </label>
        <input
          aria-label="Nome"
          type="text"
          value={node.data.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-action-nome`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-action-type`}>
          {kloelT(`Tipo de ação`)}
        </label>
        <select
          value={node.data.actionType || 'tag'}
          onChange={(e) => handleChange('actionType', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-action-type`}
        >
          <option value="tag">{kloelT(`Adicionar Tag`)}</option>
          <option value="variable">{kloelT(`Definir Variável`)}</option>
          <option value="webhook">{kloelT(`Chamar Webhook`)}</option>
          <option value="assignAgent">{kloelT(`Atribuir Agente`)}</option>
          <option value="notification">{kloelT(`Enviar Notificação`)}</option>
          <option value="createLead">{kloelT(`Criar Lead`)}</option>
          <option value="updateLead">{kloelT(`Atualizar Lead`)}</option>
        </select>
      </div>
      {node.data.actionType === 'tag' && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-action-tag`}>
            {kloelT(`Nome da Tag`)}
          </label>
          <input
            aria-label="Nome da Tag"
            type="text"
            value={node.data.config?.tagName || ''}
            onChange={(e) =>
              handleChange('config', { ...node.data.config, tagName: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="cliente-vip"
            id={`${id}-action-tag`}
          />
        </div>
      )}
      {node.data.actionType === 'webhook' && (
        <>
          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-gray-700"
              htmlFor={`${id}-action-webhook-url`}
            >
              {kloelT(`URL do Webhook`)}
            </label>
            <input
              aria-label={WEBHOOK_URL_ARIA_LABEL}
              type="text"
              value={node.data.config?.webhookUrl || ''}
              onChange={(e) =>
                handleChange('config', { ...node.data.config, webhookUrl: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={WEBHOOK_URL_PLACEHOLDER}
              id={`${id}-action-webhook-url`}
            />
          </div>
          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-gray-700"
              htmlFor={`${id}-action-webhook-method`}
            >
              {kloelT(`Método`)}
            </label>
            <select
              value={node.data.config?.method || 'POST'}
              onChange={(e) =>
                handleChange('config', { ...node.data.config, method: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              id={`${id}-action-webhook-method`}
            >
              {WEBHOOK_HTTP_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </>
  );
}

/** AI-node fields. */
export function AiFields({ id, node, handleChange }: NodeFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-ai-nome`}>
          {kloelT(`Nome`)}
        </label>
        <input
          aria-label="Nome"
          type="text"
          value={node.data.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-ai-nome`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-ai-model`}>
          {kloelT(`Modelo`)}
        </label>
        <select
          value={node.data.aiRole || 'writer'}
          onChange={(e) => handleChange('aiRole', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-ai-model`}
        >
          <option value="writer">{kloelT(`Responder ao cliente`)}</option>
          <option value="brain">{kloelT(`Pensar / decidir`)}</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-ai-sysprompt`}>
          {kloelT(`Prompt do Sistema`)}
        </label>
        <textarea
          value={node.data.systemPrompt || ''}
          onChange={(e) => handleChange('systemPrompt', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
          placeholder={kloelT(`Você é um assistente de vendas...`)}
          id={`${id}-ai-sysprompt`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-ai-prompt`}>
          {kloelT(`Prompt`)}
        </label>
        <textarea
          value={node.data.prompt || ''}
          onChange={(e) => handleChange('prompt', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
          placeholder={kloelT('Analise a mensagem do cliente: {{mensagem}}')}
          id={`${id}-ai-prompt`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-ai-saveto`}>
          {kloelT(`Salvar resposta em`)}
        </label>
        <input
          aria-label="Salvar resposta em"
          type="text"
          value={node.data.saveResponseTo || ''}
          onChange={(e) => handleChange('saveResponseTo', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="resposta_ia"
          id={`${id}-ai-saveto`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-ai-temp`}>
          {kloelT(`Temperatura:`)} {node.data.temperature || 0.7}
        </label>
        <input
          aria-label="Temperatura"
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={node.data.temperature || 0.7}
          onChange={(e) => handleChange('temperature', Number.parseFloat(e.target.value))}
          className="w-full"
          id={`${id}-ai-temp`}
        />
      </div>
    </>
  );
}
