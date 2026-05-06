import type { Conversation } from '@/lib/api';
import { Bot, User as UserIcon } from 'lucide-react';
import { formatInboxTime as formatTime } from '../inbox-workspace-utils';

interface ConversationListItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
}

/** Conversation list item. */
export function ConversationListItem({
  conversation: c,
  isActive,
  onSelect,
}: ConversationListItemProps) {
  const name = c.contact?.name || c.contact?.phone || 'Contato';
  const phone = c.contact?.phone || '';
  const isHandledByHuman = !!c.assignedAgent;

  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      className={`w-full px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)] text-left transition-colors ${isActive ? 'bg-[#19191C]' : 'hover:bg-[#19191C]'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          {isHandledByHuman ? (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-[#E85D30]/15 px-[var(--inbox-chip-x)] py-[2px] text-[length:var(--inbox-body-xs)] font-semibold text-[#E85D30]"
              title={c.assignedAgent?.name || 'Agente'}
            >
              <UserIcon
                style={{
                  width: 'calc(var(--inbox-icon-sm) - 2px)',
                  height: 'calc(var(--inbox-icon-sm) - 2px)',
                }}
                aria-hidden="true"
              />
            </span>
          ) : (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-[var(--inbox-chip-x)] py-[2px] text-[length:var(--inbox-body-xs)] font-semibold text-emerald-400"
              title="IA"
            >
              <Bot
                style={{
                  width: 'calc(var(--inbox-icon-sm) - 2px)',
                  height: 'calc(var(--inbox-icon-sm) - 2px)',
                }}
                aria-hidden="true"
              />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[length:var(--inbox-body)] font-semibold text-[#E0DDD8]">
              {name}
            </p>
            {phone ? (
              <p className="mt-0.5 truncate text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
                {phone}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {c.unreadCount ? (
            <span className="rounded-full bg-[#E85D30] px-[var(--inbox-chip-x)] py-[2px] text-[length:var(--inbox-body-xs)] font-semibold text-[#0A0A0C]">
              {c.unreadCount}
            </span>
          ) : null}
          <span className="text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
            {formatTime(c.lastMessageAt)}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[length:var(--inbox-body-xs)] text-[#6E6E73]">
        <span className="rounded-full bg-[#19191C] px-[var(--inbox-chip-x)] py-[2px]">
          {c.status || ''}
        </span>
        {c.channel ? (
          <span className="rounded-full bg-[#19191C] px-[var(--inbox-chip-x)] py-[2px]">
            {c.channel}
          </span>
        ) : null}
        {isHandledByHuman ? (
          <span className="rounded-full bg-[#E85D30]/10 px-[var(--inbox-chip-x)] py-[2px] text-[#E85D30]">
            {c.assignedAgent?.name || 'Agente'}
          </span>
        ) : (
          <span className="rounded-full bg-emerald-500/10 px-[var(--inbox-chip-x)] py-[2px] text-emerald-400">
            IA
          </span>
        )}
      </div>
    </button>
  );
}
