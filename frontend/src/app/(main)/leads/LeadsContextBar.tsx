'use client';

import { kloelT } from '@/lib/i18n/t';
import Link from 'next/link';

interface LeadsContextBarProps {
  sourceLabel: string;
  requestedLeadId: string | null;
  requestedPhone: string | null;
  requestedEmail: string | null;
}

export function LeadsContextBar({
  sourceLabel,
  requestedLeadId,
  requestedPhone,
  requestedEmail,
}: LeadsContextBarProps) {
  if (!sourceLabel && !requestedLeadId && !requestedPhone && !requestedEmail) {
    return null;
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {kloelT(`Contexto operacional`)}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {sourceLabel
              ? `Voce chegou aqui via ${sourceLabel.toLowerCase()}.`
              : 'Lead destacado para acao rapida.'}{' '}
            {kloelT(
              `Use os atalhos abaixo para mover este contato para inbox, flow ou recuperacao.`,
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/scrapers"
            className="rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
          >
            {kloelT(`Voltar para aquisicao`)}
          </Link>
          <Link
            href="/followups"
            className="rounded-xl border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
          >
            {kloelT(`Abrir follow-ups`)}
          </Link>
        </div>
      </div>
    </div>
  );
}
