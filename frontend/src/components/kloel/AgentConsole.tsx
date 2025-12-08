'use client';

/**
 * ============================================
 * AGENT CONSOLE
 * ============================================
 * Painel lateral que mostra a atividade do agente em tempo real.
 * "O usuário vê o que o cérebro está fazendo."
 * 
 * Features:
 * - Live feed de atividades do agente
 * - Status de conexão com WhatsApp
 * - Métricas em tempo real
 * - Actions logs (envios, respostas, decisões)
 * - "Thinking" indicator quando agente está processando
 * ============================================
 */

import { useState, useEffect, useRef } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Bot,
  MessageSquare,
  Zap,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Send,
  ArrowRight,
  Brain,
  Wifi,
  WifiOff,
  Activity,
  TrendingUp,
  Users,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { colors, radius, shadows, motion } from '@/lib/design-tokens';

// ============================================
// TYPES
// ============================================

export type ActivityType = 
  | 'message_received'
  | 'message_sent'
  | 'action_executed'
  | 'lead_qualified'
  | 'follow_up_scheduled'
  | 'agent_thinking'
  | 'error'
  | 'connection_status';

export type ActivityStatus = 'pending' | 'success' | 'error';

export interface AgentActivity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: Date;
  status: ActivityStatus;
  metadata?: {
    contactName?: string;
    contactPhone?: string;
    messagePreview?: string;
    actionType?: string;
    leadScore?: number;
    scheduledFor?: Date;
    errorMessage?: string;
  };
}

export interface AgentStats {
  messagesReceived: number;
  messagesSent: number;
  actionsExecuted: number;
  leadsQualified: number;
  activeConversations: number;
  avgResponseTime: string;
}

export interface AgentConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
  activities?: AgentActivity[];
  stats?: AgentStats;
  isConnected?: boolean;
  isThinking?: boolean;
  className?: string;
}

// ============================================
// ACTIVITY CONFIG
// ============================================

const ACTIVITY_CONFIG: Record<ActivityType, {
  icon: React.ElementType;
  color: string;
  label: string;
}> = {
  message_received: {
    icon: MessageSquare,
    color: colors.brand.cyan,
    label: 'Mensagem Recebida',
  },
  message_sent: {
    icon: Send,
    color: colors.brand.green,
    label: 'Mensagem Enviada',
  },
  action_executed: {
    icon: Zap,
    color: colors.state.warning,
    label: 'Ação Executada',
  },
  lead_qualified: {
    icon: Users,
    color: colors.brand.green,
    label: 'Lead Qualificado',
  },
  follow_up_scheduled: {
    icon: Clock,
    color: colors.brand.cyan,
    label: 'Follow-up Agendado',
  },
  agent_thinking: {
    icon: Brain,
    color: colors.text.secondary,
    label: 'Processando',
  },
  error: {
    icon: AlertCircle,
    color: colors.state.error,
    label: 'Erro',
  },
  connection_status: {
    icon: Wifi,
    color: colors.text.secondary,
    label: 'Status de Conexão',
  },
};

const STATUS_ICONS: Record<ActivityStatus, React.ElementType> = {
  pending: Loader2,
  success: CheckCircle,
  error: AlertCircle,
};

// ============================================
// MOCK DATA
// ============================================

const MOCK_ACTIVITIES: AgentActivity[] = [
  {
    id: '1',
    type: 'message_received',
    title: 'Nova mensagem',
    description: 'João Silva enviou uma mensagem',
    timestamp: new Date(Date.now() - 30000),
    status: 'success',
    metadata: {
      contactName: 'João Silva',
      messagePreview: 'Olá, gostaria de saber mais sobre...',
    },
  },
  {
    id: '2',
    type: 'agent_thinking',
    title: 'Analisando contexto',
    description: 'Processando intenção e histórico',
    timestamp: new Date(Date.now() - 25000),
    status: 'pending',
  },
  {
    id: '3',
    type: 'message_sent',
    title: 'Resposta enviada',
    description: 'Resposta gerada e enviada com sucesso',
    timestamp: new Date(Date.now() - 20000),
    status: 'success',
    metadata: {
      contactName: 'João Silva',
      messagePreview: 'Claro! Nosso produto X é perfeito para...',
    },
  },
  {
    id: '4',
    type: 'lead_qualified',
    title: 'Lead qualificado',
    description: 'Score: 85 - Alta probabilidade',
    timestamp: new Date(Date.now() - 15000),
    status: 'success',
    metadata: {
      contactName: 'Maria Santos',
      leadScore: 85,
    },
  },
  {
    id: '5',
    type: 'follow_up_scheduled',
    title: 'Follow-up agendado',
    description: 'Agendado para amanhã às 10:00',
    timestamp: new Date(Date.now() - 10000),
    status: 'success',
    metadata: {
      contactName: 'Pedro Costa',
      scheduledFor: new Date(Date.now() + 86400000),
    },
  },
];

