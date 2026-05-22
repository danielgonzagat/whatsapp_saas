'use client';

import { kloelT } from '@/lib/i18n/t';
import Link from 'next/link';
import { type ReactNode } from 'react';

interface InboxHeaderProps {
  title: string;
  description: string;
  isConnected: boolean;
  showHeader: boolean;
  showUtilityLinks: boolean;
  headerActions?: ReactNode;
  loadingConversations: boolean;
  refreshConversations: () => Promise<void>;
}

export function InboxHeader({
  title,
  description,
  isConnected,
  showHeader,
  showUtilityLinks,
  headerActions,
  loadingConversations,
  refreshConversations,
}: InboxHeaderProps) {
  if (!showHeader) {
    return null;
  }

  return (
    <div className="mb-[var(--inbox-shell-gap)] flex flex-wrap items-center justify-between gap-[var(--inbox-item-gap)]">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-[length:var(--inbox-title)] font-semibold text-[var(--text-silver)]">
            {title}
          </h1>
          {isConnected && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-[var(--inbox-chip-x)] py-[var(--inbox-chip-y)] text-[length:var(--inbox-body-xs)] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

              {kloelT(`Conectado em tempo real`)}
            </span>
          )}
        </div>
        <p className="mt-1 text-[length:var(--inbox-body)] text-[var(--text-muted)]">{description}</p>
      </div>

      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <div className="flex flex-wrap items-center gap-[var(--inbox-item-gap)]">
          {headerActions}
          {showUtilityLinks ? (
            <>
              <Link
                href="/followups"
                className="text-[length:var(--inbox-body)] font-medium text-[var(--text-muted)] hover:text-[var(--text-silver)]"
              >
                {kloelT(`Follow-ups`)}
              </Link>
              <Link
                href="/marketing/whatsapp?mode=broadcast"
                className="text-[length:var(--inbox-body)] font-medium text-[var(--text-muted)] hover:text-[var(--text-silver)]"
              >
                {kloelT(`Broadcast`)}
              </Link>
              <Link
                href="/leads"
                className="text-[length:var(--inbox-body)] font-medium text-[var(--text-muted)] hover:text-[var(--text-silver)]"
              >
                {kloelT(`Leads`)}
              </Link>
              <Link
                href="/"
                className="text-[length:var(--inbox-body)] font-medium text-[var(--text-muted)] hover:text-[var(--text-silver)]"
              >
                {kloelT(`Voltar ao chat`)}
              </Link>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={refreshConversations}
          disabled={loadingConversations}
          className="self-start rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-surface)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 sm:self-auto"
        >
          {kloelT(`Atualizar`)}
        </button>
      </div>
    </div>
  );
}
