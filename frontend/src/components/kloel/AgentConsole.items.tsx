'use client';

import type { ElementType } from 'react';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { Loader2, TrendingUp } from 'lucide-react';
import type { AgentActivity } from './AgentConsole.types';
import { ACTIVITY_CONFIG, formatTimeAgo } from './AgentConsole.types';

interface ActivityItemProps {
  activity: AgentActivity;
}

function ActivityItem({ activity }: ActivityItemProps) {
  const config = ACTIVITY_CONFIG[activity.type];
  const Icon = config.icon;

  return (
    <div
      className="flex gap-3 p-3 rounded-lg transition-colors hover:bg-white/5"
      style={{
        backgroundColor: activity.status === 'pending' ? `${colors.brand.cyan}08` : 'transparent',
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
          <span className="font-medium text-sm leading-snug" style={{ color: colors.text.primary }}>
            {activity.title}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {activity.status === 'pending' && (
              <Loader2
                size={12}
                className="animate-spin"
                style={{ color: colors.brand.cyan }}
                aria-hidden="true"
              />
            )}
            <span className="text-xs" style={{ color: colors.text.muted }}>
              {formatTimeAgo(activity.timestamp)}
            </span>
          </div>
        </div>

        {activity.description && (
          <p
            className="mt-1 whitespace-pre-line text-xs leading-relaxed"
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
            {kloelT(`&ldquo;`)}
            {activity.metadata.messagePreview}
            {kloelT(`&rdquo;`)}
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ElementType;
  trend?: 'up' | 'down' | 'neutral';
}

function StatCard({ label, value, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="p-3 rounded-lg" style={{ backgroundColor: colors.background.surface2 }}>
      <div className="flex items-center justify-between mb-1">
        <Icon size={14} style={{ color: colors.text.muted }} />
        {trend === 'up' && (
          <TrendingUp size={12} style={{ color: colors.state.success }} aria-hidden="true" />
        )}
      </div>
      <div className="text-lg font-semibold" style={{ color: colors.text.primary }}>
        {value}
      </div>
      <div className="text-xs" style={{ color: colors.text.muted }}>
        {label}
      </div>
    </div>
  );
}

export { ActivityItem, StatCard };
