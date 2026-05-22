'use client';

import { kloelT } from '@/lib/i18n/t';
import { useRouter } from 'next/navigation';

interface FollowupsContextBarProps {
  sourceLabel: string;
  requestedPhone: string;
  requestedLeadId: string;
  buildRecoveryDashboardHref: (input: {
    phone?: string | null;
    leadId?: string | null;
    draft?: string | null;
  }) => string;
}

export function FollowupsContextBar({
  sourceLabel,
  requestedPhone,
  requestedLeadId,
  buildRecoveryDashboardHref,
}: FollowupsContextBarProps) {
  const router = useRouter();

  if (!sourceLabel && !requestedPhone && !requestedLeadId) {
    return null;
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {kloelT(`Contexto operacional`)}
          </p>
          <p className="text-sm text-foreground mt-1">
            {sourceLabel
              ? `Você chegou aqui via ${sourceLabel.toLowerCase()}.`
              : 'Follow-up destacado para ação imediata.'}{' '}
            {kloelT(`Use esta fila para retomar o lead e decida se o próximo passo é inbox, flow ou
            análise.`)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(
                buildRecoveryDashboardHref({
                  phone: requestedPhone,
                  leadId: requestedLeadId,
                }),
              )
            }
            className="px-3 py-2 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
          >
            {kloelT(`Pedir plano para IA`)}
          </button>
          <button
            type="button"
            onClick={() =>
              router.push(
                `/inbox${requestedPhone ? `?source=followups&phone=${encodeURIComponent(requestedPhone)}` : ''}`,
              )
            }
            className="px-3 py-2 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
          >
            {kloelT(`Abrir Inbox`)}
          </button>
          <button
            type="button"
            onClick={() =>
              router.push(
                `/flow?source=followups${requestedPhone ? `&phone=${encodeURIComponent(requestedPhone)}` : ''}&purpose=recovery&tab=editor`,
              )
            }
            className="px-3 py-2 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
          >
            {kloelT(`Automatizar no Flow`)}
          </button>
          <button
            type="button"
            onClick={() => router.push('/analytics?tab=abandonos')}
            className="px-3 py-2 bg-muted border border-border rounded-lg text-xs font-semibold text-foreground hover:bg-accent"
          >
            {kloelT(`Ver abandono`)}
          </button>
        </div>
      </div>
    </div>
  );
}
