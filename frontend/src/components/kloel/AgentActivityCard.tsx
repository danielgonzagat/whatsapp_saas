'use client';

import { kloelT } from '@/lib/i18n/t';
import type { AgentActivity } from './AgentConsole';

interface AgentActivityCardProps {
  latestProofActivity: AgentActivity | null;
  latestAccountActivity: AgentActivity | null;
}

export function AgentActivityCard({
  latestProofActivity,
  latestAccountActivity,
}: AgentActivityCardProps) {
  return (
    <>
      {latestProofActivity ? (
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {kloelT(`Prova da melhor ação`)}
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900">
            {latestProofActivity.metadata?.actionType || 'Ação em prova'}
            {latestProofActivity.metadata?.tacticCode
              ? ` · ${latestProofActivity.metadata.tacticCode}`
              : ''}
          </div>
          <div className="mt-1 text-xs leading-relaxed text-slate-600">
            {kloelT(`Rank da ação:`)}{' '}
            {latestProofActivity.metadata?.selectedActionRank ?? '-'}{' '}
            {kloelT(`·
            melhores ações acima:`)}{' '}
            {latestProofActivity.metadata?.betterActionCount ?? 0}{' '}
            {kloelT(`·
            rank da tática:`)}{' '}
            {latestProofActivity.metadata?.selectedTacticRank ?? '-'}{' '}
            {kloelT(`·
            melhores táticas acima:`)}{' '}
            {latestProofActivity.metadata?.betterTacticCount ?? 0}
          </div>
        </div>
      ) : null}

      {latestAccountActivity ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {kloelT(`Conta ao vivo`)}
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-900">
            {latestAccountActivity.title}
          </div>
          <div className="mt-1 text-xs leading-relaxed text-slate-500">
            {latestAccountActivity.description ||
              'O agente está materializando e atualizando a conta em tempo real.'}
          </div>
        </div>
      ) : null}
    </>
  );
}
