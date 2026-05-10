'use client';

/**
 * AGENT CONSOLE
 * Painel lateral que mostra a atividade do agente em tempo real.
 */
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';
import {
  Activity,
  Bot,
  Brain,
  ChevronLeft,
  Clock,
  MessageSquare,
  Send,
  Users,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ActivityItem, StatCard } from './AgentConsole.items';
import { AgentFilterTabs } from './AgentConsole.filters';

export type {
  ActivityType,
  ActivityStatus,
  AgentActivity,
  AgentStats,
  AgentConsoleProps,
} from './AgentConsole.types';
import type { AgentConsoleProps } from './AgentConsole.types';
import type { ActivityType, AgentActivity } from './AgentConsole.types';

export function AgentConsole({
  isOpen,
  onClose,
  onToggle,
  activities = [],
  stats = {
    messagesReceived: 0,
    messagesSent: 0,
    actionsExecuted: 0,
    leadsQualified: 0,
    activeConversations: 0,
    avgResponseTime: '--',
  },
  isConnected = true,
  isThinking = false,
  className,
}: AgentConsoleProps) {
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [activities]);

  const filteredActivities =
    filter === 'all' ? activities : activities.filter((a) => a.type === filter);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={onToggle}
          className="fixed right-0 top-1/2 -translate-y-1/2 p-2 rounded-l-md transition-all hover:pr-4"
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${colors.stroke}`,
            borderRight: 'none',
            zIndex: 40,
          }}
        >
          <div className="flex items-center gap-2">
            <ChevronLeft size={16} style={{ color: colors.text.secondary }} aria-hidden="true" />
            <Bot
              size={20}
              style={{
                color: isThinking ? colors.brand.cyan : colors.brand.green,
              }}
              className={isThinking ? 'animate-pulse' : ''}
              aria-hidden="true"
            />
            {isThinking && (
              <span className="text-xs font-medium" style={{ color: colors.brand.cyan }}>
                {kloelT(`Pensando...`)}
              </span>
            )}
          </div>
        </button>
      )}

      <aside
        className={cn(
          'fixed top-0 right-0 h-full flex flex-col transition-transform duration-200',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          className,
        )}
        style={{
          width: 340,
          backgroundColor: colors.background.surface1,
          borderLeft: `1px solid ${colors.stroke}`,
          zIndex: 45,
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${colors.stroke}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${colors.brand.green}15` }}
            >
              <Bot
                size={20}
                style={{ color: colors.brand.green }}
                className={isThinking ? 'animate-pulse' : ''}
                aria-hidden="true"
              />
            </div>
            <div>
              <h2 className="font-semibold text-sm" style={{ color: colors.text.primary }}>
                {kloelT(`Agent Console`)}
              </h2>
              <div className="flex items-center gap-1.5">
                {isConnected ? (
                  <>
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: colors.state.success }}
                    />
                    <span className="text-xs" style={{ color: colors.text.muted }}>
                      {kloelT(`Conectado`)}
                    </span>
                  </>
                ) : (
                  <>
                    <WifiOff size={10} style={{ color: colors.state.error }} aria-hidden="true" />
                    <span className="text-xs" style={{ color: colors.state.error }}>
                      {kloelT(`Desconectado`)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: colors.text.muted }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div
          className="p-3 grid grid-cols-3 gap-2"
          style={{ borderBottom: `1px solid ${colors.stroke}` }}
        >
          <StatCard
            label={kloelT(`Recebidas`)}
            value={stats.messagesReceived}
            icon={MessageSquare}
            trend="up"
          />
          <StatCard label={kloelT(`Enviadas`)} value={stats.messagesSent} icon={Send} />
          <StatCard label={kloelT(`Ações`)} value={stats.actionsExecuted} icon={Zap} />
        </div>

        <div
          className="flex items-center justify-between px-4 py-2"
          style={{
            backgroundColor: colors.background.surface2,
            borderBottom: `1px solid ${colors.stroke}`,
          }}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Users size={12} style={{ color: colors.text.muted }} aria-hidden="true" />
              <span className="text-xs font-medium" style={{ color: colors.text.secondary }}>
                {stats.activeConversations} ativas
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={12} style={{ color: colors.text.muted }} aria-hidden="true" />
              <span className="text-xs font-medium" style={{ color: colors.text.secondary }}>
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
              aria-hidden="true"
            />
            <span className="text-sm font-medium" style={{ color: colors.brand.cyan }}>
              {kloelT(`Agente processando...`)}
            </span>
            <div className="flex gap-1 ml-auto">
              {[0, 1, 2].map((dotIdx) => (
                <div
                  key={`dot-${dotIdx}`}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    backgroundColor: colors.brand.cyan,
                    animationDelay: `${dotIdx * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <AgentFilterTabs filter={filter} onFilterChange={setFilter} />

        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredActivities.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full text-center p-4"
              style={{ color: colors.text.muted }}
            >
              <Activity size={32} className="mb-2 opacity-50" aria-hidden="true" />
              <p className="text-sm">{kloelT(`Nenhuma atividade`)}</p>
              <p className="text-xs mt-1">{kloelT(`As ações do agente aparecerão aqui`)}</p>
            </div>
          ) : (
            filteredActivities.map((activity: AgentActivity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))
          )}
        </div>

        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{
            borderTop: `1px solid ${colors.stroke}`,
            backgroundColor: colors.background.surface2,
          }}
        >
          <span className="text-xs" style={{ color: colors.text.muted }}>
            {filteredActivities.length} {kloelT(`atividade(s)`)}
          </span>
          <button
            type="button"
            className="text-xs font-medium transition-colors hover:underline"
            style={{ color: colors.brand.cyan }}
          >
            {kloelT(`Ver histórico completo`)}
          </button>
        </div>
      </aside>

      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 lg:hidden"
          style={{
            backgroundColor: `color-mix(in srgb, ${colors.background.obsidian} 80%, transparent)`,
            zIndex: 44,
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
          onClick={onClose}
          aria-label="Fechar console"
        />
      )}
    </>
  );
}

export { useAgentConsole } from './AgentConsole.hook';
export default AgentConsole;
