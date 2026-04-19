'use client';

import {
  CheckCircle2,
  Circle,
  CreditCard,
  FileText,
  HelpCircle,
  MessageSquare,
  Package,
  Smartphone,
} from 'lucide-react';
import { SettingsCard, SettingsHeader, SettingsInset } from './contract';

interface MissingStepsCardProps {
  hasProducts: boolean;
  hasFiles: boolean;
  hasCheckout: boolean;
  hasVoiceTone: boolean;
  hasFaq: boolean;
  hasOpeningMessage: boolean;
  hasWhatsApp: boolean;
}

export function MissingStepsCard({
  hasProducts = false,
  hasFiles = false,
  hasCheckout = false,
  hasVoiceTone = false,
  hasFaq = false,
  hasOpeningMessage = false,
  hasWhatsApp = false,
}: MissingStepsCardProps) {
  const completedSurfaceStyle = {
    background: 'var(--app-accent-light)',
    borderColor: 'color-mix(in srgb, var(--app-accent) 28%, var(--app-border-primary))',
  } as const;

  const steps = [
    { label: 'Cadastrar produtos', done: hasProducts, icon: Package },
    { label: 'Enviar arquivos', done: hasFiles, icon: FileText },
    { label: 'Configurar planos de checkout', done: hasCheckout, icon: CreditCard },
    { label: 'Definir tom de voz', done: hasVoiceTone, icon: MessageSquare },
    { label: 'Adicionar perguntas frequentes', done: hasFaq, icon: HelpCircle },
    { label: 'Configurar mensagem de abertura', done: hasOpeningMessage, icon: MessageSquare },
    { label: 'Conectar canais Meta', done: hasWhatsApp, icon: Smartphone },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allCompleted = completedCount === steps.length;

  if (allCompleted) return null;

  return (
    <SettingsCard className="p-6">
      <SettingsHeader
        title="O que falta para completar o seu Kloel?"
        description={`${completedCount} de ${steps.length} etapas concluidas`}
      />

      <div className="space-y-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <SettingsInset
              key={step.label}
              className="flex items-center gap-3 rounded-xl p-3 transition-colors"
              style={step.done ? completedSurfaceStyle : undefined}
            >
              {step.done ? (
                <CheckCircle2
                  className="h-5 w-5"
                  style={{ color: 'var(--app-accent)' }}
                  aria-hidden="true"
                />
              ) : (
                <Circle className="h-5 w-5 text-[var(--app-text-tertiary)]" aria-hidden="true" />
              )}
              <Icon
                className="h-4 w-4"
                style={{
                  color: step.done ? 'var(--app-accent)' : 'var(--app-text-secondary)',
                }}
              />
              <span
                className="text-sm"
                style={{
                  color: step.done ? 'var(--app-text-primary)' : 'var(--app-text-secondary)',
                }}
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
