'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useState } from 'react';
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
  type AlertDefinition,
  type AlertStyleTokens,
  type AlertType,
} from './system-alerts-card.helpers';

type Alert = AlertDefinition;

interface SystemAlertsCardProps {
  alerts?: Alert[];
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

/** System alerts card. */
export function SystemAlertsCard({ alerts: propAlerts }: SystemAlertsCardProps) {
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  const alerts = propAlerts || [];

  const handleShowResolve = (alert: Alert) => {
    setSelectedAlert(alert);
    setShowResolveModal(true);
  };

  return (
    <>
      <SettingsCard className="p-6">
        <SettingsHeader
          title={kloelT(`Problemas e Alertas`)}
          description={kloelT(`Status geral do sistema Kloel`)}
          className="mb-4"
        />

        <div className="space-y-2">
          {alerts.length === 0 ? (
            <SettingsInset className="p-4 text-sm text-[#6E6E73]">
              
              {kloelT(`Nenhum alerta operacional carregado nesta sessao.`)}
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
            <h3 className="text-lg font-semibold text-[#E0DDD8]">{kloelT(`Como resolver`)}</h3>
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
            
            {kloelT(`Entendi`)}
          </Button>
        </SettingsModal>
      )}
    </>
  );
}
