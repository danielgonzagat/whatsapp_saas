'use client';

import { X } from 'lucide-react';
import type { Node } from 'reactflow';

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
              <label className="block text-sm font-medium text-gray-700" htmlFor="nome-6c0e32">
                Nome
              </label>
              <input
                aria-label="Nome"
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Início"
                id="nome-6c0e32"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="gatilho-0c78bd">
                Gatilho
              </label>
              <select
                value={node.data.trigger || 'manual'}
                onChange={(e) => handleChange('trigger', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="gatilho-0c78bd"
              >
                <option value="manual">Manual</option>
                <option value="keyword">Palavra-chave</option>
                <option value="event">Evento</option>
                <option value="schedule">Agendamento</option>
              </select>
            </div>
            {node.data.trigger === 'keyword' && (
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium text-gray-700"
                  htmlFor="palavra-chave-b8cfef"
                >
                  Palavra-chave
                </label>
                <input
                  aria-label="Palavra-chave"
                  type="text"
                  value={node.data.keyword || ''}
                  onChange={(e) => handleChange('keyword', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="oi, olá, começar"
                  id="palavra-chave-b8cfef"
                />
              </div>
            )}
          </>
        );

      case 'message':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="nome-ad61cf">
                Nome
              </label>
              <input
                aria-label="Nome"
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mensagem de boas-vindas"
                id="nome-ad61cf"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="mensagem-31e8a6">
                Mensagem
              </label>
              <textarea
                value={node.data.message || ''}
                onChange={(e) => handleChange('message', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                placeholder="Olá! Como posso ajudá-lo hoje?"
                id="mensagem-31e8a6"
              />
              <p className="text-xs text-gray-500">Use {'{{variavel}}'} para inserir variáveis</p>
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-gray-700"
                htmlFor="url-da-m-dia-opcional-99f308"
              >
                URL da Mídia (opcional)
              </label>
              <input
                aria-label="URL da Mídia"
                type="text"
                value={node.data.mediaUrl || ''}
                onChange={(e) => handleChange('mediaUrl', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://..."
                id="url-da-m-dia-opcional-99f308"
              />
            </div>
          </>
        );

      case 'input':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="nome-72b978">
                Nome
              </label>
              <input
                aria-label="Nome"
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="nome-72b978"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="pergunta-8582b4">
                Pergunta
              </label>
              <textarea
                value={node.data.question || ''}
                onChange={(e) => handleChange('question', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Qual é o seu nome?"
                id="pergunta-8582b4"
              />
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-gray-700"
                htmlFor="salvar-em-vari-vel-f8128a"
              >
                Salvar em variável
              </label>
              <input
                aria-label="Salvar em variável"
                type="text"
                value={node.data.variableName || ''}
                onChange={(e) => handleChange('variableName', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="nome"
                id="salvar-em-vari-vel-f8128a"
              />
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-gray-700"
                htmlFor="tipo-de-entrada-a9b088"
              >
                Tipo de entrada
              </label>
              <select
                value={node.data.inputType || 'text'}
                onChange={(e) => handleChange('inputType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="tipo-de-entrada-a9b088"
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
                <label
                  className="block text-sm font-medium text-gray-700"
                  htmlFor="op-es-uma-por-linha-4b23cd"
                >
                  Opções (uma por linha)
                </label>
                <textarea
                  value={(node.data.options || []).join('\n')}
                  onChange={(e) =>
                    handleChange('options', e.target.value.split('\n').filter(Boolean))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                  id="op-es-uma-por-linha-4b23cd"
                />
              </div>
            )}
          </>
        );

      case 'condition':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="nome-a522fb">
                Nome
              </label>
              <input
                aria-label="Nome"
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="nome-a522fb"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="vari-vel-9dfa33">
                Variável
              </label>
              <input
                aria-label="Variável"
                type="text"
                value={node.data.condition || ''}
                onChange={(e) => handleChange('condition', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="resposta"
                id="vari-vel-9dfa33"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="operador-1bcff5">
                Operador
              </label>
              <select
                value={node.data.operator || 'equals'}
                onChange={(e) => handleChange('operator', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="operador-1bcff5"
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
              <label className="block text-sm font-medium text-gray-700" htmlFor="valor-6600eb">
                Valor
              </label>
              <input
                aria-label="Valor"
                type="text"
                value={node.data.value || ''}
                onChange={(e) => handleChange('value', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="sim"
                id="valor-6600eb"
              />
            </div>
          </>
        );

      case 'delay':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="nome-520ad2">
                Nome
              </label>
              <input
                aria-label="Nome"
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="nome-520ad2"
              />
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-gray-700"
                htmlFor="tipo-de-delay-896e2f"
              >
                Tipo de delay
              </label>
              <select
                value={node.data.delayType || 'seconds'}
                onChange={(e) => handleChange('delayType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="tipo-de-delay-896e2f"
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
                <label className="block text-sm font-medium text-gray-700" htmlFor="valor-a9256c">
                  Valor
                </label>
                <input
                  aria-label="Valor do delay"
                  type="number"
                  value={node.data.delayValue || 0}
                  onChange={(e) => handleChange('delayValue', Number.parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                  id="valor-a9256c"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700" htmlFor="hor-rio-7a56c7">
                  Horário
                </label>
                <input
                  aria-label="Horário"
                  type="time"
                  value={node.data.untilTime || ''}
                  onChange={(e) => handleChange('untilTime', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  id="hor-rio-7a56c7"
                />
              </div>
            )}
          </>
        );

      case 'action':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="nome-88ebfe">
                Nome
              </label>
              <input
                aria-label="Nome"
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="nome-88ebfe"
              />
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-gray-700"
                htmlFor="tipo-de-a-o-b48645"
              >
                Tipo de ação
              </label>
              <select
                value={node.data.actionType || 'tag'}
                onChange={(e) => handleChange('actionType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="tipo-de-a-o-b48645"
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
                <label
                  className="block text-sm font-medium text-gray-700"
                  htmlFor="nome-da-tag-c5de79"
                >
                  Nome da Tag
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
                  id="nome-da-tag-c5de79"
                />
              </div>
            )}
            {node.data.actionType === 'webhook' && (
              <>
                <div className="space-y-2">
                  <label
                    className="block text-sm font-medium text-gray-700"
                    htmlFor="url-do-webhook-14837f"
                  >
                    URL do Webhook
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
                    id="url-do-webhook-14837f"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="block text-sm font-medium text-gray-700"
                    htmlFor="m-todo-407dc0"
                  >
                    Método
                  </label>
                  <select
                    value={node.data.config?.method || 'POST'}
                    onChange={(e) =>
                      handleChange('config', { ...node.data.config, method: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    id="m-todo-407dc0"
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
              <label className="block text-sm font-medium text-gray-700" htmlFor="nome-5555c3">
                Nome
              </label>
              <input
                aria-label="Nome"
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="nome-5555c3"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="modelo-42467d">
                Modelo
              </label>
              <select
                value={node.data.aiRole || 'writer'}
                onChange={(e) => handleChange('aiRole', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="modelo-42467d"
              >
                <option value="writer">Responder ao cliente</option>
                <option value="brain">Pensar / decidir</option>
              </select>
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-gray-700"
                htmlFor="prompt-do-sistema-6bda2b"
              >
                Prompt do Sistema
              </label>
              <textarea
                value={node.data.systemPrompt || ''}
                onChange={(e) => handleChange('systemPrompt', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                placeholder="Você é um assistente de vendas..."
                id="prompt-do-sistema-6bda2b"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="prompt-58b6f0">
                Prompt
              </label>
              <textarea
                value={node.data.prompt || ''}
                onChange={(e) => handleChange('prompt', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                placeholder="Analise a mensagem do cliente: {{mensagem}}"
                id="prompt-58b6f0"
              />
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-gray-700"
                htmlFor="salvar-resposta-em-3b9df1"
              >
                Salvar resposta em
              </label>
              <input
                aria-label="Salvar resposta em"
                type="text"
                value={node.data.saveResponseTo || ''}
                onChange={(e) => handleChange('saveResponseTo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="resposta_ia"
                id="salvar-resposta-em-3b9df1"
              />
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-gray-700"
                htmlFor="temperatura-43393b"
              >
                Temperatura: {node.data.temperature || 0.7}
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
                id="temperatura-43393b"
              />
            </div>
          </>
        );

      case 'waitForReply':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="nome-e47f70">
                Nome
              </label>
              <input
                aria-label="Nome"
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="Aguardar Resposta"
                id="nome-e47f70"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="timeout-b9940b">
                Timeout
              </label>
              <input
                aria-label="Timeout"
                type="number"
                value={node.data.timeoutValue || 0}
                onChange={(e) => handleChange('timeoutValue', Number.parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                min="0"
                id="timeout-b9940b"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="unidade-fe9831">
                Unidade
              </label>
              <select
                value={node.data.timeoutUnit || 'minutes'}
                onChange={(e) => handleChange('timeoutUnit', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                id="unidade-fe9831"
              >
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Dias</option>
              </select>
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-gray-700"
                htmlFor="mensagem-de-fallback-6e260a"
              >
                Mensagem de fallback
              </label>
              <textarea
                value={node.data.fallbackMessage || ''}
                onChange={(e) => handleChange('fallbackMessage', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 min-h-[80px]"
                placeholder="Mensagem enviada quando o timeout expira..."
                id="mensagem-de-fallback-6e260a"
              />
              <p className="text-xs text-gray-500">
                Enviada automaticamente quando o tempo limite expira sem resposta
              </p>
            </div>
          </>
        );

      case 'end':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="nome-232a2d">
                Nome
              </label>
              <input
                aria-label="Nome"
                type="text"
                value={node.data.label || ''}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="nome-232a2d"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700" htmlFor="a-o-final-edca3f">
                Ação final
              </label>
              <select
                value={node.data.endAction || 'complete'}
                onChange={(e) => handleChange('endAction', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                id="a-o-final-edca3f"
              >
                <option value="complete">Finalizar conversa</option>
                <option value="redirect">Redirecionar para outro fluxo</option>
                <option value="handoff">Transferir para atendente</option>
              </select>
            </div>
            {node.data.endAction === 'handoff' && (
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium text-gray-700"
                  htmlFor="mensagem-de-transfer-ncia-c84c73"
                >
                  Mensagem de transferência
                </label>
                <textarea
                  value={node.data.handoffMessage || ''}
                  onChange={(e) => handleChange('handoffMessage', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Aguarde, vou transferir para um atendente..."
                  id="mensagem-de-transfer-ncia-c84c73"
                />
              </div>
            )}
          </>
        );

      default:
        return (
          <p className="text-gray-500 text-sm">Selecione um nó para editar suas propriedades.</p>
        );
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Propriedades</h2>
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
        <p className="text-xs text-gray-500 text-center">ID: {node.id}</p>
      </div>
    </div>
  );
}
