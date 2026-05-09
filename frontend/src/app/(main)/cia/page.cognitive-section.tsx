'use client';

import { kloelT } from '@/lib/i18n/t';
import type { CiaHumanTask, CiaSurfaceResponse } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import { Badge, Button, Grid, Surface } from '@/components/kloel';
import { ActionCard } from '@/components/kloel';
import { AlertTriangle, Bot, Sparkles } from 'lucide-react';

interface CiaCognitionItem {
  id: string;
  summary?: string | null;
  phone?: string | null;
  intent?: string | null;
  stage?: string | null;
  nextBestAction?: string | null;
  outcome?: string | null;
}

interface CiaActivityCognitiveHumanProps {
  surface: CiaSurfaceResponse | null;
  taskDrafts: Record<string, string>;
  setTaskDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  taskPendingId: string | null;
  workspaceLoading: boolean;
  onApproveTask: (task: CiaHumanTask) => void;
  onResumeTask: (task: CiaHumanTask) => void;
  onRejectTask: (task: CiaHumanTask) => void;
  formatPhaseLabel: (value?: string | null) => string;
}

export function CiaActivityCognitiveHuman({
  surface,
  taskDrafts,
  setTaskDrafts,
  taskPendingId,
  workspaceLoading,
  onApproveTask,
  onResumeTask,
  onRejectTask,
  formatPhaseLabel,
}: CiaActivityCognitiveHumanProps) {
  return (
    <Grid cols={2} gap={4}>
      <Surface className="p-5">
        <p
          className="text-sm uppercase tracking-[0.18em] mb-4"
          style={{ color: colors.text.muted }}
        >
          {kloelT('Atividade Recente')}
        </p>
        <div className="space-y-3">
          {(surface?.recent || [])
            .slice()
            .reverse()
            .map((event, index) => (
              <div
                key={`${event.ts || index}-${event.message}`}
                className="rounded-xl p-3"
                style={{
                  backgroundColor: colors.background.surface1,
                  border: `1px solid ${colors.stroke}`,
                }}
              >
                <p className="text-sm" style={{ color: colors.text.primary }}>
                  {event.message}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                  {formatPhaseLabel(event.phase) || 'Atividade'}
                </p>
              </div>
            ))}
        </div>
      </Surface>

      <div className="space-y-4">
        <Surface className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bot size={16} style={{ color: colors.brand.green }} aria-hidden="true" />
            <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
              {kloelT('Estado Cognitivo')}
            </p>
          </div>

          {(surface?.cognition || []).length === 0 ? (
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                {kloelT('Ainda estou consolidando o contexto comercial dos contatos')}
              </p>
              <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                {kloelT(
                  'Assim que eu fechar intenção, estágio e próxima melhor ação, isso aparece aqui.',
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(surface?.cognition || []).slice(0, 4).map((item: CiaCognitionItem) => (
                <div
                  key={item.id}
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: colors.background.surface1,
                    border: `1px solid ${colors.stroke}`,
                  }}
                >
                  <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                    {item.summary}
                  </p>
                  <p className="text-xs mt-2" style={{ color: colors.text.muted }}>
                    {item.phone ? `${item.phone} • ` : ''}
                    {item.intent ? `${item.intent} • ` : ''}
                    {item.stage ? `${item.stage} • ` : ''}
                    {item.nextBestAction || item.outcome || 'observando'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Surface>
        <Surface className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} style={{ color: colors.state.warning }} aria-hidden="true" />
            <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
              {kloelT('Exceções Humanas')}
            </p>
          </div>
          {(surface?.humanTasks || []).length === 0 ? (
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                {kloelT('Nenhuma exceção humana urgente')}
              </p>
              <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
                {kloelT('O CIA está resolvendo sozinho o que cabe à zona segura.')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(surface?.humanTasks || []).map((task: CiaHumanTask) => (
                <div
                  key={task.id}
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: colors.background.surface1,
                    border: `1px solid ${colors.stroke}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: colors.text.primary }}>
                        {task.reason}
                      </p>
                      <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                        {task.urgency} {task.phone ? `• ${task.phone}` : ''}{' '}
                        {task.businessImpact ? `• ${task.businessImpact}` : ''}
                      </p>
                    </div>
                    <Badge variant={task.urgency === 'CRITICAL' ? 'error' : 'warning'}>
                      {task.urgency}
                    </Badge>
                  </div>

                  <textarea
                    value={taskDrafts[task.id] ?? task.suggestedReply ?? ''}
                    onChange={(event) =>
                      setTaskDrafts((current) => ({
                        ...current,
                        [task.id]: event.target.value,
                      }))
                    }
                    placeholder={kloelT('Editar resposta antes de aprovar')}
                    className="mt-3 w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{
                      backgroundColor: colors.background.base,
                      color: colors.text.primary,
                      borderColor: colors.stroke,
                    }}
                    rows={3}
                  />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      onClick={() => onApproveTask(task)}
                      isLoading={taskPendingId === task.id}
                      disabled={workspaceLoading}
                    >
                      {kloelT('Aprovar')}
                    </Button>
                    {task.conversationId ? (
                      <Button
                        variant="secondary"
                        onClick={() => onResumeTask(task)}
                        disabled={taskPendingId === task.id || workspaceLoading}
                      >
                        {kloelT('Retomar autonomia')}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      onClick={() => onRejectTask(task)}
                      disabled={taskPendingId === task.id || workspaceLoading}
                    >
                      {kloelT('Dispensar')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>
        <ActionCard
          title={
            surface?.marketSignals?.[0]?.normalizedKey
              ? `Sinal dominante: ${surface.marketSignals[0].normalizedKey}`
              : 'Sem sinal dominante ainda'
          }
          description={
            surface?.marketSignals?.[0]
              ? `${surface.marketSignals[0].frequency} ocorrências recentes`
              : 'O CIA está agregando objeções e demanda em tempo real.'
          }
          icon={Sparkles}
          actionLabel={kloelT('Inteligência de mercado')}
          accent="cyan"
        />
      </div>
    </Grid>
  );
}
