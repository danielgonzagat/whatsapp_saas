'use client';

import { kloelT } from '@/lib/i18n/t';
import { CheckCircle2, Circle } from 'lucide-react';
import { SettingsCard, SettingsHeader, SettingsInset } from './contract';
import { buildMissingSteps } from './missing-steps-card.helpers';

interface MissingStepsCardProps {
  hasProducts: boolean;
  hasFiles: boolean;
  hasCheckout: boolean;
  hasVoiceTone: boolean;
  hasFaq: boolean;
  hasOpeningMessage: boolean;
  hasWhatsApp: boolean;
}

/** Missing steps card. */
export function MissingStepsCard({
  hasProducts = false,
  hasFiles = false,
  hasCheckout = false,
  hasVoiceTone = false,
  hasFaq = false,
  hasOpeningMessage = false,
  hasWhatsApp = false,
}: MissingStepsCardProps) {
  const steps = buildMissingSteps({
    hasCheckout,
    hasFaq,
    hasFiles,
    hasOpeningMessage,
    hasProducts,
    hasVoiceTone,
    hasWhatsApp,
  });

  const completedCount = steps.filter((s) => s.done).length;
  const allCompleted = completedCount === steps.length;

  if (allCompleted) {
    return null;
  }

  return (
    <SettingsCard className="p-6">
      <SettingsHeader
        title={kloelT(`O que falta para completar o seu Kloel?`)}
        description={`${completedCount} de ${steps.length} etapas concluidas`}
      />

      <div className="space-y-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <SettingsInset
              key={step.label}
              className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${
                step.done ? 'border-[var(--semantic-success)]/20 bg-[var(--semantic-success)]/10' : ''
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-[var(--semantic-success)]" aria-hidden="true" />
              ) : (
                <Circle className="h-5 w-5 text-[var(--app-text-tertiary)]" aria-hidden="true" />
              )}
              <Icon
                className={`h-4 w-4 ${step.done ? 'text-[var(--semantic-success)]' : 'text-[var(--app-text-secondary)]'}`}
              />
              <span
                className={`text-sm ${step.done ? 'text-[var(--app-text-primary)]' : 'text-[var(--app-text-secondary)]'}`}
              >
                {step.label}
              </span>
            </SettingsInset>
          );
        })}
      </div>
    </SettingsCard>
  );
}
