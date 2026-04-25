'use client';

import { kloelT } from '@/lib/i18n/t';
import type { NodeFieldsProps } from './NodeProperties.types';

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
