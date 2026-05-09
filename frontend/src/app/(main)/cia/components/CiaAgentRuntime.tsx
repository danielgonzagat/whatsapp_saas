'use client';

import { kloelT } from '@/lib/i18n/t';
import { Badge, Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { Activity } from 'lucide-react';
import type { CiaAccountRuntime } from '@/lib/api';

interface CiaAgentRuntimeProps {
  runtime: CiaAccountRuntime;
}

export function CiaAgentRuntime({ runtime }: CiaAgentRuntimeProps) {
  return (
    <Surface className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={16} style={{ color: colors.brand.amber }} aria-hidden="true" />
          <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
            {kloelT('Agent Runtime')}
          </p>
        </div>
        <Badge variant={runtime.noLegalActions ? 'warning' : 'success'}>
          {runtime.mode}
        </Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Aprovacoes abertas', value: runtime.openApprovalCount },
          { label: 'Inputs pendentes', value: runtime.pendingInputCount },
          { label: 'Work items ativos', value: runtime.openWorkItemCount },
          { label: 'Aprovacoes concluidas', value: runtime.completedApprovalCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded p-3"
            style={{
              backgroundColor: colors.background.surface1,
              border: `1px solid ${colors.stroke}`,
            }}
          >
            <p className="text-2xl font-bold font-mono" style={{ color: colors.text.primary }}>
              {stat.value}
            </p>
            <p className="text-xs mt-1" style={{ color: colors.text.muted }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>
      {runtime.noLegalActions && (
        <div
          className="mt-4 rounded p-3"
          style={{
            backgroundColor: `${colors.state.warning}12`,
            border: `1px solid ${colors.state.warning}40`,
          }}
        >
          <p className="text-sm" style={{ color: colors.state.warning }}>
            {kloelT('Universo de acoes esgotado \u2014 nenhuma acao legal disponivel no momento.')}
          </p>
        </div>
      )}
    </Surface>
  );
}
