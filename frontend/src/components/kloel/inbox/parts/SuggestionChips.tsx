'use client';

import { useCopilotSuggestions } from '@/hooks/use-copilot-suggestions';
import { useSocket } from '@/hooks/useSocket';
import { Bot, LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';

interface SuggestionChipsProps {
  workspaceId: string | undefined;
  contactId: string | null;
  onSelectSuggestion: (text: string) => void;
}

export function SuggestionChips({
  workspaceId,
  contactId,
  onSelectSuggestion,
}: SuggestionChipsProps) {
  const { suggestions, isLoading, error, mutate } = useCopilotSuggestions(workspaceId, contactId);
  const { isConnected, subscribe } = useSocket();

  useEffect(() => {
    if (!isConnected || !workspaceId || !contactId) {
      return;
    }

    const unsub = subscribe('message:new', (payload: Record<string, unknown>) => {
      const convId = typeof payload.conversationId === 'string' ? payload.conversationId : undefined;
      if (convId && contactId && convId === contactId) {
        mutate();
      }
      if (!convId && contactId) {
        const msgConvId =
          typeof (payload as Record<string, unknown>).message === 'object' &&
          ((payload as Record<string, unknown>).message as Record<string, unknown>)?.conversationId;
        if (typeof msgConvId === 'string' && msgConvId === contactId) {
          mutate();
        }
      }
    });

    return () => {
      unsub();
    };
  }, [isConnected, workspaceId, contactId, mutate, subscribe]);

  if (!contactId) {
    return null;
  }

  if (isLoading && suggestions.length === 0) {
    return (
      <div className="flex items-center gap-2 border-b border-[var(--bg-border)] px-[var(--inbox-panel-x)] py-[var(--inbox-chip-y)]">
        <LoaderCircle
          className="animate-spin text-[var(--text-muted)]"
          style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
          aria-hidden="true"
        />
        <span
          className="text-[length:var(--inbox-body-xs)] text-[var(--text-muted)]"
        >
          Gerando sugestões...
        </span>
      </div>
    );
  }

  if (suggestions.length === 0 && !error) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--bg-border)] px-[var(--inbox-panel-x)] py-[var(--inbox-chip-y)]">
      <Bot
        style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
        className="shrink-0 text-[var(--ember-primary)]"
        aria-hidden="true"
      />
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onSelectSuggestion(suggestion)}
          className="max-w-[220px] truncate rounded-[calc(var(--inbox-radius)-10px)] border border-[var(--ember-primary)]/30 bg-[var(--ember-primary)]/5 px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-left text-[length:var(--inbox-body-xs)] text-[var(--text-silver)] transition-colors hover:border-[var(--ember-primary)]/60 hover:bg-[var(--ember-primary)]/10"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
