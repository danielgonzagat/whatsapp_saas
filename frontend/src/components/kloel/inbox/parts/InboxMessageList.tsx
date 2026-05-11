'use client';

import { type Conversation, type Message } from '@/lib/api';
import { kloelT } from '@/lib/i18n/t';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { type RefObject } from 'react';
import { formatInboxTime as formatTime } from '../inbox-workspace-utils';

interface InboxMessageListProps {
  loadingMessages: boolean;
  selectedConversationId: string | null;
  messages: Message[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  requestedPhone?: string | null;
  matchedConversationByPhone?: Conversation | null;
  selectedConversation?: Conversation | null;
  requestedDraft?: string | null;
}

export function InboxMessageList({
  loadingMessages,
  selectedConversationId,
  messages,
  messagesEndRef,
  requestedPhone,
  matchedConversationByPhone,
  selectedConversation,
  requestedDraft,
}: InboxMessageListProps) {
  if (loadingMessages) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2
          className="animate-spin text-[var(--text-muted)]"
          style={{ width: 'var(--inbox-icon-md)', height: 'var(--inbox-icon-md)' }}
          aria-hidden="true"
        />
      </div>
    );
  }

  if (!selectedConversationId) {
    return (
      <div className="py-10 text-center">
        <p className="text-[length:var(--inbox-body)] font-medium text-[var(--text-silver)]">
          {kloelT(`Selecione uma conversa`)}
        </p>
        <p className="mt-1 text-[length:var(--inbox-body-xs)] text-[var(--text-muted)]">
          {requestedPhone && !matchedConversationByPhone
            ? 'Nao existe conversa ativa para este telefone. Voce pode voltar ao lead, abrir um broadcast ou preparar um flow.'
            : 'Escolha uma conversa à esquerda para ver as mensagens.'}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/leads"
            className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-elevated)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-border)]"
          >
            {kloelT(`Voltar para Leads`)}
          </Link>
          <Link
            href={buildDashboardHref({
              source: 'inbox',
              leadId: selectedConversation?.contactId || '',
              phone: requestedPhone || '',
              purpose: 'handoff',
              draft: requestedDraft || '',
            })}
            className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-elevated)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-border)]"
          >
            {kloelT(`Pedir plano para IA`)}
          </Link>
          <Link
            href="/followups"
            className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-elevated)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-border)]"
          >
            {kloelT(`Abrir follow-ups`)}
          </Link>
          <Link
            href="/marketing/whatsapp?mode=broadcast"
            className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-elevated)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-border)]"
          >
            {kloelT(`Acionar marketing`)}
          </Link>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-[length:var(--inbox-body)] font-medium text-[var(--text-silver)]">
          {kloelT(`Sem mensagens`)}
        </p>
        <p className="mt-1 text-[length:var(--inbox-body-xs)] text-[var(--text-muted)]">
          {kloelT(`Esta conversa ainda não possui mensagens.`)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const isInbound = m.direction === 'INBOUND';
        return (
          <div
            key={m.id}
            className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[90%] rounded-[calc(var(--inbox-radius)-4px)] px-[var(--inbox-message-x)] py-[var(--inbox-message-y)] text-[length:var(--inbox-body)] ${
                isInbound
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-silver)]'
                  : 'bg-[var(--ember-primary)] text-[var(--bg-void)]'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.content || ''}</p>
              <div
                className={`mt-1 text-[length:var(--inbox-body-xs)] ${isInbound ? 'text-[var(--text-muted)]' : 'text-[var(--bg-void)]/70'}`}
              >
                {formatTime(m.createdAt)}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
