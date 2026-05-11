'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Button, CenterStage, Section } from '@/components/kloel';
import { AlertCircle, Calendar, DollarSign, Play, Send, Users, XCircle, Zap } from 'lucide-react';
import type { MoneyMachineResult } from '@/lib/api';
import type { AutopilotSmokeTestResult } from './page.ui';
import { StatCard, StatusPill } from './page.ui';

interface SmokeTestSectionProps {
  testPhone: string;
  setTestPhone: (v: string) => void;
  testMessage: string;
  setTestMessage: (v: string) => void;
  testLiveSend: boolean;
  setTestLiveSend: (v: boolean) => void;
  isTesting: boolean;
  onSmokeTest: () => void;
  smokeResult: AutopilotSmokeTestResult | null;
}

export function SmokeTestSection({
  testPhone,
  setTestPhone,
  testMessage,
  setTestMessage,
  testLiveSend,
  setTestLiveSend,
  isTesting,
  onSmokeTest,
  smokeResult,
}: SmokeTestSectionProps) {
  return (
    <Section spacing="md">
      <CenterStage size="XL">
        <div
          className="p-5 rounded-xl border"
          style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
        >
          <div className="flex items-start justify-between gap-4 mb-5 flex-col md:flex-row">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                {kloelT('Testar Autopilot')}
              </h2>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT(
                  'Executa um smoke test do pipeline ponta a ponta. O padrão é dry-run, sem enviar nada ao cliente.',
                )}
              </p>
            </div>
            <Button
              variant={testLiveSend ? 'danger' : 'primary'}
              size="md"
              onClick={onSmokeTest}
              isLoading={isTesting}
              leftIcon={!isTesting ? <Play size={16} aria-hidden="true" /> : undefined}
            >
              {isTesting
                ? 'Executando teste...'
                : testLiveSend
                  ? 'Testar com envio real'
                  : 'Testar Autopilot'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <label className="flex flex-col gap-2 text-sm">
              <span style={{ color: colors.text.secondary }}>{kloelT('Telefone de teste')}</span>
              <input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="5511999999999"
                className="px-4 py-3 rounded-lg border outline-none"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                  color: colors.text.primary,
                }}
              />
            </label>
            <label className="flex items-center gap-3 text-sm mt-7 md:mt-0">
              <input
                type="checkbox"
                checked={testLiveSend}
                onChange={(e) => setTestLiveSend(e.target.checked)}
              />
              <span style={{ color: colors.text.secondary }}>
                {kloelT('Enviar de verdade para esse número')}
              </span>
            </label>
          </div>

          <label className="flex flex-col gap-2 text-sm">
            <span style={{ color: colors.text.secondary }}>{kloelT('Mensagem de teste')}</span>
            <textarea
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              rows={3}
              className="px-4 py-3 rounded-lg border outline-none resize-none"
              style={{
                backgroundColor: colors.background.surface2,
                borderColor: colors.stroke,
                color: colors.text.primary,
              }}
            />
          </label>

          {smokeResult && (
            <div
              className="mt-5 p-4 rounded-xl border"
              style={{ backgroundColor: colors.background.surface2, borderColor: colors.stroke }}
            >
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <StatusPill label={kloelT('Modo')} status={smokeResult.mode} />
                <StatusPill label={kloelT('Resultado')} status={smokeResult.result?.status} />
                <StatusPill
                  label={kloelT('Fila waiting')}
                  status={String(smokeResult.queue?.waiting ?? 0)}
                />
                <StatusPill
                  label={kloelT('Fila failed')}
                  status={String(smokeResult.queue?.failed ?? 0)}
                />
              </div>
              <div className="space-y-2 text-sm">
                <p style={{ color: colors.text.primary }}>
                  <strong>{kloelT('Telefone:')}</strong> {smokeResult.phone}
                </p>
                <p style={{ color: colors.text.primary }}>
                  <strong>{kloelT('Mensagem:')}</strong> {smokeResult.message}
                </p>
                {smokeResult.result?.previewText && (
                  <div>
                    <p className="mb-1" style={{ color: colors.text.secondary }}>
                      {kloelT('Preview da resposta do Kloel')}
                    </p>
                    <div
                      className="p-3 rounded-lg"
                      style={{
                        backgroundColor: colors.background.obsidian,
                        color: colors.text.primary,
                      }}
                    >
                      {smokeResult.result.previewText}
                    </div>
                  </div>
                )}
                {!smokeResult.result?.previewText && smokeResult.result?.reason && (
                  <p style={{ color: colors.text.primary }}>
                    <strong>{kloelT('Motivo:')}</strong> {smokeResult.result.reason}
                  </p>
                )}
                {smokeResult.result?.error && (
                  <p style={{ color: colors.state.error }}>
                    <strong>{kloelT('Erro:')}</strong> {smokeResult.result.error}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CenterStage>
    </Section>
  );
}

interface MoneyMachineSectionProps {
  moneyMachineTopN: number;
  setMoneyMachineTopN: (v: number) => void;
  moneyMachineAutoSend: boolean;
  setMoneyMachineAutoSend: (v: boolean) => void;
  moneyMachineSmartTime: boolean;
  setMoneyMachineSmartTime: (v: boolean) => void;
  isRunningMoneyMachine: boolean;
  onExecute: () => void;
  moneyMachineResult: MoneyMachineResult | null;
}

export function MoneyMachineSection({
  moneyMachineTopN,
  setMoneyMachineTopN,
  moneyMachineAutoSend,
  setMoneyMachineAutoSend,
  moneyMachineSmartTime,
  setMoneyMachineSmartTime,
  isRunningMoneyMachine,
  onExecute,
  moneyMachineResult,
}: MoneyMachineSectionProps) {
  return (
    <Section spacing="lg">
      <CenterStage size="XL">
        <div
          className="p-5 rounded-xl border"
          style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
        >
          <div className="flex items-start justify-between gap-4 mb-5 flex-col md:flex-row">
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${colors.state.warning}26` }}
              >
                <DollarSign size={20} style={{ color: colors.state.warning }} aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                  {kloelT('Money Machine')}
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT(
                    'Varre conversas e gera campanhas de reativacao e fechamento automaticamente',
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={onExecute}
              isLoading={isRunningMoneyMachine}
              leftIcon={!isRunningMoneyMachine ? <Zap size={16} aria-hidden="true" /> : undefined}
            >
              {isRunningMoneyMachine ? 'Executando...' : 'Executar Money Machine'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span style={{ color: colors.text.secondary }}>{kloelT('Top N contatos')}</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={moneyMachineTopN}
                onChange={(e) => setMoneyMachineTopN(Number(e.target.value) || 200)}
                className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                style={{
                  backgroundColor: colors.background.surface2,
                  borderColor: colors.stroke,
                  color: colors.text.primary,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
            </label>
            <label className="flex items-center gap-3 text-sm mt-6 md:mt-0">
              <input
                type="checkbox"
                checked={moneyMachineAutoSend}
                onChange={(e) => setMoneyMachineAutoSend(e.target.checked)}
              />
              <span style={{ color: colors.text.secondary }}>{kloelT('Envio automatico')}</span>
            </label>
            <label className="flex items-center gap-3 text-sm mt-0">
              <input
                type="checkbox"
                checked={moneyMachineSmartTime}
                onChange={(e) => setMoneyMachineSmartTime(e.target.checked)}
              />
              <span style={{ color: colors.text.secondary }}>{kloelT('Horario inteligente')}</span>
            </label>
          </div>

          {moneyMachineResult && (
            <div
              className="p-4 rounded-lg border"
              style={{ backgroundColor: colors.background.surface2, borderColor: colors.stroke }}
            >
              <p
                className="text-xs font-medium tracking-widest mb-3 uppercase"
                style={{ color: colors.text.muted }}
              >
                {kloelT('Resultado')}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {moneyMachineResult.processed != null && (
                  <StatCard
                    icon={Users}
                    label={kloelT('Processados')}
                    value={moneyMachineResult.processed}
                    color={colors.brand.cyan}
                  />
                )}
                {moneyMachineResult.sent != null && (
                  <StatCard
                    icon={Send}
                    label={kloelT('Enviados')}
                    value={moneyMachineResult.sent}
                    color={colors.brand.green}
                  />
                )}
                {moneyMachineResult.scheduled != null && (
                  <StatCard
                    icon={Calendar}
                    label={kloelT('Agendados')}
                    value={moneyMachineResult.scheduled}
                    color={colors.state.warning}
                  />
                )}
                {moneyMachineResult.skipped != null && (
                  <StatCard
                    icon={XCircle}
                    label={kloelT('Ignorados')}
                    value={moneyMachineResult.skipped}
                    color={colors.text.muted}
                  />
                )}
                {moneyMachineResult.errors != null && (
                  <StatCard
                    icon={AlertCircle}
                    label={kloelT('Erros')}
                    value={moneyMachineResult.errors}
                    color={colors.state.error}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </CenterStage>
    </Section>
  );
}
