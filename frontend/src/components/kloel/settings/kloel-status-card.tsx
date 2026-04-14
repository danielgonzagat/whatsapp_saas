'use client';

import { KLOEL_THEME } from '@/lib/kloel-theme';
import {
  CreditCard,
  FileText,
  HelpCircle,
  MessageSquare,
  Package,
  ShieldCheck,
} from 'lucide-react';
import { SettingsCard, SettingsHeader, SettingsMetricTile } from './contract';

interface KloelStatusCardProps {
  filesProcessed: number;
  productsConfigured: number;
  rulesLearned: number;
  faqFilled: number;
  voiceToneDefined: boolean;
  checkoutConfigured: boolean;
}

export function KloelStatusCard({
  filesProcessed = 0,
  productsConfigured = 0,
  rulesLearned = 0,
  faqFilled = 0,
  voiceToneDefined = false,
  checkoutConfigured = false,
}: KloelStatusCardProps) {
  // Calculate preparation percentage
  const totalItems = 6;
  let completedItems = 0;
  if (filesProcessed > 0) completedItems++;
  if (productsConfigured > 0) completedItems++;
  if (rulesLearned > 0) completedItems++;
  if (faqFilled > 0) completedItems++;
  if (voiceToneDefined) completedItems++;
  if (checkoutConfigured) completedItems++;

  const preparationPercent = Math.round((completedItems / totalItems) * 100);

  // Ring SVG calculation
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (preparationPercent / 100) * circumference;

  return (
    <SettingsCard className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <SettingsHeader
            title="Status do Kloel"
            description="Nivel de preparacao da sua inteligencia comercial"
            className="mb-0"
          />
        </div>

        <div className="relative flex h-24 w-24 items-center justify-center">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={KLOEL_THEME.borderPrimary}
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={
                preparationPercent >= 80
                  ? '#22C55E'
                  : preparationPercent >= 50
                    ? '#F59E0B'
                    : '#EF4444'
              }
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-2xl font-bold text-[var(--app-text-primary)]">
              {preparationPercent}%
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SettingsMetricTile className="flex items-center gap-3 p-3">
          <FileText className="h-4 w-4 text-[var(--app-text-secondary)]" />
          <div>
            <p className="text-xs text-[var(--app-text-secondary)]">Arquivos processados</p>
            <p className="font-semibold text-[var(--app-text-primary)]">{filesProcessed}</p>
          </div>
        </SettingsMetricTile>
        <SettingsMetricTile className="flex items-center gap-3 p-3">
          <Package className="h-4 w-4 text-[var(--app-text-secondary)]" />
          <div>
            <p className="text-xs text-[var(--app-text-secondary)]">Produtos configurados</p>
            <p className="font-semibold text-[var(--app-text-primary)]">{productsConfigured}</p>
          </div>
        </SettingsMetricTile>
        <SettingsMetricTile className="flex items-center gap-3 p-3">
          <ShieldCheck className="h-4 w-4 text-[var(--app-text-secondary)]" />
          <div>
            <p className="text-xs text-[var(--app-text-secondary)]">Regras aprendidas</p>
            <p className="font-semibold text-[var(--app-text-primary)]">{rulesLearned}</p>
          </div>
        </SettingsMetricTile>
        <SettingsMetricTile className="flex items-center gap-3 p-3">
          <HelpCircle className="h-4 w-4 text-[var(--app-text-secondary)]" />
          <div>
            <p className="text-xs text-[var(--app-text-secondary)]">FAQ preenchido</p>
            <p className="font-semibold text-[var(--app-text-primary)]">{faqFilled}</p>
          </div>
        </SettingsMetricTile>
        <SettingsMetricTile className="flex items-center gap-3 p-3">
          <MessageSquare className="h-4 w-4 text-[var(--app-text-secondary)]" />
          <div>
            <p className="text-xs text-[var(--app-text-secondary)]">Tom de voz</p>
            <p
              className={`font-semibold ${voiceToneDefined ? 'text-[#10B981]' : 'text-[var(--app-text-tertiary)]'}`}
            >
              {voiceToneDefined ? 'Definido' : 'Nao definido'}
            </p>
          </div>
        </SettingsMetricTile>
        <SettingsMetricTile className="flex items-center gap-3 p-3">
          <CreditCard className="h-4 w-4 text-[var(--app-text-secondary)]" />
          <div>
            <p className="text-xs text-[var(--app-text-secondary)]">Checkout</p>
            <p
              className={`font-semibold ${checkoutConfigured ? 'text-[#10B981]' : 'text-[var(--app-text-tertiary)]'}`}
            >
              {checkoutConfigured ? 'Configurado' : 'Nao configurado'}
            </p>
          </div>
        </SettingsMetricTile>
      </div>
    </SettingsCard>
  );
}
