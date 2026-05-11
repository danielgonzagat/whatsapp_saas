'use client';

import { type Conversation } from '@/lib/api';
import { kloelT } from '@/lib/i18n/t';
import { Loader2, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { InboxConversationListItem } from '../InboxConversationListItem';
import { InboxConversationFilters } from './InboxConversationFilters';
import { type ChannelFilter, type StatusFilter } from '../inbox-workspace-utils';

interface InboxConversationListProps {
  loadingConversations: boolean;
  conversations: Conversation[];
  filteredConversations: Conversation[];
  selectedConversationId: string | null;
  channelFilter: ChannelFilter;
  setChannelFilter: (value: ChannelFilter) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (value: StatusFilter) => void;
  onSelectConversation: (id: string) => Promise<void>;
  requestedPhone?: string | null;
}

export function InboxConversationList({
  loadingConversations,
  conversations,
  filteredConversations,
  selectedConversationId,
  channelFilter,
  setChannelFilter,
  statusFilter,
  setStatusFilter,
  onSelectConversation,
  requestedPhone,
}: InboxConversationListProps) {
  return (
    <div className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-surface)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--bg-border)] px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
        <div className="flex items-center gap-2">
          <MessageSquare
            className="text-[var(--text-muted)]"
            style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
            aria-hidden="true"
          />
          <span className="text-[length:var(--inbox-section-title)] font-semibold text-[var(--text-silver)]">
            {kloelT(`Conversas`)}
          </span>
        </div>
        <span className="text-[length:var(--inbox-body-xs)] text-[var(--text-muted)]">
          {filteredConversations.length}/{conversations.length}
        </span>
      </div>

      <InboxConversationFilters
        channelFilter={channelFilter}
        setChannelFilter={setChannelFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />

      <div className="max-h-[clamp(420px,60vh,720px)] overflow-y-auto">
        {loadingConversations ? (
          <div className="flex items-center justify-center px-[var(--inbox-panel-x)] py-10">
            <Loader2
              className="animate-spin text-[var(--text-muted)]"
              style={{ width: 'var(--inbox-icon-md)', height: 'var(--inbox-icon-md)' }}
              aria-hidden="true"
            />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="px-[var(--inbox-panel-x)] py-10 text-center">
            <p className="text-[length:var(--inbox-body)] font-medium text-[var(--text-silver)]">
              {kloelT(`Sem conversas`)}
            </p>
            <p className="mt-1 text-[length:var(--inbox-body-xs)] text-[var(--text-muted)]">
              {requestedPhone
                ? 'Nao encontramos uma conversa ativa para este contato ainda.'
                : 'Quando mensagens chegarem, elas aparecem aqui.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Link
                href="/leads"
                className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-elevated)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-border)]"
              >
                {kloelT(`Revisar leads`)}
              </Link>
              <Link
                href="/marketing/whatsapp?mode=broadcast"
                className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-elevated)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-border)]"
              >
                {kloelT(`Abrir broadcast`)}
              </Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--bg-border)]">
            {filteredConversations.map((c) => (
              <InboxConversationListItem
                key={c.id}
                conversation={c}
                isActive={c.id === selectedConversationId}
                onSelect={onSelectConversation}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
