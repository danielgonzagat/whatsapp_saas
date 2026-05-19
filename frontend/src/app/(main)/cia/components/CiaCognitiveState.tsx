'use client';

import { kloelT } from '@/lib/i18n/t';
import { Surface } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { Bot } from 'lucide-react';
import type { CiaCognitiveHighlight } from '@/lib/api';

interface CiaCognitiveStateProps {
  cognition: CiaCognitiveHighlight[];
}

export function CiaCognitiveState({ cognition }: CiaCognitiveStateProps) {
  return (
    <Surface className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bot size={16} style={{ color: colors.brand.green }} aria-hidden="true" />
        <p className="text-sm uppercase tracking-[0.18em]" style={{ color: colors.text.muted }}>
          {kloelT('Estado Cognitivo')}
        </p>
      </div>

      {cognition.length === 0 ? (
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
              'Assim que eu fechar intencao, estagio e proxima melhor acao, isso aparece aqui.',
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {cognition.slice(0, 4).map((item) => (
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
                {item.phone ? `${item.phone} \u2022 ` : ''}
                {item.intent ? `${item.intent} \u2022 ` : ''}
                {item.stage ? `${item.stage} \u2022 ` : ''}
                {item.nextBestAction || item.outcome || 'observando'}
              </p>
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}
