'use client';

import { kloelT } from '@/lib/i18n/t';
import { LoaderCircle, Send } from 'lucide-react';

interface InboxMessageInputProps {
  selectedConversationId: string | null;
  replyText: string;
  onReplyTextChange: (value: string) => void;
  sending: boolean;
  onSendReply: () => Promise<void>;
}

export function InboxMessageInput({
  selectedConversationId,
  replyText,
  onReplyTextChange,
  sending,
  onSendReply,
}: InboxMessageInputProps) {
  if (!selectedConversationId) {
    return null;
  }

  return (
    <div className="border-t border-[var(--bg-border)] px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSendReply();
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <input
          type="text"
          value={replyText}
          onChange={(e) => onReplyTextChange(e.target.value)}
          placeholder={kloelT(`Escreva uma resposta...`)}
          disabled={sending}
          className="flex-1 rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-elevated)] px-[var(--inbox-input-x)] py-[var(--inbox-input-y)] text-[length:var(--inbox-body)] text-[var(--text-silver)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--ember-primary)]/50 focus:ring-1 focus:ring-[var(--ember-primary)]/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !replyText.trim()}
          className="flex shrink-0 items-center justify-center rounded-[var(--inbox-radius)] bg-[var(--ember-primary)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[var(--bg-void)] transition-colors hover:bg-[var(--ember-primary)]/90 disabled:opacity-40"
          title={kloelT(`Enviar`)}
        >
          {sending ? (
            <LoaderCircle
              className="animate-pulse"
              style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
              aria-hidden="true"
            />
          ) : (
            <Send
              style={{ width: 'var(--inbox-icon-sm)', height: 'var(--inbox-icon-sm)' }}
              aria-hidden="true"
            />
          )}
        </button>
      </form>
    </div>
  );
}
