'use client';

import { type Conversation, type InboxAgent } from '@/lib/api';
import { kloelT } from '@/lib/i18n/t';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import { Bot, User as UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface InboxConversationHeaderProps {
  selectedConversation: Conversation | null;
  selectedConversationId: string | null;
  agents: InboxAgent[];
  assigning: boolean;
  onAssumir: () => Promise<void>;
  onDevolverIA: () => Promise<void>;
  onAssignAgent: (agentId: string) => Promise<void>;
  onCloseConversation: () => Promise<void>;
  requestedPhone?: string | null;
  requestedDraft?: string | null;
}

export function InboxConversationHeader({
  selectedConversation,
  selectedConversationId,
  agents,
  assigning,
  onAssumir,
  onDevolverIA,
  onAssignAgent,
  onCloseConversation,
  requestedPhone,
  requestedDraft,
}: InboxConversationHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-[var(--inbox-item-gap)] border-b border-[var(--bg-border)] px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
      <div className="min-w-0">
        <p className="truncate text-[length:var(--inbox-section-title)] font-semibold text-[var(--text-silver)]">
          {selectedConversation?.contact?.name ||
            selectedConversation?.contact?.phone ||
            'Selecione uma conversa'}
        </p>
        <p className="mt-0.5 truncate text-[length:var(--inbox-body-xs)] text-[var(--text-muted)]">
          {selectedConversation?.contact?.phone || ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {selectedConversation ? (
          selectedConversation.assignedAgent ? (
            <span className="flex items-center gap-1.5 rounded-[calc(var(--inbox-radius)-10px)] bg-[var(--ember-primary)]/10 px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--ember-primary)]">
              <UserIcon
                style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
                aria-hidden="true"
              />
              {selectedConversation.assignedAgent.name || 'Agente'}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-[calc(var(--inbox-radius)-10px)] bg-emerald-500/10 px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-semibold text-emerald-400">
              <Bot
                style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
                aria-hidden="true"
              />
              IA
            </span>
          )
        ) : null}

        {selectedConversationId && !selectedConversation?.assignedAgent ? (
          <button
            type="button"
            onClick={onAssumir}
            disabled={assigning}
            className="rounded-[var(--inbox-radius)] border border-[var(--ember-primary)]/30 bg-[var(--ember-primary)]/10 px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--ember-primary)] hover:bg-[var(--ember-primary)]/20 disabled:opacity-50"
          >
            {assigning ? '...' : 'Assumir conversa'}
          </button>
        ) : null}
        {selectedConversationId && selectedConversation?.assignedAgent ? (
          <button
            type="button"
            onClick={onDevolverIA}
            disabled={assigning}
            className="rounded-[var(--inbox-radius)] border border-emerald-500/30 bg-emerald-500/10 px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {assigning ? '...' : 'Devolver para IA'}
          </button>
        ) : null}

        {selectedConversationId && agents.length > 0 ? (
          <select
            value={selectedConversation?.assignedAgent?.id || ''}
            disabled={assigning}
            onChange={async (e) => {
              await onAssignAgent(e.target.value);
            }}
            className="hidden max-w-[180px] rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-surface)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 lg:block"
            title={kloelT(`Atribuir agente`)}
          >
            <option value="">{kloelT(`Não atribuído`)}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.isOnline ? '(online) ' : ''}
                {a.name}
              </option>
            ))}
          </select>
        ) : null}

        <button
          type="button"
          onClick={() => {
            const href = buildDashboardHref({
              source: 'inbox',
              leadId: selectedConversation?.contactId || '',
              phone: selectedConversation?.contact?.phone || requestedPhone || '',
              name: selectedConversation?.contact?.name || '',
              purpose: 'handoff',
              draft: requestedDraft || '',
            });
            router.push(href);
          }}
          disabled={!selectedConversation && !requestedPhone}
          className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-surface)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
        >
          {kloelT(`Abrir com IA`)}
        </button>
        <button
          type="button"
          onClick={onCloseConversation}
          disabled={!selectedConversationId}
          className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-surface)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
        >
          {kloelT(`Fechar`)}
        </button>
      </div>
    </div>
  );
}
