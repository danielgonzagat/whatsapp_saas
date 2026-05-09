'use client';

import { kloelT } from '@/lib/i18n/t';
import { Badge, Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { PATTERN_RE_2, workItemStateBadgeVariant } from '../utils';
import { ClipboardList } from 'lucide-react';
import type { CiaWorkItem } from '@/lib/api';

interface CiaWorkItemsProps {
  items: CiaWorkItem[];
  activeWorkItems: CiaWorkItem[];
}

export function CiaWorkItems({ items, activeWorkItems }: CiaWorkItemsProps) {
  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
        <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
          {kloelT('Work Items do Agente')}
        </p>
        {activeWorkItems.length > 0 && (
          <Badge variant="info">{activeWorkItems.length} ativos</Badge>
        )}
      </div>

      {items.length === 0 ? (
        <div
          className="rounded p-4"
          style={{
            backgroundColor: colors.background.surface1,
            border: `1px solid ${colors.stroke}`,
          }}
        >
          <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
            {kloelT('Nenhum work item no momento')}
          </p>
          <p className="text-sm mt-1" style={{ color: colors.text.secondary }}>
            {kloelT('O agente nao possui tarefas pendentes no universo atual.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded p-3 flex items-start justify-between gap-3"
              style={{
                backgroundColor: colors.background.surface1,
                border: `1px solid ${colors.stroke}`,
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: colors.text.primary }}>
                  {item.title}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                  {item.summary}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
                  {item.entityType} {kloelT('\u2022 prioridade')} {item.priority}
                </p>
              </div>
              <div className="flex-shrink-0">
                <Badge variant={workItemStateBadgeVariant(item.state)}>
                  {item.state.replace(PATTERN_RE_2, ' ')}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}
