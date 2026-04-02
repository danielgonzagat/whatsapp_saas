'use client';

import {
  CheckCircle2,
  Circle,
  Package,
  FileText,
  CreditCard,
  MessageSquare,
  HelpCircle,
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
  const steps = [
    { label: 'Cadastrar produtos', done: hasProducts, icon: Package },
    { label: 'Enviar arquivos', done: hasFiles, icon: FileText },
    { label: 'Configurar planos de checkout', done: hasCheckout, icon: CreditCard },
    { label: 'Definir tom de voz', done: hasVoiceTone, icon: MessageSquare },
    { label: 'Adicionar perguntas frequentes', done: hasFaq, icon: HelpCircle },
    { label: 'Configurar mensagem de abertura', done: hasOpeningMessage, icon: MessageSquare },
    { label: 'Conectar WhatsApp', done: hasWhatsApp, icon: Smartphone },
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
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <SettingsInset
              key={index}
              className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${
                step.done ? 'border-[#10B981]/20 bg-[#10B981]/10' : ''
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-[#10B981]" />
              ) : (
                <Circle className="h-5 w-5 text-[#3A3A3F]" />
              )}
              <Icon className={`h-4 w-4 ${step.done ? 'text-[#10B981]' : 'text-[#6E6E73]'}`} />
              <span className={`text-sm ${step.done ? 'text-[#E0DDD8]' : 'text-[#6E6E73]'}`}>
                {step.label}
              </span>
            </SettingsInset>
          );
        })}
      </div>
    </SettingsCard>
  );
}
