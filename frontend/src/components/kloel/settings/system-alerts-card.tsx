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
    bg: 'bg-[var(--semantic-success)]/12',
    text: 'text-[var(--semantic-success-text)]',
    icon: CheckCircle2,
    iconColor: 'text-[var(--semantic-success-text)]',
  },
  warning: {
    bg: 'bg-[colors.ember.primary]/12',
    text: 'text-[var(--semantic-ember-text)]',
    icon: AlertTriangle,
    iconColor: 'text-[var(--semantic-ember-text)]',
  },
  error: {
    bg: 'bg-[var(--semantic-error-soft)]/12',
    text: 'text-[var(--semantic-error-text)]',
    icon: XCircle,
    iconColor: 'text-[var(--semantic-error-text)]',
  },
  info: {
    bg: 'bg-[var(--semantic-info)]/12',
    text: 'text-[var(--semantic-info-text)]',
    icon: Info,
    iconColor: 'text-[var(--semantic-info-text)]',
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
            <SettingsInset className="p-4 text-sm text-[colors.text.muted]">
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
            <h3 className="text-lg font-semibold text-[colors.text.silver]">
              {kloelT(`Como resolver`)}
            </h3>
            <button
              type="button"
              onClick={() => setShowResolveModal(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[colors.text.muted] hover:bg-[colors.background.elevated]"
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
            className="mt-4 w-full rounded-md border border-[colors.ember.primary] bg-[colors.ember.primary] text-[colors.background.void] hover:opacity-95"
          >
            {kloelT(`Entendi`)}
          </Button>
        </SettingsModal>
      )}
    </>
  );
}
