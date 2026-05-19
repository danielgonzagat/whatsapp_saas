'use client';

import { kloelT } from '@/lib/i18n/t';
import { type Lead } from '@/lib/api';
import { buildDashboardHref } from '@/lib/kloel-dashboard-context';
import {
  LEAD_STATUS_LABEL as STATUS_LABEL,
  formatLeadTimeAgo as formatTimeAgo,
  leadTitle,
  safeLeadDate as safeDate,
} from './leads-page.helpers';
import { Check, Copy } from 'lucide-react';
import Link from 'next/link';

interface LeadsDetailPanelProps {
  selectedLead: Lead | null;
  copiedLeadId: string | null;
  onCopyPhone: (lead: Lead) => void;
  buildLeadDashboardHref: (lead: Lead, draft?: string) => string;
}

export function LeadsDetailPanel({
  selectedLead,
  copiedLeadId,
  onCopyPhone,
  buildLeadDashboardHref,
}: LeadsDetailPanelProps) {
  return (
    <div className="lg:col-span-7">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        {!selectedLead ? (
          <div>
            <h2 className="text-sm font-semibold text-foreground">{kloelT(`Detalhes`)}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {kloelT(`Selecione um lead à esquerda para ver informações.`)}
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-foreground">
                  {leadTitle(selectedLead)}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{selectedLead.phone}</p>
                {selectedLead.email ? (
                  <p className="mt-1 text-sm text-muted-foreground">{selectedLead.email}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={buildLeadDashboardHref(selectedLead)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  {kloelT(`Abrir com IA`)}
                </Link>
                <button
                  type="button"
                  onClick={() => onCopyPhone(selectedLead)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  {copiedLeadId === selectedLead.id ? (
                    <Check className="h-4 w-4 text-foreground" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  {kloelT(`Copiar`)}
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">{kloelT(`Status`)}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {STATUS_LABEL[selectedLead.status] || selectedLead.status || '—'}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {kloelT(`Última intenção`)}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedLead.lastIntent || '—'}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {kloelT(`Mensagens`)}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedLead.totalMessages ?? '—'}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {kloelT(`Última interação`)}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatTimeAgo(
                    safeDate(selectedLead.lastInteraction) ||
                      safeDate(selectedLead.updatedAt) ||
                      safeDate(selectedLead.createdAt),
                  )}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">{kloelT(`Atalhos`)}</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Link
                  href={`/inbox?source=leads&phone=${encodeURIComponent(selectedLead.phone || '')}`}
                  className="rounded-xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Levar para Inbox`)}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {kloelT(`Assuma a conversa manualmente ou devolva para IA.`)}
                  </span>
                </Link>
                <Link
                  href={buildLeadDashboardHref(selectedLead)}
                  className="rounded-xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Pedir plano para IA`)}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {kloelT(
                      `Abra o Kloel com o contexto deste lead e peça a próxima melhor ação.`,
                    )}
                  </span>
                </Link>
                <Link
                  href={`/followups?source=leads&leadId=${encodeURIComponent(selectedLead.id)}`}
                  className="rounded-xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Iniciar Follow-up`)}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {kloelT(`Recupere leads mornos e abandos sem perder contexto.`)}
                  </span>
                </Link>
                <Link
                  href={`/flow?source=leads&leadId=${encodeURIComponent(selectedLead.id)}`}
                  className="rounded-xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Automatizar no Flow`)}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {kloelT(`Transforme este lead em automacao de retorno ou nurture.`)}
                  </span>
                </Link>
                <Link
                  href={`/marketing/whatsapp?mode=broadcast&source=leads&phone=${encodeURIComponent(selectedLead.phone || '')}`}
                  className="rounded-xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent"
                >
                  {kloelT(`Acionar Marketing`)}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {kloelT(`Abra broadcast ou templates para destravar resposta rapida.`)}
                  </span>
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link
                  href={buildDashboardHref({
                    source: 'leads',
                    purpose: 'qualification',
                    draft:
                      'Quero importar minha lista de leads e organizar a melhor operação de aquisição.',
                  })}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {kloelT(`Pedir para o KLOEL importar`)}
                </Link>
                <span className="text-muted">•</span>
                <Link
                  href="/autopilot"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {kloelT(`Configurar Autopilot`)}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
