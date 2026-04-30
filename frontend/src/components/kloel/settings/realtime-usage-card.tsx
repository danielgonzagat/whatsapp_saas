'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';
import { colors } from '@/lib/design-tokens';
import {
  SettingsCard,
  SettingsHeader,
  SettingsMetricTile,
  SettingsNotice,
  kloelSettingsClass,
} from './contract';

interface RealtimeUsageCardProps {
  messagesToday: number;
  estimatedDailyCost: number;
  monthlyConsumption: number;
  creditsBalance: number;
  maxCredits: number;
  onAddCredits: () => void;
}

/** Realtime usage card. */
export function RealtimeUsageCard({
  messagesToday = 42,
  estimatedDailyCost = 0.42,
  monthlyConsumption = 12.5,
  creditsBalance = 5.0,
  maxCredits = 5.0,
  onAddCredits,
}: RealtimeUsageCardProps) {
  const creditsPercent = (creditsBalance / maxCredits) * 100;

  const getBarColor = () => {
    if (creditsPercent >= 70) {
      return 'bg-[colors.ember.primary]';
    }
    if (creditsPercent >= 30) {
      return 'bg-[#F59E0B]';
    }
    return 'bg-[#E05252]';
  };

  return (
    <SettingsCard className="p-6">
      <SettingsHeader
        icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
        title={kloelT(`Uso em tempo real do Kloel`)}
      />

      <div className="mb-6 grid grid-cols-2 gap-4">
        <SettingsMetricTile>
          <p className="text-xs text-[var(--app-text-secondary)]">
            {kloelT(`Mensagens enviadas hoje`)}
          </p>
          <p className="text-2xl font-bold text-[var(--app-text-primary)]">{messagesToday}</p>
        </SettingsMetricTile>
        <SettingsMetricTile>
          <p className="text-xs text-[var(--app-text-secondary)]">
            {kloelT(`Estimativa de custo diario`)}
          </p>
          <p className="text-2xl font-bold text-[var(--app-text-primary)]">
            {kloelT(`US$`)} {estimatedDailyCost.toFixed(2)}
          </p>
        </SettingsMetricTile>
        <SettingsMetricTile>
          <p className="text-xs text-[var(--app-text-secondary)]">
            {kloelT(`Consumo mensal aproximado`)}
          </p>
          <p className="text-2xl font-bold text-[var(--app-text-primary)]">
            {kloelT(`US$`)} {monthlyConsumption.toFixed(2)}
          </p>
        </SettingsMetricTile>
        <SettingsMetricTile>
          <p className="text-xs text-[var(--app-text-secondary)]">{kloelT(`Saldo de creditos`)}</p>
          <p className="text-2xl font-bold text-[var(--app-text-primary)]">
            {kloelT(`US$`)} {creditsBalance.toFixed(2)}
          </p>
        </SettingsMetricTile>
      </div>

      <div className="mb-2">
        <div className="mb-1 flex justify-between text-xs text-[var(--app-text-secondary)]">
          <span>{kloelT(`Creditos restantes`)}</span>
          <span>{creditsPercent.toFixed(0)}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--app-bg-secondary)]">
          <div
            className={`h-full rounded-full transition-all ${getBarColor()}`}
            style={{ width: `${creditsPercent}%` }}
          />
        </div>
      </div>

      {creditsPercent < 10 && (
        <SettingsNotice tone="danger" className="mt-4">
          <p className="text-sm font-medium">{kloelT(`Seus creditos estao acabando.`)}</p>
          <p className="mt-1 text-xs">
            {kloelT(`Adicione mais creditos para evitar pausas no atendimento automatico.`)}
          </p>
          <Button
            onClick={onAddCredits}
            className={`mt-3 w-full ${kloelSettingsClass.primaryButton}`}
          >
            {kloelT(`Adicionar creditos agora`)}
          </Button>
        </SettingsNotice>
      )}
    </SettingsCard>
  );
}
