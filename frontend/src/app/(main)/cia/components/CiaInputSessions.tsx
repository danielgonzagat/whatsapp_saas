'use client';

import { kloelT } from '@/lib/i18n/t';
import { Badge, Button, Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { PATTERN_RE_2 } from '../utils';
import { ClipboardList } from 'lucide-react';
import type { CiaInputSession } from '@/lib/api';

interface CiaInputSessionsProps {
  sessions: CiaInputSession[];
  pendingSessions: CiaInputSession[];
  sessionAnswers: Record<string, string>;
  sessionPendingId: string | null;
  workspaceLoading: boolean;
  onSetSessionAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onRespond: (session: CiaInputSession) => void;
}

export function CiaInputSessions({
  sessions,
  pendingSessions,
  sessionAnswers,
  sessionPendingId,
  workspaceLoading,
  onSetSessionAnswers,
  onRespond,
}: CiaInputSessionsProps) {
  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
        <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
          {kloelT('Coleta de Informacoes')}
        </p>
        {pendingSessions.length > 0 && (
          <Badge variant="warning">{pendingSessions.length} aguardando</Badge>
        )}
      </div>

      {sessions.length === 0 ? (
        <div
          className="rounded p-4"
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${colors.stroke}`,
          }}
        >
          <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
            {kloelT('Nenhuma sessao de input ativa')}
          </p>
          <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
            {kloelT(
              'Quando o agente precisar de informacoes para criar um produto, as sessoes aparecem aqui.',
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="rounded p-4"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: colors.text.primary }}>
                    {session.productName}
                  </p>
                  {session.currentPrompt && (
                    <p className="text-sm mt-2" style={{ color: colors.text.secondary }}>
                      {session.currentPrompt}
                    </p>
                  )}
                  {session.phone && (
                    <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                      {session.phone}
                      {session.contactName ? ` \u2022 ${session.contactName}` : ''}
                    </p>
                  )}
                </div>
                <Badge variant={session.status === 'COMPLETED' ? 'success' : 'warning'}>
                  {session.status.replace(PATTERN_RE_2, ' ')}
                </Badge>
              </div>

              {session.status !== 'COMPLETED' && (
                <div className="mt-3">
                  <textarea
                    value={sessionAnswers[session.id] ?? ''}
                    onChange={(e) =>
                      onSetSessionAnswers((prev) => ({
                        ...prev,
                        [session.id]: e.target.value,
                      }))
                    }
                    placeholder={kloelT('Sua resposta...')}
                    className="w-full rounded border px-3 py-2 text-sm outline-none"
                    style={{
                      backgroundColor: colors.background.base,
                      color: colors.text.primary,
                      borderColor: colors.stroke,
                    }}
                    rows={3}
                  />
                  <Button
                    className="mt-2"
                    onClick={() => void onRespond(session)}
                    isLoading={sessionPendingId === session.id}
                    disabled={workspaceLoading || !sessionAnswers[session.id]?.trim()}
                  >
                    {kloelT('Responder')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}