const MOCK_STATS: AgentStats = {
  messagesReceived: 142,
  messagesSent: 138,
  actionsExecuted: 47,
  leadsQualified: 12,
  activeConversations: 8,
  avgResponseTime: '< 2s',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds}s atrás`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m atrás`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h atrás`;
  return `${Math.floor(seconds / 86400)}d atrás`;
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface ActivityItemProps {
  activity: AgentActivity;
}

function ActivityItem({ activity }: ActivityItemProps) {
  const config = ACTIVITY_CONFIG[activity.type];
  const Icon = config.icon;
  const StatusIcon = STATUS_ICONS[activity.status];
  
  return (
    <div 
      className="flex gap-3 p-3 rounded-lg transition-colors hover:bg-white/5"
      style={{ 
        backgroundColor: activity.status === 'pending' 
          ? `${colors.brand.cyan}08` 
          : 'transparent',
      }}
    >
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ 
          backgroundColor: `${config.color}15`,
        }}
      >
        <Icon size={16} style={{ color: config.color }} />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span 
            className="font-medium text-sm truncate"
            style={{ color: colors.text.primary }}
          >
            {activity.title}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {activity.status === 'pending' && (
              <Loader2 
                size={12} 
                className="animate-spin" 
                style={{ color: colors.brand.cyan }} 
              />
            )}
            <span 
              className="text-xs"
              style={{ color: colors.text.muted }}
            >
              {formatTimeAgo(activity.timestamp)}
            </span>
          </div>
        </div>
        
        {activity.description && (
          <p 
            className="text-xs mt-0.5 truncate"
            style={{ color: colors.text.secondary }}
          >
            {activity.description}
          </p>
        )}
        
        {/* Message preview */}
        {activity.metadata?.messagePreview && (
          <div 
            className="mt-1.5 px-2 py-1 rounded text-xs"
            style={{ 
              backgroundColor: colors.background.surface2,
              color: colors.text.muted,
            }}
          >
            "{activity.metadata.messagePreview}"
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}

function StatCard({ label, value, icon: Icon, trend }: StatCardProps) {
  return (
    <div 
      className="p-3 rounded-lg"
      style={{ backgroundColor: colors.background.surface2 }}
    >
      <div className="flex items-center justify-between mb-1">
        <Icon size={14} style={{ color: colors.text.muted }} />
        {trend === 'up' && (
          <TrendingUp size={12} style={{ color: colors.state.success }} />
        )}
      </div>
      <div 
        className="text-lg font-semibold"
        style={{ color: colors.text.primary }}
      >
        {value}
      </div>
      <div 
        className="text-xs"
        style={{ color: colors.text.muted }}
      >
        {label}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function AgentConsole({
  isOpen,
  onClose,
  onToggle,
  activities = MOCK_ACTIVITIES,
  stats = MOCK_STATS,
  isConnected = true,
  isThinking = false,
  className,
}: AgentConsoleProps) {
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new activities
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [activities]);

  const filteredActivities = filter === 'all' 
    ? activities 
    : activities.filter(a => a.type === filter);

  return (
    <>
      {/* Collapsed Toggle Button */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed right-0 top-1/2 -translate-y-1/2 p-2 rounded-l-lg shadow-lg transition-all hover:pr-4"
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${colors.stroke}`,
            borderRight: 'none',
            zIndex: 40,
          }}
        >
          <div className="flex items-center gap-2">
            <ChevronLeft size={16} style={{ color: colors.text.secondary }} />
            <Bot 
              size={20} 
              style={{ 
                color: isThinking ? colors.brand.cyan : colors.brand.green 
              }} 
              className={isThinking ? 'animate-pulse' : ''}
            />
            {isThinking && (
              <span 
                className="text-xs font-medium"
                style={{ color: colors.brand.cyan }}
              >
                Pensando...
              </span>
            )}
          </div>
        </button>
      )}

      {/* Panel */}
      <aside
        className={cn(
          'fixed top-0 right-0 h-full flex flex-col transition-transform duration-200',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          className
        )}
        style={{
          width: 340,
          backgroundColor: colors.background.surface1,
          borderLeft: `1px solid ${colors.stroke}`,
          zIndex: 45,
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${colors.stroke}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ 
                backgroundColor: `${colors.brand.green}15`,
              }}
            >
              <Bot 
                size={20} 
                style={{ color: colors.brand.green }} 
                className={isThinking ? 'animate-pulse' : ''}
              />
            </div>
            <div>
              <h2 
                className="font-semibold text-sm"
                style={{ color: colors.text.primary }}
              >
                Agent Console
              </h2>
              <div className="flex items-center gap-1.5">
                {isConnected ? (
                  <>
                    <div 
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: colors.state.success }}
                    />
                    <span 
                      className="text-xs"
                      style={{ color: colors.text.muted }}
                    >
                      Conectado
                    </span>
                  </>
                ) : (
                  <>
                    <WifiOff size={10} style={{ color: colors.state.error }} />
                    <span 
                      className="text-xs"
                      style={{ color: colors.state.error }}
                    >
                      Desconectado
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: colors.text.muted }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats Grid */}
        <div 
          className="p-3 grid grid-cols-3 gap-2"
          style={{ borderBottom: `1px solid ${colors.stroke}` }}
        >
          <StatCard 
            label="Recebidas" 
            value={stats.messagesReceived} 
            icon={MessageSquare}
            trend="up"
          />
          <StatCard 
            label="Enviadas" 
            value={stats.messagesSent} 
            icon={Send}
          />
          <StatCard 
            label="Ações" 
            value={stats.actionsExecuted} 
            icon={Zap}
          />
        </div>

        {/* Quick Stats Bar */}
        <div 
          className="flex items-center justify-between px-4 py-2"
          style={{ 
            backgroundColor: colors.background.surface2,
            borderBottom: `1px solid ${colors.stroke}`,
          }}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Users size={12} style={{ color: colors.text.muted }} />
              <span 
                className="text-xs font-medium"
                style={{ color: colors.text.secondary }}
              >
                {stats.activeConversations} ativas
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={12} style={{ color: colors.text.muted }} />
              <span 
                className="text-xs font-medium"
                style={{ color: colors.text.secondary }}
              >
                {stats.avgResponseTime}
              </span>
            </div>
          </div>
          <div 
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${colors.brand.green}15`,
              color: colors.brand.green,
            }}
          >
            {stats.leadsQualified} leads
          </div>
        </div>

        {/* Thinking Indicator */}
        {isThinking && (
          <div 
            className="flex items-center gap-2 px-4 py-2"
            style={{ 
              backgroundColor: `${colors.brand.cyan}10`,
              borderBottom: `1px solid ${colors.stroke}`,
            }}
          >
            <Brain 
              size={16} 
              className="animate-pulse" 
              style={{ color: colors.brand.cyan }} 
            />
            <span 
              className="text-sm font-medium"
              style={{ color: colors.brand.cyan }}
            >
              Agente processando...
            </span>
            <div className="flex gap-1 ml-auto">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ 
                    backgroundColor: colors.brand.cyan,
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div 
          className="flex items-center gap-1 px-3 py-2 overflow-x-auto"
          style={{ borderBottom: `1px solid ${colors.stroke}` }}
        >
          <button
            onClick={() => setFilter('all')}
            className="px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: filter === 'all' ? colors.background.surface2 : 'transparent',
              color: filter === 'all' ? colors.text.primary : colors.text.muted,
            }}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter('message_received')}
            className="px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: filter === 'message_received' ? colors.background.surface2 : 'transparent',
              color: filter === 'message_received' ? colors.text.primary : colors.text.muted,
            }}
          >
            Recebidas
          </button>
          <button
            onClick={() => setFilter('message_sent')}
            className="px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: filter === 'message_sent' ? colors.background.surface2 : 'transparent',
              color: filter === 'message_sent' ? colors.text.primary : colors.text.muted,
            }}
          >
            Enviadas
          </button>
          <button
            onClick={() => setFilter('action_executed')}
            className="px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: filter === 'action_executed' ? colors.background.surface2 : 'transparent',
              color: filter === 'action_executed' ? colors.text.primary : colors.text.muted,
            }}
          >
            Ações
          </button>
        </div>

        {/* Activity Feed */}
        <div 
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-1"
        >
          {filteredActivities.length === 0 ? (
            <div 
              className="flex flex-col items-center justify-center h-full text-center p-4"
              style={{ color: colors.text.muted }}
            >
              <Activity size={32} className="mb-2 opacity-50" />
              <p className="text-sm">Nenhuma atividade</p>
              <p className="text-xs mt-1">As ações do agente aparecerão aqui</p>
            </div>
          ) : (
            filteredActivities.map(activity => (
              <ActivityItem key={activity.id} activity={activity} />
            ))
          )}
        </div>

        {/* Footer */}
        <div 
          className="px-4 py-3 flex items-center justify-between"
          style={{ 
            borderTop: `1px solid ${colors.stroke}`,
            backgroundColor: colors.background.surface2,
          }}
        >
          <span 
            className="text-xs"
            style={{ color: colors.text.muted }}
          >
            {filteredActivities.length} atividade(s)
          </span>
          <button
            className="text-xs font-medium transition-colors hover:underline"
            style={{ color: colors.brand.cyan }}
          >
            Ver histórico completo
          </button>
        </div>
      </aside>

      {/* Backdrop on mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 lg:hidden"
          style={{ 
            backgroundColor: colors.background.obsidian + 'cc',
            zIndex: 44,
          }}
          onClick={onClose}
        />
      )}
    </>
  );
}

// ============================================
// HOOK FOR USING AGENT CONSOLE
// ============================================

export function useAgentConsole() {
  const [isOpen, setIsOpen] = useState(false);
  
  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
    consoleProps: {
      isOpen,
      onClose: () => setIsOpen(false),
      onToggle: () => setIsOpen(prev => !prev),
    },
  };
}

export default AgentConsole;
