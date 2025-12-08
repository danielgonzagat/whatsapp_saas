"use client";

import { DragEvent } from 'react';
import { 
  MessageCircle, 
  GitBranch, 
  Zap, 
  MessageSquare, 
  Clock, 
  Brain, 
  Play, 
  Flag,
  ChevronDown,
  Search
} from 'lucide-react';
import { useState } from 'react';

interface NodeType {
  type: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  category: 'trigger' | 'message' | 'logic' | 'action' | 'ai';
}

const nodeTypes: NodeType[] = [
  {
    type: 'start',
    label: 'Início',
    icon: <Play className="w-4 h-4" />,
    color: 'bg-emerald-500',
    description: 'Ponto de entrada do fluxo',
    category: 'trigger',
  },
  {
    type: 'message',
    label: 'Mensagem',
    icon: <MessageCircle className="w-4 h-4" />,
    color: 'bg-green-500',
    description: 'Enviar mensagem de texto ou mídia',
    category: 'message',
  },
  {
    type: 'input',
    label: 'Entrada',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'bg-blue-500',
    description: 'Coletar resposta do usuário',
    category: 'message',
  },
  {
    type: 'condition',
    label: 'Condição',
    icon: <GitBranch className="w-4 h-4" />,
    color: 'bg-yellow-500',
    description: 'Bifurcar baseado em condição',
    category: 'logic',
  },
  {
    type: 'delay',
    label: 'Delay',
    icon: <Clock className="w-4 h-4" />,
    color: 'bg-orange-500',
    description: 'Aguardar tempo antes de continuar',
    category: 'logic',
  },
  {
    type: 'action',
    label: 'Ação',
    icon: <Zap className="w-4 h-4" />,
    color: 'bg-purple-500',
    description: 'Executar ação (tag, webhook, etc)',
    category: 'action',
  },
  {
    type: 'ai',
    label: 'KLOEL IA',
    icon: <Brain className="w-4 h-4" />,
    color: 'bg-indigo-500',
    description: 'Processar com inteligência artificial',
    category: 'ai',
  },
  {
    type: 'end',
    label: 'Fim',
    icon: <Flag className="w-4 h-4" />,
    color: 'bg-red-500',
    description: 'Finalizar ou redirecionar fluxo',
    category: 'trigger',
  },
];

const categories = {
  trigger: { label: 'Gatilhos', color: 'text-emerald-600' },
  message: { label: 'Mensagens', color: 'text-green-600' },
  logic: { label: 'Lógica', color: 'text-yellow-600' },
  action: { label: 'Ações', color: 'text-purple-600' },
  ai: { label: 'Inteligência Artificial', color: 'text-indigo-600' },
};

export function FlowSidebar() {
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['trigger', 'message', 'logic', 'action', 'ai'])
  );

  const onDragStart = (event: DragEvent<HTMLDivElement>, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const filteredNodes = nodeTypes.filter(node => 
    node.label.toLowerCase().includes(search.toLowerCase()) ||
    node.description.toLowerCase().includes(search.toLowerCase())
  );

  const groupedNodes = Object.keys(categories).reduce((acc, category) => {
    acc[category] = filteredNodes.filter(node => node.category === category);
    return acc;
  }, {} as Record<string, NodeType[]>);

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Componentes</h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar componentes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {Object.entries(categories).map(([categoryKey, categoryInfo]) => {
          const nodes = groupedNodes[categoryKey];
          if (!nodes || nodes.length === 0) return null;

          return (
            <div key={categoryKey} className="mb-2">
              <button
                onClick={() => toggleCategory(categoryKey)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-md"
              >
                <span className={categoryInfo.color}>{categoryInfo.label}</span>
                <ChevronDown 
                  className={`w-4 h-4 transition-transform ${
                    expandedCategories.has(categoryKey) ? 'rotate-0' : '-rotate-90'
                  }`} 
                />
              </button>

              {expandedCategories.has(categoryKey) && (
                <div className="mt-1 space-y-1">
                  {nodes.map((node) => (
                    <div
                      key={node.type}
                      className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg cursor-grab hover:bg-gray-100 transition-colors active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => onDragStart(e, node.type)}
                    >
                      <div className={`p-2 rounded-md ${node.color} text-white`}>
                        {node.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800">
                          {node.label}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {node.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          Arraste componentes para o canvas
        </p>
      </div>
    </div>
  );
}
