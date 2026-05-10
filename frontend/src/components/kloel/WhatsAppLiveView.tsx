'use client';

import { kloelT } from '@/lib/i18n/t';
import { cn } from '@/lib/utils';
import type { Message as InboxMessage } from '@/lib/api';
import type { AgentActivity } from './AgentConsole';
import { formatClock } from './WhatsAppConsole.helpers';
import type { ChatPreview } from './WhatsAppConsole.helpers';
import { getActivityTone } from './WhatsAppConsole';

interface WhatsAppLiveViewProps {
  selectedChat: ChatPreview | null;
  messages: InboxMessage[];
  activities: AgentActivity[];
  isThinking: boolean;
  isPaused: boolean;
}

export function WhatsAppLiveView({
  selectedChat,
  messages,
  activities,
  isThinking,
  isPaused,
}: WhatsAppLiveViewProps) {
  const renderedMessages = messages.slice(-16);
  const renderedActivities = activities.slice(-5).reverse();

  return (
    <div className="space-y-3">
      <div className="mx-auto w-full max-w-[270px] rounded-[32px] border-[8px] border-slate-900 bg-slate-900 p-1 shadow-2xl">
        <div className="rounded-[24px] bg-[colors.background.surface] overflow-hidden">
          <div className="flex items-center justify-between bg-[colors.background.elevated] px-3 pb-2 pt-3 text-white">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-white/70">
                {isPaused ? 'IA pausada' : 'IA ativa'}
              </div>
              <div className="text-sm font-semibold">
                {selectedChat?.title || 'WhatsApp ao vivo'}
              </div>
            </div>
            <div className="text-[11px] text-white/80">
              {selectedChat?.lastMessageAt
                ? formatClock(selectedChat.lastMessageAt)
                : formatClock(new Date())}
            </div>
          </div>

          <div className="max-h-[420px] min-h-[420px] space-y-2 overflow-y-auto bg-[colors.background.surface] px-3 py-3">
            {renderedMessages.length === 0 ? (
              <div className="rounded-md bg-[colors.background.surface]/90 px-3 py-4 text-center text-xs text-[colors.text.muted] shadow-sm">
                {kloelT(`Nenhuma conversa sincronizada ainda. Assim que a sessão estiver ativa, as mensagens
                e ações do agente aparecem aqui.`)}
              </div>
            ) : null}

            {renderedMessages.map((message) => {
              const outbound = message.direction === 'OUTBOUND';
              return (
                <div
                  key={message.id}
                  className={cn(
                    'max-w-[82%] rounded-md px-3 py-2 text-[13px] leading-relaxed shadow-sm',
                    outbound
                      ? 'ml-auto rounded-br-md bg-[colors.ember.primary]/20 text-[colors.text.silver]'
                      : 'mr-auto rounded-bl-md bg-[colors.background.elevated] text-[colors.text.silver]',
                  )}
                >
                  <div>{message.content || '[mensagem sem texto]'}</div>
                  <div className="mt-1 text-right text-[10px] text-slate-400">
                    {formatClock(message.createdAt)}
                  </div>
                </div>
              );
            })}

            {renderedActivities.map((activity) => (
              <div
                key={activity.id}
                className={cn(
                  'mx-auto max-w-[92%] rounded-md border px-3 py-2 text-[11px] shadow-sm',
                  getActivityTone(activity),
                )}
              >
                <div className="font-semibold">{activity.title}</div>
                {activity.description ? <div className="mt-1">{activity.description}</div> : null}
              </div>
            ))}

            {isThinking && !isPaused ? (
              <div className="mr-auto max-w-[65%] rounded-md rounded-bl-md bg-[colors.background.elevated] px-3 py-2 text-xs text-[colors.text.muted] shadow-sm">
                {kloelT(`digitando...`)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {kloelT(`Ações ao vivo`)}
          </div>
          <div className="text-xs text-slate-400">
            {activities.length} {kloelT(`evento(s)`)}
          </div>
        </div>
        <div className="space-y-2">
          {activities
            .slice(-4)
            .reverse()
            .map((activity) => (
              <div key={activity.id} className="rounded-md bg-slate-50 px-3 py-2">
                <div className="text-sm font-medium text-slate-900">{activity.title}</div>
                {activity.description ? (
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">
                    {activity.description}
                  </div>
                ) : null}
              </div>
            ))}
          {activities.length === 0 ? (
            <div className="rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-500">
              {kloelT(`O painel passa a refletir tudo o que a IA faz assim que o stream do agente e a sessão
              do WhatsApp estiverem ativos.`)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
