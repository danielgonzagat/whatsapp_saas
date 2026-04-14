'use client';

import {
  AlertTriangle,
  CreditCard,
  MessageSquare,
  Send,
  ShoppingCart,
  Smartphone,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { AgentActivity } from '../AgentConsole';
import { SettingsCard, kloelSettingsClass } from './contract';

interface ActivityItem {
  id: string;
  type: 'response' | 'sent' | 'error' | 'sale' | 'checkout_click' | 'reconnect' | 'low_credits';
  message: string;
  time: string;
}

interface ActivitySectionProps {
  activities?: AgentActivity[];
}

function formatRelativeTime(date: Date) {
  const delta = Math.max(0, Date.now() - date.getTime());
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return 'Agora mesmo';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min atras`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h atras`;
  return `${Math.floor(seconds / 86400)} dia(s) atras`;
}

function normalizeActivities(activities?: AgentActivity[]): ActivityItem[] {
  if (!activities || activities.length === 0) {
    return [];
  }

  return activities
    .slice(-12)
    .reverse()
    .map((activity) => {
      let type: ActivityItem['type'] = 'response';
      if (activity.type === 'message_sent') type = 'sent';
      if (activity.type === 'error') type = 'error';
      if (activity.type === 'lead_qualified') type = 'sale';
      if (activity.type === 'connection_status') type = 'reconnect';
      if (activity.type === 'follow_up_scheduled') type = 'checkout_click';

      return {
        id: activity.id,
        type,
        message: activity.description || activity.title,
        time: formatRelativeTime(activity.timestamp),
      };
    });
}

export function ActivitySection({ activities }: ActivitySectionProps) {
  const items = normalizeActivities(activities);

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'response':
        return { icon: MessageSquare, bg: 'bg-[#3B82F6]/12', color: 'text-[#93C5FD]' };
      case 'sent':
        return { icon: Send, bg: 'bg-[#E85D30]/12', color: 'text-[#F2B29D]' };
      case 'error':
        return { icon: XCircle, bg: 'bg-[#E05252]/12', color: 'text-[#F7A8A8]' };
      case 'sale':
        return { icon: ShoppingCart, bg: 'bg-[#10B981]/12', color: 'text-[#7FE2BC]' };
      case 'checkout_click':
        return { icon: CreditCard, bg: 'bg-[#3B82F6]/12', color: 'text-[#93C5FD]' };
      case 'reconnect':
        return { icon: Smartphone, bg: 'bg-[#10B981]/12', color: 'text-[#7FE2BC]' };
      case 'low_credits':
        return { icon: AlertTriangle, bg: 'bg-[#E85D30]/12', color: 'text-[#F2B29D]' };
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className={kloelSettingsClass.sectionTitle}>Atividade</h3>
        <p className={`mt-1 ${kloelSettingsClass.sectionDescription}`}>
          Historico de acoes e eventos do Kloel
        </p>
      </div>

      <SettingsCard className="p-6">
        <h4 className="text-sm font-semibold text-[var(--app-text-primary)]">Acessos rapidos</h4>
        <p className="mt-1 text-xs text-[var(--app-text-secondary)]">Operacoes do produto</p>
        <div className="mt-4">
          <Link
            href="/inbox"
            className="inline-flex items-center rounded-md border border-[var(--app-accent)] bg-[var(--app-accent)] px-4 py-2 text-sm font-semibold text-[var(--app-text-on-accent)] transition-colors hover:bg-[var(--app-accent-hover)]"
          >
            Abrir Inbox
          </Link>
        </div>
      </SettingsCard>

      <SettingsCard className="p-6">
        <div className="relative">
          <div className="absolute left-[19px] top-0 h-full w-0.5 bg-[var(--app-border-subtle)]" />

          <div className="space-y-4">
            {(items.length > 0
              ? items
              : [
                  {
                    id: 'empty',
                    type: 'response' as const,
                    message: 'O feed real do agente ainda nao gerou eventos nesta sessao.',
                    time: 'Aguardando atividade',
                  },
                ]
            ).map((activity) => {
              const iconData = getActivityIcon(activity.type);
              const Icon = iconData.icon;
              return (
                <div key={activity.id} className="relative flex items-start gap-4 pl-0">
                  <div
                    className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full ${iconData.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${iconData.color}`} />
                  </div>
                  <div className="flex-1 pt-2">
                    <p className="text-sm font-medium text-[var(--app-text-primary)]">
                      {activity.message}
                    </p>
                    <p className="text-xs text-[var(--app-text-secondary)]">{activity.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}
