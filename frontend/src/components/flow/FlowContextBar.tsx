'use client';

import { kloelT } from '@/lib/i18n/t';

interface FlowContextBarProps {
  sourceLabel: string;
  purpose: string;
  requestedPhone: string;
  requestedLeadId: string;
  onOpenTemplates: () => void;
}

export function FlowContextBar({
  sourceLabel,
  purpose,
  requestedPhone,
  requestedLeadId,
  onOpenTemplates,
}: FlowContextBarProps) {
  return (
    <div className="mx-4 mt-4 rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {kloelT('Contexto operacional')}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {sourceLabel
              ? `Voce chegou aqui via ${sourceLabel.toLowerCase()}.`
              : 'Fluxo aberto com contexto operacional.'}{' '}
            {purpose === 'recovery'
              ? 'Monte uma recuperacao para retomar conversao, responder objecoes e devolver o lead ao caminho de compra.'
              : 'Use este fluxo para automatizar a proxima acao comercial no contexto certo.'}
          </p>
          {(requestedPhone || requestedLeadId) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {requestedPhone ? `Contato: ${requestedPhone}` : 'Lead selecionado'}
              {requestedLeadId ? ` • lead ${requestedLeadId}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenTemplates}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
          >
            {kloelT('Ver templates')}
          </button>
          <a
            href={
              requestedPhone
                ? `/inbox?source=flow&phone=${encodeURIComponent(requestedPhone)}`
                : '/inbox'
            }
            className="rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
          >
            {kloelT('Abrir Inbox')}
          </a>
          <a
            href={
              requestedPhone
                ? `/leads?source=flow&phone=${encodeURIComponent(requestedPhone)}${requestedLeadId ? `&leadId=${encodeURIComponent(requestedLeadId)}` : ''}`
                : '/leads'
            }
            className="rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
          >
            {kloelT('Voltar para Leads')}
          </a>
        </div>
      </div>
    </div>
  );
}
