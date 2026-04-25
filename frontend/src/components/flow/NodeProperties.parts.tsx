'use client';

import { kloelT } from '@/lib/i18n/t';
import type { Node } from 'reactflow';

/** Shared props passed to every per-type field renderer. */
export interface NodeFieldsProps {
  /** Stable id prefix used to namespace input/label ids per panel render. */
  id: string;
  /** Currently selected node. */
  node: Node;
  /** Mutate a single field on `node.data`. */
  handleChange: (field: string, value: unknown) => void;
}

/** Start-node fields. */
export function StartFields({ id, node, handleChange }: NodeFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-start-nome`}>
          {kloelT(`Nome`)}
        </label>
        <input
          aria-label="Nome"
          type="text"
          value={node.data.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={kloelT(`Início`)}
          id={`${id}-start-nome`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-start-gatilho`}>
          {kloelT(`Gatilho`)}
        </label>
        <select
          value={node.data.trigger || 'manual'}
          onChange={(e) => handleChange('trigger', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-start-gatilho`}
        >
          <option value="manual">{kloelT(`Manual`)}</option>
          <option value="keyword">{kloelT(`Palavra-chave`)}</option>
          <option value="event">{kloelT(`Evento`)}</option>
          <option value="schedule">{kloelT(`Agendamento`)}</option>
        </select>
      </div>
      {node.data.trigger === 'keyword' && (
        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-gray-700"
            htmlFor={`${id}-start-keyword`}
          >
            {kloelT(`Palavra-chave`)}
          </label>
          <input
            aria-label="Palavra-chave"
            type="text"
            value={node.data.keyword || ''}
            onChange={(e) => handleChange('keyword', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={kloelT(`oi, olá, começar`)}
            id={`${id}-start-keyword`}
          />
        </div>
      )}
    </>
  );
}

/** Message-node fields. */
export function MessageFields({ id, node, handleChange }: NodeFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-msg-nome`}>
          {kloelT(`Nome`)}
        </label>
        <input
          aria-label="Nome"
          type="text"
          value={node.data.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={kloelT(`Mensagem de boas-vindas`)}
          id={`${id}-msg-nome`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-msg-mensagem`}>
          {kloelT(`Mensagem`)}
        </label>
        <textarea
          value={node.data.message || ''}
          onChange={(e) => handleChange('message', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
          placeholder={kloelT(`Olá! Como posso ajudá-lo hoje?`)}
          id={`${id}-msg-mensagem`}
        />
        <p className="text-xs text-gray-500">
          {kloelT(`Use`)} {'{{variavel}}'} {kloelT(`para inserir variáveis`)}
        </p>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-msg-media`}>
          {kloelT(`URL da Mídia (opcional)`)}
        </label>
        <input
          aria-label="URL da Mídia"
          type="text"
          value={node.data.mediaUrl || ''}
          onChange={(e) => handleChange('mediaUrl', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="https://..."
          id={`${id}-msg-media`}
        />
      </div>
    </>
  );
}

/** Input-node fields. */
export function InputFields({ id, node, handleChange }: NodeFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-input-nome`}>
          {kloelT(`Nome`)}
        </label>
        <input
          aria-label="Nome"
          type="text"
          value={node.data.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-input-nome`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-input-pergunta`}>
          {kloelT(`Pergunta`)}
        </label>
        <textarea
          value={node.data.question || ''}
          onChange={(e) => handleChange('question', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={kloelT(`Qual é o seu nome?`)}
          id={`${id}-input-pergunta`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-input-varname`}>
          {kloelT(`Salvar em variável`)}
        </label>
        <input
          aria-label="Salvar em variável"
          type="text"
          value={node.data.variableName || ''}
          onChange={(e) => handleChange('variableName', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="nome"
          id={`${id}-input-varname`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-input-type`}>
          {kloelT(`Tipo de entrada`)}
        </label>
        <select
          value={node.data.inputType || 'text'}
          onChange={(e) => handleChange('inputType', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-input-type`}
        >
          <option value="text">{kloelT(`Texto`)}</option>
          <option value="number">{kloelT(`Número`)}</option>
          <option value="email">{kloelT(`E-mail`)}</option>
          <option value="phone">{kloelT(`Telefone`)}</option>
          <option value="date">{kloelT(`Data`)}</option>
          <option value="options">{kloelT(`Opções`)}</option>
        </select>
      </div>
      {node.data.inputType === 'options' && (
        <div className="space-y-2">
          <label
            className="block text-sm font-medium text-gray-700"
            htmlFor={`${id}-input-options`}
          >
            {kloelT(`Opções (uma por linha)`)}
          </label>
          <textarea
            value={(node.data.options || []).join('\n')}
            onChange={(e) => handleChange('options', e.target.value.split('\n').filter(Boolean))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={kloelT(`Opção 1&#10;Opção 2&#10;Opção 3`)}
            id={`${id}-input-options`}
          />
        </div>
      )}
    </>
  );
}

/** Condition-node fields. */
export function ConditionFields({ id, node, handleChange }: NodeFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-cond-nome`}>
          {kloelT(`Nome`)}
        </label>
        <input
          aria-label="Nome"
          type="text"
          value={node.data.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-cond-nome`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-cond-var`}>
          {kloelT(`Variável`)}
        </label>
        <input
          aria-label="Variável"
          type="text"
          value={node.data.condition || ''}
          onChange={(e) => handleChange('condition', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="resposta"
          id={`${id}-cond-var`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-cond-op`}>
          {kloelT(`Operador`)}
        </label>
        <select
          value={node.data.operator || 'equals'}
          onChange={(e) => handleChange('operator', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-cond-op`}
        >
          <option value="equals">{kloelT(`Igual a`)}</option>
          <option value="contains">{kloelT(`Contém`)}</option>
          <option value="startsWith">{kloelT(`Começa com`)}</option>
          <option value="endsWith">{kloelT(`Termina com`)}</option>
          <option value="regex">{kloelT(`Regex`)}</option>
          <option value="greaterThan">{kloelT(`Maior que`)}</option>
          <option value="lessThan">{kloelT(`Menor que`)}</option>
        </select>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-cond-val`}>
          {kloelT(`Valor`)}
        </label>
        <input
          aria-label="Valor"
          type="text"
          value={node.data.value || ''}
          onChange={(e) => handleChange('value', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="sim"
          id={`${id}-cond-val`}
        />
      </div>
    </>
  );
}

/** Delay-node fields. */
export function DelayFields({ id, node, handleChange }: NodeFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-delay-nome`}>
          {kloelT(`Nome`)}
        </label>
        <input
          aria-label="Nome"
          type="text"
          value={node.data.label || ''}
          onChange={(e) => handleChange('label', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-delay-nome`}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-delay-type`}>
          {kloelT(`Tipo de delay`)}
        </label>
        <select
          value={node.data.delayType || 'seconds'}
          onChange={(e) => handleChange('delayType', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          id={`${id}-delay-type`}
        >
          <option value="seconds">{kloelT(`Segundos`)}</option>
          <option value="minutes">{kloelT(`Minutos`)}</option>
          <option value="hours">{kloelT(`Horas`)}</option>
          <option value="days">{kloelT(`Dias`)}</option>
          <option value="until">{kloelT(`Até horário específico`)}</option>
        </select>
      </div>
      {node.data.delayType !== 'until' ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-delay-val`}>
            {kloelT(`Valor`)}
          </label>
          <input
            aria-label="Valor do delay"
            type="number"
            value={node.data.delayValue || 0}
            onChange={(e) => handleChange('delayValue', Number.parseInt(e.target.value, 10))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="0"
            id={`${id}-delay-val`}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700" htmlFor={`${id}-delay-time`}>
            {kloelT(`Horário`)}
          </label>
          <input
            aria-label="Horário"
            type="time"
            value={node.data.untilTime || ''}
            onChange={(e) => handleChange('untilTime', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            id={`${id}-delay-time`}
          />
        </div>
      )}
    </>
  );
}

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
              aria-label="URL do Webhook"
              type="text"
              value={node.data.config?.webhookUrl || ''}
              onChange={(e) =>
                handleChange('config', { ...node.data.config, webhookUrl: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://..."
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
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
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
          placeholder={kloelT(`Analise a mensagem do cliente: {{mensagem}}`)}
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
