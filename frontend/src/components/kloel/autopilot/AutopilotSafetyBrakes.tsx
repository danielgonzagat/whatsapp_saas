'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { Database, Play, Server } from 'lucide-react';
import { StatusPill } from './AutopilotSafetyBrakesHelpers';
import AutopilotSafetyBrakesConfigPanel from './AutopilotSafetyBrakesConfigPanel';
import type {
  AutopilotSmokeResultLike,
  QueueStatsLike,
  RuntimeConfigLike,
  AutopilotConfigLike,
} from './AutopilotSafetyBrakes.types';

export type { AutopilotSmokeResultLike, QueueStatsLike, RuntimeConfigLike, AutopilotConfigLike };

export default function AutopilotSafetyBrakes({
  queueStats,
  runtimeConfig,
  smokeResult,
  testPhone,
  testMessage,
  testLiveSend,
  isTesting,
  onTestPhoneChange,
  onTestMessageChange,
  onTestLiveSendChange,
  onSmokeTest,
  config,
  isEditingConfig,
  configDraft,
  isSavingConfig,
  onConfigDraftChange,
  onToggleEditingConfig,
  onSaveConfig,
}: {
  queueStats: QueueStatsLike | null;
  runtimeConfig: RuntimeConfigLike | null;
  smokeResult: AutopilotSmokeResultLike | null;
  testPhone: string;
  testMessage: string;
  testLiveSend: boolean;
  isTesting: boolean;
  onTestPhoneChange: (v: string) => void;
  onTestMessageChange: (v: string) => void;
  onTestLiveSendChange: (v: boolean) => void;
  onSmokeTest: () => void;
  config: AutopilotConfigLike | null;
  isEditingConfig: boolean;
  configDraft: AutopilotConfigLike;
  isSavingConfig: boolean;
  onConfigDraftChange: (updater: (prev: AutopilotConfigLike) => AutopilotConfigLike) => void;
  onToggleEditingConfig: () => void;
  onSaveConfig: () => void;
}) {
  const queueTotal = queueStats
    ? (queueStats.waiting || 0) +
      (queueStats.active || 0) +
      (queueStats.delayed || 0) +
      (queueStats.failed || 0)
    : 0;

  const queueHealthStatus = (() => {
    if (!queueStats) {
      return 'unknown';
    }
    if ((queueStats.failed || 0) > 10) {
      return 'critical';
    }
    if ((queueStats.waiting || 0) > 50 || (queueStats.delayed || 0) > 20) {
      return 'degraded';
    }
    return 'healthy';
  })();

  return (
    <>
      <div
        className="p-5 rounded-xl border"
        style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
      >
        <div className="flex items-start justify-between gap-4 mb-5 flex-col md:flex-row">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
              {kloelT(`Testar Autopilot`)}
            </h2>
            <p className="text-sm" style={{ color: colors.text.muted }}>
              {kloelT(
                `Executa um smoke test do pipeline ponta a ponta. O padrão é dry-run, sem enviar nada ao cliente.`,
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
            <span style={{ color: colors.text.secondary }}>{kloelT(`Telefone de teste`)}</span>
            <input
              value={testPhone}
              onChange={(e) => onTestPhoneChange(e.target.value)}
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
              onChange={(e) => onTestLiveSendChange(e.target.checked)}
            />
            <span style={{ color: colors.text.secondary }}>
              {kloelT(`Enviar de verdade para esse número`)}
            </span>
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm">
          <span style={{ color: colors.text.secondary }}>{kloelT(`Mensagem de teste`)}</span>
          <textarea
            value={testMessage}
            onChange={(e) => onTestMessageChange(e.target.value)}
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
              <StatusPill label={kloelT(`Modo`)} status={smokeResult.mode} />
              <StatusPill label={kloelT(`Resultado`)} status={smokeResult.result?.status} />
              <StatusPill
                label={kloelT(`Fila waiting`)}
                status={String(smokeResult.queue?.waiting ?? 0)}
              />
              <StatusPill
                label={kloelT(`Fila failed`)}
                status={String(smokeResult.queue?.failed ?? 0)}
              />
            </div>
            <div className="space-y-2 text-sm">
              <p style={{ color: colors.text.primary }}>
                <strong>{kloelT(`Telefone:`)}</strong> {smokeResult.phone}
              </p>
              <p style={{ color: colors.text.primary }}>
                <strong>{kloelT(`Mensagem:`)}</strong> {smokeResult.message}
              </p>
              {smokeResult.result?.previewText && (
                <div>
                  <p className="mb-1" style={{ color: colors.text.secondary }}>
                    {kloelT(`Preview da resposta do Kloel`)}
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
                  <strong>{kloelT(`Motivo:`)}</strong> {smokeResult.result.reason}
                </p>
              )}
              {smokeResult.result?.error && (
                <p style={{ color: colors.semantic.errorText }}>
                  <strong>{kloelT(`Erro:`)}</strong> {smokeResult.result.error}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-0">
        <div
          className="p-5 rounded-xl border"
          style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${colors.brand.cyan}20` }}>
              <Server size={20} style={{ color: colors.brand.cyan }} aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                {kloelT(`Saúde da Fila (BullMQ)`)}
              </h2>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT(`Status do processamento de mensagens`)}
              </p>
            </div>
            <div
              className="px-3 py-1 rounded-full text-xs font-semibold uppercase"
              style={{
                backgroundColor:
                  queueHealthStatus === 'healthy'
                    ? `${colors.brand.green}20`
                    : queueHealthStatus === 'degraded'
                      ? 'rgba(245, 158, 11, 0.15)'
                      : queueHealthStatus === 'critical'
                        ? 'rgba(239, 68, 68, 0.12)'
                        : `${colors.brand.cyan}18`,
                color:
                  queueHealthStatus === 'healthy'
                    ? colors.brand.green
                    : queueHealthStatus === 'degraded'
                      ? colors.semantic.warning
                      : queueHealthStatus === 'critical'
                        ? colors.semantic.error
                        : colors.brand.cyan,
              }}
            >
              {queueHealthStatus === 'healthy'
                ? 'Saudável'
                : queueHealthStatus === 'degraded'
                  ? 'Degradado'
                  : queueHealthStatus === 'critical'
                    ? 'Crítico'
                    : 'Desconhecido'}
            </div>
          </div>

          {queueStats ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <StatusPill label={kloelT(`Esperando`)} status={String(queueStats.waiting ?? 0)} />
                <StatusPill label={kloelT(`Ativas`)} status={String(queueStats.active ?? 0)} />
                <StatusPill label={kloelT(`Atrasadas`)} status={String(queueStats.delayed ?? 0)} />
                <StatusPill label={kloelT(`Falhas`)} status={String(queueStats.failed ?? 0)} />
              </div>
              {(queueStats.completed != null || queueStats.paused != null) && (
                <div className="grid grid-cols-2 gap-3">
                  {queueStats.completed != null && (
                    <StatusPill
                      label={kloelT(`Completadas`)}
                      status={String(queueStats.completed)}
                    />
                  )}
                  {queueStats.paused != null && (
                    <StatusPill label={kloelT(`Pausadas`)} status={String(queueStats.paused)} />
                  )}
                </div>
              )}
              <div
                className="flex items-center justify-between p-3 rounded-lg text-sm"
                style={{ backgroundColor: colors.background.surface2 }}
              >
                <span style={{ color: colors.text.secondary }}>{kloelT(`Total na fila`)}</span>
                <span
                  className="font-semibold"
                  style={{ color: colors.text.primary, fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {queueTotal}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="p-6 rounded-lg text-center"
              style={{ backgroundColor: colors.background.surface2 }}
            >
              <Server
                size={32}
                className="mx-auto mb-2"
                style={{ color: colors.text.muted }}
                aria-hidden="true"
              />
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT(`Dados da fila indisponíveis`)}
              </p>
            </div>
          )}
        </div>

        <div
          className="p-5 rounded-xl border"
          style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${colors.brand.cyan}20` }}>
              <Database size={20} style={{ color: colors.brand.cyan }} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                {kloelT(`Configuracao de Runtime`)}
              </h2>
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT(`Parametros de execucao do Autopilot`)}
              </p>
            </div>
          </div>

          {runtimeConfig ? (
            <div className="space-y-2">
              {Object.entries(runtimeConfig).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ backgroundColor: colors.background.surface2 }}
                >
                  <span className="text-sm" style={{ color: colors.text.secondary }}>
                    {key}
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{
                      color:
                        value === true
                          ? colors.brand.green
                          : value === false
                            ? colors.semantic.error
                            : colors.text.primary,
                      fontFamily:
                        typeof value === 'number' ? "'JetBrains Mono', monospace" : undefined,
                    }}
                  >
                    {value === true ? 'true' : value === false ? 'false' : String(value ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="p-6 rounded-lg text-center"
              style={{ backgroundColor: colors.background.surface2 }}
            >
              <Database
                size={32}
                className="mx-auto mb-2"
                style={{ color: colors.text.muted }}
                aria-hidden="true"
              />
              <p className="text-sm" style={{ color: colors.text.muted }}>
                {kloelT(`Configuracao de runtime indisponivel`)}
              </p>
            </div>
          )}
        </div>

        <AutopilotSafetyBrakesConfigPanel
          config={config}
          isEditingConfig={isEditingConfig}
          configDraft={configDraft}
          isSavingConfig={isSavingConfig}
          onConfigDraftChange={onConfigDraftChange}
          onToggleEditingConfig={onToggleEditingConfig}
          onSaveConfig={onSaveConfig}
        />
      </div>
    </>
  );
}
