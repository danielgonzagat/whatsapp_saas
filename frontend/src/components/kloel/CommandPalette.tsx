'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
  Smartphone,
  FileText,
  Package,
  Users,
  Zap,
  Bot,
  CreditCard,
  Settings,
  Activity,
  Terminal,
  Route,
  BarChart3,
  MessageSquare,
  ArrowRight,
  Check,
  AlertTriangle,
  Command,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, radius, shadows, motion } from '@/lib/design-tokens';

// ============================================
// TYPES
// ============================================

export type CommandType = 'fill_chat' | 'execute' | 'execute_gate' | 'navigate';
export type CommandRisk = 'auto' | 'confirm' | 'sensitive';
export type CommandCategory = 'actions' | 'navigate' | 'create' | 'autopilot' | 'diagnostic' | 'advanced';

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon?: React.ElementType;
  type: CommandType;
  risk: CommandRisk;
  category: CommandCategory;
  prompt?: string; // For fill_chat type
  action?: () => void; // For execute type
  href?: string; // For navigate type
  keywords?: string[];
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (command: CommandItem) => void;
  commands?: CommandItem[];
  initialCategory?: CommandCategory;
  initialSearch?: string;
  className?: string;
}

// ============================================
// DEFAULT COMMANDS
// ============================================

const DEFAULT_COMMANDS: CommandItem[] = [
  // Actions
  {
    id: 'connect-whatsapp',
    title: 'Conectar WhatsApp',
    description: 'Conecte seu número via QR Code',
    icon: Smartphone,
    type: 'execute_gate',
    risk: 'confirm',
    category: 'actions',
    prompt: 'Quero conectar meu WhatsApp agora',
    keywords: ['whatsapp', 'conectar', 'qr', 'número'],
  },
  {
    id: 'import-products-pdf',
    title: 'Importar produtos via PDF',
    description: 'Envie seu catálogo em PDF',
    icon: FileText,
    type: 'fill_chat',
    risk: 'auto',
    category: 'actions',
    prompt: 'Quero ensinar meus produtos via PDF. Vou anexar o catálogo.',
    keywords: ['produtos', 'pdf', 'catálogo', 'importar'],
  },
  {
    id: 'import-leads',
    title: 'Importar leads (planilha)',
    description: 'Importe sua lista de contatos',
    icon: Users,
    type: 'fill_chat',
    risk: 'auto',
    category: 'actions',
    prompt: 'Quero importar minha lista de leads via planilha',
    keywords: ['leads', 'importar', 'planilha', 'contatos'],
  },
  {
    id: 'search-leads-maps',
    title: 'Buscar leads no Maps',
    description: 'Encontre empresas por localização',
    icon: Users,
    type: 'fill_chat',
    risk: 'auto',
    category: 'actions',
    prompt: 'Busque leads para mim no Google Maps',
    keywords: ['leads', 'maps', 'buscar', 'google'],
  },
  {
    id: 'create-campaign',
    title: 'Criar campanha de reativação',
    description: 'Money Machine - reative leads frios',
    icon: Zap,
    type: 'execute_gate',
    risk: 'sensitive',
    category: 'actions',
    prompt: 'Crie uma campanha de reativação (Money Machine) para meus leads frios',
    keywords: ['campanha', 'reativação', 'money', 'machine'],
  },
  {
    id: 'create-flow',
    title: 'Criar fluxo de automação',
    description: 'Boas-vindas, objeção, follow-up',
    icon: Route,
    type: 'fill_chat',
    risk: 'auto',
    category: 'create',
    prompt: 'Crie um fluxo de automação para mim',
    keywords: ['fluxo', 'automação', 'criar'],
  },
  {
    id: 'create-payment-link',
    title: 'Criar link de pagamento',
    description: 'Gere um link Pix/boleto/cartão',
    icon: CreditCard,
    type: 'execute_gate',
    risk: 'sensitive',
    category: 'create',
    prompt: 'Gere um link de pagamento para enviar ao cliente',
    keywords: ['pagamento', 'pix', 'link', 'boleto'],
  },
  
  // Autopilot
  {
    id: 'activate-autopilot',
    title: 'Ativar Autopilot (modo seguro)',
    description: 'IA assume atendimento com limites baixos',
    icon: Bot,
    type: 'execute_gate',
    risk: 'confirm',
    category: 'autopilot',
    prompt: 'Ative o Autopilot em modo seguro para mim',
    keywords: ['autopilot', 'ativar', 'ia', 'automático'],
  },
  {
    id: 'pause-autopilot',
    title: 'Pausar Autopilot',
    description: 'Pause temporariamente a automação',
    icon: Bot,
    type: 'execute',
    risk: 'auto',
    category: 'autopilot',
    keywords: ['autopilot', 'pausar', 'parar'],
  },
  {
    id: 'adjust-limits',
    title: 'Ajustar limites do Autopilot',
    description: 'Configure janela e limites de envio',
    icon: Settings,
    type: 'fill_chat',
    risk: 'auto',
    category: 'autopilot',
    prompt: 'Quero ajustar os limites do Autopilot',
    keywords: ['limites', 'ajustar', 'configurar'],
  },
  
  // Navigate
  {
    id: 'go-dashboard',
    title: 'Ir para Dashboard',
    icon: BarChart3,
    type: 'navigate',
    risk: 'auto',
    category: 'navigate',
    href: '/dashboard',
    keywords: ['dashboard', 'início', 'home'],
  },
  {
    id: 'go-leads',
    title: 'Ir para Leads',
    icon: Users,
    type: 'navigate',
    risk: 'auto',
    category: 'navigate',
    href: '/leads',
    keywords: ['leads', 'contatos'],
  },
  {
    id: 'go-sales',
    title: 'Ir para Vendas',
    icon: CreditCard,
    type: 'navigate',
    risk: 'auto',
    category: 'navigate',
    href: '/sales',
    keywords: ['vendas', 'pagamentos'],
  },
  {
    id: 'go-flows',
    title: 'Ir para Flow Builder',
    icon: Route,
    type: 'navigate',
    risk: 'auto',
    category: 'navigate',
    href: '/flow',
    keywords: ['flows', 'fluxos', 'builder'],
  },
  {
    id: 'go-whatsapp',
    title: 'Ir para WhatsApp',
    icon: MessageSquare,
    type: 'navigate',
    risk: 'auto',
    category: 'navigate',
    href: '/whatsapp',
    keywords: ['whatsapp', 'mensagens'],
  },
  
  // Diagnostic
  {
    id: 'check-whatsapp-status',
    title: 'Status do WhatsApp',
    description: 'Verificar conexão e saúde',
    icon: Activity,
    type: 'execute',
    risk: 'auto',
    category: 'diagnostic',
    prompt: 'Verifique o status do meu WhatsApp',
    keywords: ['status', 'whatsapp', 'conexão'],
  },
  {
    id: 'check-errors',
    title: 'Erros recentes',
    description: 'Ver problemas e soluções',
    icon: AlertTriangle,
    type: 'execute',
    risk: 'auto',
    category: 'diagnostic',
    prompt: 'Mostre os erros recentes do sistema',
    keywords: ['erros', 'problemas', 'falhas'],
  },
  {
    id: 'check-limits',
    title: 'Ver limites e uso',
    description: 'Rate limits e franquia',
    icon: BarChart3,
    type: 'execute',
    risk: 'auto',
    category: 'diagnostic',
    prompt: 'Mostre meus limites e uso atual',
    keywords: ['limites', 'uso', 'franquia'],
  },
  
  // Advanced
  {
    id: 'open-console',
    title: 'Abrir Agent Console',
    description: 'Logs, filas e métricas avançadas',
    icon: Terminal,
    type: 'navigate',
    risk: 'auto',
    category: 'advanced',
    href: '/console',
    keywords: ['console', 'logs', 'avançado'],
  },
];

