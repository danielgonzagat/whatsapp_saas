"use client";

import { Node } from 'reactflow';
import { X } from 'lucide-react';

interface NodePropertiesProps {
  node: Node | null;
  onUpdate: (nodeId: string, data: any) => void;
  onClose: () => void;
}

export function NodeProperties({ node, onUpdate, onClose }: NodePropertiesProps) {
  if (!node) return null;

  const handleChange = (field: string, value: any) => {
    onUpdate(node.id, { ...node.data, [field]: value });
  };

  const renderFields = () => {
    switch (node.type) {
      case 'start':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Início"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Gatilho</label>
              <select
                value={node.data.trigger || 'manual'}
                onChange={(e) => handleChange('trigger', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="manual">Manual</option>
                <option value="keyword">Palavra-chave</option>
                <option value="event">Evento</option>
                <option value="schedule">Agendamento</option>
              </select>
            </div>
            {node.data.trigger === 'keyword' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Palavra-chave</label>
                <input
                  type="text"
                  value={node.data.keyword || ''}
                  onChange={(e) => handleChange('keyword', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="oi, olá, começar"
                />
              </div>
            )}
          </>
        );

      case 'message':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mensagem de boas-vindas"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Mensagem</label>
              <textarea
                value={node.data.message || ''}
                onChange={(e) => handleChange('message', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                placeholder="Olá! Como posso ajudá-lo hoje?"
              />
              <p className="text-xs text-gray-500">
                Use {'{{variavel}}'} para inserir variáveis
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">URL da Mídia (opcional)</label>
              <input
                type="text"
                value={node.data.mediaUrl || ''}
                onChange={(e) => handleChange('mediaUrl', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://..."
              />
            </div>
          </>
        );

      case 'input':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Pergunta</label>
              <textarea
                value={node.data.question || ''}
                onChange={(e) => handleChange('question', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Qual é o seu nome?"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Salvar em variável</label>
              <input
                type="text"
                value={node.data.variableName || ''}
                onChange={(e) => handleChange('variableName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="nome"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Tipo de entrada</label>
              <select
                value={node.data.inputType || 'text'}
                onChange={(e) => handleChange('inputType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="email">E-mail</option>
                <option value="phone">Telefone</option>
                <option value="date">Data</option>
                <option value="options">Opções</option>
              </select>
            </div>
            {node.data.inputType === 'options' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Opções (uma por linha)</label>
                <textarea
                  value={(node.data.options || []).join('\n')}
                  onChange={(e) => handleChange('options', e.target.value.split('\n').filter(Boolean))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                />
              </div>
            )}
          </>
        );

      case 'condition':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Variável</label>
              <input
                type="text"
                value={node.data.condition || ''}
                onChange={(e) => handleChange('condition', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="resposta"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Operador</label>
              <select
                value={node.data.operator || 'equals'}
                onChange={(e) => handleChange('operator', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="equals">Igual a</option>
                <option value="contains">Contém</option>
                <option value="startsWith">Começa com</option>
                <option value="endsWith">Termina com</option>
                <option value="regex">Regex</option>
                <option value="greaterThan">Maior que</option>
                <option value="lessThan">Menor que</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Valor</label>
              <input
                type="text"
                value={node.data.value || ''}
                onChange={(e) => handleChange('value', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="sim"
              />
            </div>
          </>
        );

      case 'delay':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Tipo de delay</label>
              <select
                value={node.data.delayType || 'seconds'}
                onChange={(e) => handleChange('delayType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="seconds">Segundos</option>
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Dias</option>
                <option value="until">Até horário específico</option>
              </select>
            </div>
            {node.data.delayType !== 'until' ? (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Valor</label>
                <input
                  type="number"
                  value={node.data.delayValue || 0}
                  onChange={(e) => handleChange('delayValue', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Horário</label>
                <input
                  type="time"
                  value={node.data.untilTime || ''}
                  onChange={(e) => handleChange('untilTime', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </>
        );

      case 'action':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Tipo de ação</label>
              <select
                value={node.data.actionType || 'tag'}
                onChange={(e) => handleChange('actionType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="tag">Adicionar Tag</option>
                <option value="variable">Definir Variável</option>
                <option value="webhook">Chamar Webhook</option>
                <option value="assignAgent">Atribuir Agente</option>
                <option value="notification">Enviar Notificação</option>
                <option value="createLead">Criar Lead</option>
                <option value="updateLead">Atualizar Lead</option>
              </select>
            </div>
            {node.data.actionType === 'tag' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Nome da Tag</label>
                <input
                  type="text"
                  value={node.data.config?.tagName || ''}
                  onChange={(e) => handleChange('config', { ...node.data.config, tagName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="cliente-vip"
                />
              </div>
            )}
            {node.data.actionType === 'webhook' && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">URL do Webhook</label>
                  <input
                    type="text"
                    value={node.data.config?.webhookUrl || ''}
                    onChange={(e) => handleChange('config', { ...node.data.config, webhookUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Método</label>
                  <select
                    value={node.data.config?.method || 'POST'}
                    onChange={(e) => handleChange('config', { ...node.data.config, method: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      case 'ai':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Modelo</label>
              <select
                value={node.data.model || 'gpt-4o'}
                onChange={(e) => handleChange('model', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="gpt-4o">GPT-4o (Recomendado)</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Prompt do Sistema</label>
              <textarea
                value={node.data.systemPrompt || ''}
                onChange={(e) => handleChange('systemPrompt', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                placeholder="Você é um assistente de vendas..."
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Prompt</label>
              <textarea
                value={node.data.prompt || ''}
                onChange={(e) => handleChange('prompt', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                placeholder="Analise a mensagem do cliente: {{mensagem}}"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Salvar resposta em</label>
              <input
                type="text"
                value={node.data.saveResponseTo || ''}
                onChange={(e) => handleChange('saveResponseTo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="resposta_ia"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Temperatura: {node.data.temperature || 0.7}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={node.data.temperature || 0.7}
                onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </>
        );

      case 'end':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Nome</label>
              <input
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Ação final</label>
              <select
                value={node.data.endAction || 'complete'}
                onChange={(e) => handleChange('endAction', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="complete">Finalizar conversa</option>
                <option value="redirect">Redirecionar para outro fluxo</option>
                <option value="handoff">Transferir para atendente</option>
              </select>
            </div>
            {node.data.endAction === 'handoff' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Mensagem de transferência</label>
                <textarea
                  value={node.data.handoffMessage || ''}
                  onChange={(e) => handleChange('handoffMessage', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Aguarde, vou transferir para um atendente..."
                />
              </div>
            )}
          </>
        );

      default:
        return (
          <p className="text-gray-500 text-sm">
            Selecione um nó para editar suas propriedades.
          </p>
        );
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Propriedades</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-md transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {renderFields()}
      </div>

      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          ID: {node.id}
        </p>
      </div>
    </div>
  );
}
