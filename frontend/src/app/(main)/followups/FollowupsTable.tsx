'use client';

import { kloelT } from '@/lib/i18n/t';
import { CheckCircle2, Clock, MessageSquare, Phone, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Followup } from './followups.types';
import { formatDate, formatPhone, getStatusLabel } from './followups.helpers';

function getStatusIcon(status: string) {
  switch (status) {
    case 'executed':
      return <CheckCircle2 className="w-5 h-5 text-green-500" aria-hidden="true" />;
    case 'cancelled':
      return <XCircle className="w-5 h-5 text-red-500" aria-hidden="true" />;
    default:
      return <Clock className="w-5 h-5 text-yellow-500" aria-hidden="true" />;
  }
}

interface FollowupsTableProps {
  filteredFollowups: Followup[];
  totalCount: number;
  search: string;
  statusFilter: string;
  buildRecoveryDashboardHref: (input: {
    phone?: string | null;
    leadId?: string | null;
    draft?: string | null;
  }) => string;
  onClearFilters: () => void;
}

export function FollowupsTable({
  filteredFollowups,
  totalCount,
  search,
  statusFilter,
  buildRecoveryDashboardHref,
  onClearFilters,
}: FollowupsTableProps) {
  const router = useRouter();

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {kloelT(`Exibindo`)}{' '}
          <span className="text-foreground font-medium">{filteredFollowups.length}</span> de{' '}
          <span className="text-foreground font-medium">{totalCount}</span> follow-ups
        </div>
        {(search || statusFilter !== 'all') && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-primary font-medium"
          >
            {kloelT(`Limpar filtros`)}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                {kloelT(`Status`)}
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                {kloelT(`Telefone`)}
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                {kloelT(`Mensagem`)}
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                {kloelT(`Agendado para`)}
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                {kloelT(`Criado em`)}
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">
                {kloelT(`Ações`)}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredFollowups.map((followup) => (
              <tr
                key={followup.id}
                className="border-b border-border/60 hover:bg-muted transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(followup.status)}
                    <span className="text-sm text-foreground">
                      {getStatusLabel(followup.status)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-sm text-foreground font-mono">
                      {formatPhone(followup.phone)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 max-w-xs">
                    <MessageSquare
                      className="w-4 h-4 text-muted-foreground flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-foreground truncate" title={followup.message}>
                      {followup.message || '-'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-foreground">{formatDate(followup.scheduledFor)}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-muted-foreground">{formatDate(followup.createdAt)}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          buildRecoveryDashboardHref({
                            phone: followup.phone,
                            leadId: followup.contactId,
                            draft: followup.message || '',
                          }),
                        )
                      }
                      className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-semibold text-foreground hover:bg-accent"
                    >
                      IA
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/inbox?source=followups&phone=${encodeURIComponent(followup.phone)}&draft=${encodeURIComponent(followup.message || '')}`,
                        )
                      }
                      className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-semibold text-foreground hover:bg-accent"
                    >
                      {kloelT(`Inbox`)}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/flow?source=followups&phone=${encodeURIComponent(followup.phone)}&leadId=${encodeURIComponent(followup.contactId)}&purpose=recovery&tab=editor`,
                        )
                      }
                      className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-semibold text-foreground hover:bg-accent"
                    >
                      {kloelT(`Flow`)}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/leads?source=followups&phone=${encodeURIComponent(followup.phone)}&leadId=${encodeURIComponent(followup.contactId)}`,
                        )
                      }
                      className="px-3 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-semibold text-foreground hover:bg-accent"
                    >
                      {kloelT(`Lead`)}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
