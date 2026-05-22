'use client';
import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import type { ActivityType } from './AgentConsole.types';

export function AgentFilterTabs({
  filter,
  onFilterChange,
}: {
  filter: ActivityType | 'all';
  onFilterChange: (filter: ActivityType | 'all') => void;
}) {
  const tabs: Array<{ key: ActivityType | 'all'; label: string }> = [
    { key: 'all', label: kloelT(`Todos`) },
    { key: 'message_received', label: kloelT(`Recebidas`) },
    { key: 'message_sent', label: kloelT(`Enviadas`) },
    { key: 'action_executed', label: kloelT(`Ações`) },
  ];

  return (
    <div
      className="flex items-center gap-1 px-3 py-2 overflow-x-auto"
      style={{ borderBottom: `1px solid ${colors.stroke}` }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onFilterChange(tab.key)}
          className="px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
          style={{
            backgroundColor: filter === tab.key ? colors.background.surface2 : 'transparent',
            color: filter === tab.key ? colors.text.primary : colors.text.muted,
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