// ============================================
// CATEGORY CONFIG
// ============================================

const CATEGORY_CONFIG: Record<CommandCategory, { label: string; order: number }> = {
  actions: { label: 'Ações', order: 1 },
  navigate: { label: 'Ir para', order: 2 },
  create: { label: 'Criar', order: 3 },
  autopilot: { label: 'Autopilot', order: 4 },
  diagnostic: { label: 'Diagnóstico', order: 5 },
  advanced: { label: 'Avançado', order: 6 },
};

const RISK_BADGES: Record<CommandRisk, { label: string; color: string }> = {
  auto: { label: 'Auto', color: colors.state.success },
  confirm: { label: 'Confirma', color: colors.state.warning },
  sensitive: { label: 'Sensível', color: colors.state.error },
};

// ============================================
// COMPONENT
// ============================================

export function CommandPalette({
  open,
  onClose,
  onSelect,
  commands = DEFAULT_COMMANDS,
  initialCategory,
  initialSearch,
  className,
}: CommandPaletteProps) {
  const [search, setSearch] = useState(initialSearch || '');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<CommandCategory | 'all'>(initialCategory || 'all');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setSearch(initialSearch || '');
      setActiveCategory(initialCategory || 'all');
      setSelectedIndex(0);
    }
  }, [open, initialCategory, initialSearch]);

  // Filter and group commands
  const filteredCommands = useMemo(() => {
    let filtered = commands;
    
    // Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter(cmd => cmd.category === activeCategory);
    }
    
    // Filter by search
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(cmd => 
        cmd.title.toLowerCase().includes(searchLower) ||
        cmd.description?.toLowerCase().includes(searchLower) ||
        cmd.keywords?.some(k => k.toLowerCase().includes(searchLower))
      );
    }
    
    // Sort by category order
    return filtered.sort((a, b) => 
      CATEGORY_CONFIG[a.category].order - CATEGORY_CONFIG[b.category].order
    );
  }, [commands, search, activeCategory]);

  // Group by category for display
  const groupedCommands = useMemo(() => {
    const groups: Record<CommandCategory, CommandItem[]> = {
      actions: [],
      navigate: [],
      create: [],
      autopilot: [],
      diagnostic: [],
      advanced: [],
    };
    
    filteredCommands.forEach(cmd => {
      groups[cmd.category].push(cmd);
    });
    
    return groups;
  }, [filteredCommands]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          onSelect(filteredCommands[selectedIndex]);
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredCommands, selectedIndex, onSelect, onClose]);

  // Scroll selected into view
  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector(`[data-index="${selectedIndex}"]`);
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Close on global ESC (Ctrl+K handled by hook)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-50"
        style={{ backgroundColor: colors.background.obsidian + 'cc' }}
        onClick={onClose}
      />
      
      {/* Palette */}
      <div
        className={cn(
          'fixed top-1/4 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50',
          'rounded-2xl overflow-hidden',
          className
        )}
        style={{
          backgroundColor: colors.background.surface1,
          border: `1px solid ${colors.stroke}`,
          boxShadow: shadows.elevated,
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: colors.stroke }}
        >
          <Search size={20} style={{ color: colors.text.muted }} />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Buscar ações, leads, flows, conversas…"
            className="flex-1 bg-transparent outline-none text-base"
            style={{ color: colors.text.primary }}
          />
          <kbd 
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ 
              backgroundColor: colors.background.surface2,
              color: colors.text.muted,
            }}
          >
            ESC
          </kbd>
        </div>
        
        {/* Category Chips */}
        <div
          className="flex items-center gap-2 px-4 py-2 border-b overflow-x-auto"
          style={{ borderColor: colors.stroke }}
        >
          <button
            onClick={() => setActiveCategory('all')}
            className="px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: activeCategory === 'all' 
                ? colors.brand.green + '20' 
                : 'transparent',
              color: activeCategory === 'all' 
                ? colors.brand.green 
                : colors.text.secondary,
              border: `1px solid ${activeCategory === 'all' ? colors.brand.green : colors.stroke}`,
            }}
          >
            Todos
          </button>
          {Object.entries(CATEGORY_CONFIG).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key as CommandCategory)}
              className="px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                backgroundColor: activeCategory === key 
                  ? colors.brand.green + '20' 
                  : 'transparent',
                color: activeCategory === key 
                  ? colors.brand.green 
                  : colors.text.secondary,
                border: `1px solid ${activeCategory === key ? colors.brand.green : colors.stroke}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        
        {/* Results */}
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto py-2"
        >
          {filteredCommands.length === 0 ? (
            <div 
              className="px-4 py-8 text-center"
              style={{ color: colors.text.muted }}
            >
              Nenhum comando encontrado
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, items]) => {
              if (items.length === 0) return null;
              
              return (
                <div key={category} className="mb-2">
                  <div 
                    className="px-4 py-1 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: colors.text.muted }}
                  >
                    {CATEGORY_CONFIG[category as CommandCategory].label}
                  </div>
                  {items.map((cmd) => {
                    const globalIndex = filteredCommands.indexOf(cmd);
                    const Icon = cmd.icon || Command;
                    const isSelected = globalIndex === selectedIndex;
                    
                    return (
                      <button
                        key={cmd.id}
                        data-index={globalIndex}
                        onClick={() => {
                          onSelect(cmd);
                          onClose();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                        style={{
                          backgroundColor: isSelected 
                            ? colors.background.surface2 
                            : 'transparent',
                        }}
                      >
                        <div
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: colors.background.surface2 }}
                        >
                          <Icon size={18} style={{ color: colors.text.secondary }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div 
                            className="font-medium truncate"
                            style={{ color: colors.text.primary }}
                          >
                            {cmd.title}
                          </div>
                          {cmd.description && (
                            <div 
                              className="text-sm truncate"
                              style={{ color: colors.text.muted }}
                            >
                              {cmd.description}
                            </div>
                          )}
                        </div>
                        {cmd.risk !== 'auto' && (
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: RISK_BADGES[cmd.risk].color + '20',
                              color: RISK_BADGES[cmd.risk].color,
                            }}
                          >
                            {RISK_BADGES[cmd.risk].label}
                          </span>
                        )}
                        <ArrowRight 
                          size={16} 
                          style={{ color: colors.text.muted }}
                          className={isSelected ? 'opacity-100' : 'opacity-0'}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        
        {/* Hint Bar */}
        <div
          className="flex items-center justify-between px-4 py-2 border-t text-xs"
          style={{ 
            borderColor: colors.stroke,
            color: colors.text.muted,
          }}
        >
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.background.surface2 }}>↑↓</kbd>
              Navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.background.surface2 }}>Enter</kbd>
              Executar
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.background.surface2 }}>⌘K</kbd>
            Fechar
          </span>
        </div>
      </div>
    </>
  );
}

export default CommandPalette;
