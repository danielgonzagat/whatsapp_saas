'use client';

import { type ChannelFilter, type StatusFilter } from '../inbox-workspace-utils';

interface InboxConversationFiltersProps {
  channelFilter: ChannelFilter;
  setChannelFilter: (value: ChannelFilter) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
}

export function InboxConversationFilters({
  channelFilter,
  setChannelFilter,
  statusFilter,
  setStatusFilter,
}: InboxConversationFiltersProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--bg-border)] px-[var(--inbox-panel-x)] py-[calc(var(--inbox-chip-y)+2px)]">
        {(
          [
            ['all', 'Todos'],
            ['whatsapp', 'WhatsApp'],
            ['email', 'Email'],
            ['instagram', 'Instagram'],
            ['facebook', 'Facebook'],
            ['tiktok', 'TikTok'],
          ] as [ChannelFilter, string][]
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            onClick={() => setChannelFilter(value)}
            className={`rounded-[calc(var(--inbox-radius)-10px)] px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-semibold transition-colors ${
              channelFilter === value
                ? 'bg-[var(--ember-primary)] text-[var(--bg-void)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-silver)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--bg-border)] px-[var(--inbox-panel-x)] py-[calc(var(--inbox-chip-y)+2px)]">
        {(
          [
            ['open', 'Abertas'],
            ['closed', 'Fechadas'],
            ['all', 'Todas'],
          ] as [StatusFilter, string][]
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`rounded-[calc(var(--inbox-radius)-10px)] px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-semibold transition-colors ${
              statusFilter === value
                ? 'bg-[var(--ember-primary)] text-[var(--bg-void)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-silver)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
