'use client';

import { kloelT } from '@/lib/i18n/t';
import { Badge, Button, Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { AlertTriangle } from 'lucide-react';
import type { CiaHumanTask } from '@/lib/api';

interface CiaHumanTasksProps {
  tasks: CiaHumanTask[];
  taskDrafts: Record<string, string>;
  taskPendingId: string | null;
  workspaceLoading: boolean;
  onSetTaskDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onApprove: (task: CiaHumanTask) => void;
  onReject: (task: CiaHumanTask) => void;
  onResume: (task: CiaHumanTask) => void;
}

export function CiaHumanTasks({
  tasks,
  taskDrafts,
  taskPendingId,
  workspaceLoading,
  onSetTaskDrafts,
  onApprove,
  onReject,
  onResume,
}: CiaHumanTasksProps) {
  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle size={16} style={{ color: colors.state.warning }} aria-hidden="true" />
        <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
          {kloelT('Excecoes Humanas')}
        </p>
      </div>
      {tasks.length === 0 ? (
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${colors.stroke}`,
          }}
        >
          <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
            {kloelT('Nenhuma excecao humana urgente')}
          </p>
          <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
            {kloelT('O CIA esta resolvendo sozinho o que cabe a zona segura.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
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
                    {task.urgency} {task.phone ? `\u2022 ${task.phone}` : ''}{' '}
                    {task.businessImpact ? `\u2022 ${task.businessImpact}` : ''}
                  </p>
                </div>
                <Badge variant={task.urgency === 'CRITICAL' ? 'error' : 'warning'}>
                  {task.urgency}
                </Badge>
              </div>

              <textarea
                value={taskDrafts[task.id] ?? task.suggestedReply ?? ''}
                onChange={(event) =>
                  onSetTaskDrafts((current) => ({
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
                  onClick={() => void onApprove(task)}
                  isLoading={taskPendingId === task.id}
                  disabled={workspaceLoading}
                >
                  {kloelT('Aprovar')}
                </Button>
                {task.conversationId ? (
                  <Button
                    variant="secondary"
                    onClick={() => void onResume(task)}
                    disabled={taskPendingId === task.id || workspaceLoading}
                  >
                    {kloelT('Retomar autonomia')}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => void onReject(task)}
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
  );
}
