'use client';

import { kloelT } from '@/lib/i18n/t';
import { MessageCircleMore } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatPreview } from './WhatsAppConsole.helpers';

interface ChatsSyncListProps {
  chats: ChatPreview[];
  selectedChat: ChatPreview | null;
  onSelect: (id: string) => void;
}

export function ChatsSyncList({ chats, selectedChat, onSelect }: ChatsSyncListProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 text-base font-semibold uppercase tracking-[0.18em] text-slate-500">
        {kloelT(`Conversas sincronizadas`)}
      </div>
      <div className="space-y-2">
        {chats.slice(0, 4).map((chat) => (
          <button
            type="button"
            key={chat.id}
            onClick={() => onSelect(chat.id)}
            className={cn(
              'flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition',
              selectedChat?.id === chat.id ? 'bg-emerald-50' : 'bg-slate-50 hover:bg-slate-100',
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <MessageCircleMore className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-medium text-slate-900">{chat.title}</div>
              <div className="truncate text-base text-slate-500">
                {chat.subtitle || 'Sem prévia da última mensagem.'}
              </div>
            </div>
          </button>
        ))}
        {chats.length === 0 ? (
          <div className="rounded-md bg-slate-50 px-3 py-3 text-base text-slate-500">
            {kloelT(`Nenhuma conversa foi sincronizada ainda.`)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
