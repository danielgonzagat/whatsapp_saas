'use client';

import { kloelT } from '@/lib/i18n/t';
import { ActionCard } from '@/components/kloel';
import { Sparkles } from 'lucide-react';
import type { CiaMarketSignal } from '@/lib/api/cia';

interface CiaMarketSignalCardProps {
  signal: CiaMarketSignal | undefined;
}

export function CiaMarketSignalCard({ signal }: CiaMarketSignalCardProps) {
  return (
    <ActionCard
      title={
        signal?.normalizedKey
          ? `Sinal dominante: ${signal.normalizedKey}`
          : 'Sem sinal dominante ainda'
      }
      description={
        signal
          ? `${signal.frequency} ocorrencias recentes`
          : 'O CIA esta agregando objecoes e demanda em tempo real.'
      }
      icon={Sparkles}
      actionLabel={kloelT('Inteligencia de mercado')}
      accent="cyan"
    />
  );
}
