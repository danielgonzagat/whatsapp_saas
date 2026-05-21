'use client';

import { kloelT } from '@/lib/i18n/t';
import Link from 'next/link';

interface InboxContextBannerProps {
  showContextBanner: boolean;
  sourceLabel: string;
  requestedPhone?: string | null;
  requestedConversationId?: string | null;
}

export function InboxContextBanner({
  showContextBanner,
  sourceLabel,
  requestedPhone,
  requestedConversationId,
}: InboxContextBannerProps) {
  if (!(showContextBanner && (sourceLabel || requestedPhone || requestedConversationId))) {
    return null;
  }

  return (
    <div className="mb-[var(--inbox-shell-gap)] rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-surface)] px-[var(--inbox-panel-x)] py-[var(--inbox-panel-y)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--inbox-item-gap)]">
        <div>
          <p className="text-[length:var(--inbox-body-xs)] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {kloelT(`Contexto operacional`)}
          </p>
          <p className="mt-1 text-[length:var(--inbox-body)] text-[var(--text-silver)]">
            {sourceLabel
              ? `Voce chegou aqui via ${sourceLabel.toLowerCase()}.`
              : 'Conversa destacada para acao.'}{' '}
            {kloelT(`Assuma, responda ou devolva para a IA sem sair do fluxo comercial.`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/flow"
            className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-elevated)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-border)]"
          >
            {kloelT(`Abrir Flow`)}
          </Link>
          <Link
            href="/analytics?tab=abandonos"
            className="rounded-[var(--inbox-radius)] border border-[var(--bg-border)] bg-[var(--bg-elevated)] px-[var(--inbox-button-x)] py-[var(--inbox-button-y)] text-[length:var(--inbox-body-xs)] font-semibold text-[var(--text-silver)] hover:bg-[var(--bg-border)]"
          >
            {kloelT(`Ver abandonos`)}
          </Link>
        </div>
      </div>
    </div>
  );
}
