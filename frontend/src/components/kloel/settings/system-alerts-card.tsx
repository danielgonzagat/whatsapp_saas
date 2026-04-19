'use client';

import { Button } from '@/components/ui/button';
import { swrFetcher } from '@/lib/fetcher';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import {
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsModal,
  SettingsNotice,
} from './contract';
import {
  AlertRow,
  resolveNoticeTone,
  type AlertStyleTokens,
  type AlertType,
} from './system-alerts-card.helpers';
import {
  deriveSystemAlerts,
  summarizeSystemHealth,
  type SystemAlert,
  type SystemHealthSnapshot,
} from './system-alerts';

interface SystemAlertsCardProps {
  alerts?: SystemAlert[];
}

const ALERT_STYLES: Record<AlertType, AlertStyleTokens> = {
  success: {
    bg: 'bg-[#10B981]/12',
    text: 'text-[#7FE2BC]',
    icon: CheckCircle2,
    iconColor: 'text-[#7FE2BC]',
  },
  warning: {
    bg: 'bg-[#E85D30]/12',
    text: 'text-[#F2B29D]',
    icon: AlertTriangle,
    iconColor: 'text-[#F2B29D]',
  },
  error: {
    bg: 'bg-[#E05252]/12',
    text: 'text-[#F7A8A8]',
    icon: XCircle,
    iconColor: 'text-[#F7A8A8]',
  },
  info: {
    bg: 'bg-[#3B82F6]/12',
    text: 'text-[#93C5FD]',
    icon: Info,
    iconColor: 'text-[#93C5FD]',
  },
};

export function SystemAlertsCard({ alerts: propAlerts }: SystemAlertsCardProps) {
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<SystemAlert | null>(null);
  const shouldLoadRuntimeHealth = !propAlerts;
  const { data, error, isLoading } = useSWR<SystemHealthSnapshot>(
    shouldLoadRuntimeHealth ? '/health/system' : null,
    swrFetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
    },
  );

  const derivedAlerts =
    propAlerts ||
    (error
      ? [
          {
            id: 'system-health-fetch-error',
            type: 'error' as const,
            message: 'Não foi possível carregar a saúde do sistema.',
            detail:
              error instanceof Error
                ? error.message
                : 'A leitura consolidada do backend falhou nesta sessão.',
          },
        ]
      : deriveSystemAlerts(data));
  const healthSummary = propAlerts ? [] : summarizeSystemHealth(data);
  const alerts = derivedAlerts;

  const handleShowResolve = (alert: SystemAlert) => {
    setSelectedAlert(alert);
    setShowResolveModal(true);
  };

  const lastUpdated =
    typeof data?.details?.timestamp === 'string' && data.details.timestamp
      ? new Date(data.details.timestamp).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  return (
    <>
      <SettingsCard className="p-6">
        <SettingsHeader
          title="Problemas e Alertas"
          description={
            lastUpdated
              ? `Status geral do sistema Kloel • atualizado ${lastUpdated}`
              : 'Status geral do sistema Kloel'
          }
          className="mb-4"
        />

        {shouldLoadRuntimeHealth && isLoading && alerts.length === 0 ? (
          <SettingsInset className="mb-4 p-4 text-sm text-[#6E6E73]">
            Carregando saúde consolidada do backend, worker e integrações críticas.
          </SettingsInset>
        ) : null}

        {healthSummary.length > 0 ? (
          <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
            {healthSummary.map((pill) => {
              const styles = ALERT_STYLES[pill.tone];
              return (
                <div
                  key={pill.id}
                  className={`rounded-md border border-white/5 ${styles.bg} px-3 py-2`}
                >
                  <div className={`text-[11px] font-medium uppercase tracking-[0.12em] ${styles.text}`}>
                    {pill.label}
                  </div>
                  <div className="mt-1 text-sm font-medium text-[#E0DDD8]">{pill.value}</div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="space-y-2">
          {alerts.length === 0 ? (
            <SettingsInset className="p-4 text-sm text-[#6E6E73]">
              Nenhum alerta operacional carregado nesta sessao.
            </SettingsInset>
          ) : (
            alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                styles={ALERT_STYLES[alert.type]}
                onResolve={handleShowResolve}
              />
            ))
          )}
        </div>
      </SettingsCard>

      {showResolveModal && selectedAlert && (
        <SettingsModal className="max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#E0DDD8]">Como resolver</h3>
            <button
              type="button"
              onClick={() => setShowResolveModal(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#6E6E73] hover:bg-[#19191C]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <SettingsNotice tone={resolveNoticeTone(selectedAlert.type)}>
            <p className="text-sm">
              {selectedAlert.detail ||
                'Este alerta ainda nao traz um roteiro detalhado nesta superficie.'}
            </p>
          </SettingsNotice>
          <Button
            onClick={() => setShowResolveModal(false)}
            className="mt-4 w-full rounded-md border border-[#E85D30] bg-[#E85D30] text-[#0A0A0C] hover:opacity-95"
          >
            Entendi
          </Button>
        </SettingsModal>
      )}
    </>
  );
}
