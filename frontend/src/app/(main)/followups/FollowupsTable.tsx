'use client';

import { kloelT } from '@/lib/i18n/t';
import { CheckCircle2, Clock, MessageSquare, Phone, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Followup } from './followups.types';

const D_RE = /\D/g;

function getStatusLabel(status: string) {
  switch (status) {
    case 'executed':
      return 'Executado';
    case 'cancelled':
      return 'Cancelado';
    default:
      return 'Pendente';
  }
}

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

function formatDate(dateStr: string) {
  if (!dateStr) {
    return '-';
  }
  try {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatPhone(phone: string) {
  if (!phone) {
    return '-';
  }
  const cleaned = phone.replace(D_RE, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
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

/** Table of followups with action buttons. */
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
    <div className="bg-[#111113] rounded-xl border border-[#222226] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#222226] flex items-center justify-between gap-4">
        <div className="text-sm text-[#6E6E73]">
          {kloelT(`Exibindo`)}{' '}
          <span className="text-[#E0DDD8] font-medium">{filteredFollowups.length}</span> de{' '}
          <span className="text-[#E0DDD8] font-medium">{totalCount}</span> follow-ups
        </div>
        {(search || statusFilter !== 'all') && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-[#E85D30] font-medium"
          >
            {kloelT(`Limpar filtros`)}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#222226]">
              <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                {kloelT(`Status`)}
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                {kloelT(`Telefone`)}
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                {kloelT(`Mensagem`)}
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                {kloelT(`Agendado para`)}
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                {kloelT(`Criado em`)}
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-[#6E6E73]">
                {kloelT(`Ações`)}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredFollowups.map((followup) => (
              <tr
                key={followup.id}
                className="border-b border-[#222226]/60 hover:bg-[#19191C] transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(followup.status)}
                    <span className="text-sm text-[#E0DDD8]">
                      {getStatusLabel(followup.status)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-[#6E6E73]" aria-hidden="true" />
                    <span className="text-sm text-[#E0DDD8] font-mono">
                      {formatPhone(followup.phone)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 max-w-xs">
                    <MessageSquare
                      className="w-4 h-4 text-[#6E6E73] flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-[#E0DDD8] truncate" title={followup.message}>
                      {followup.message || '-'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-[#E0DDD8]">
                    {formatDate(followup.scheduledFor)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-[#6E6E73]">{formatDate(followup.createdAt)}</span>
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
                      className="px-3 py-1.5 bg-[#19191C] border border-[#222226] rounded-lg text-[11px] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
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
                      className="px-3 py-1.5 bg-[#19191C] border border-[#222226] rounded-lg text-[11px] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
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
                      className="px-3 py-1.5 bg-[#19191C] border border-[#222226] rounded-lg text-[11px] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
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
                      className="px-3 py-1.5 bg-[#19191C] border border-[#222226] rounded-lg text-[11px] font-semibold text-[#E0DDD8] hover:bg-[#222226]"
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
