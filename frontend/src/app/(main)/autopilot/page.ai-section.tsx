'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Button, CenterStage, Section } from '@/components/kloel';
import { Database, Save, Server, Settings2, XCircle } from 'lucide-react';
import type { RuntimeConfig } from '@/lib/api';
import type { Dispatch, SetStateAction } from 'react';
import type { QueueStats, AutopilotConfigData } from './page.ui';
import { StatusPill } from './page.ui';

interface QueueConfigSectionProps {
  queueStats: QueueStats | null;
  queueTotal: number;
  queueHealthStatus: string;
  runtimeConfig: RuntimeConfig | null;
  config: AutopilotConfigData | null;
  configDraft: AutopilotConfigData;
  setConfigDraft: Dispatch<SetStateAction<AutopilotConfigData>>;
  isEditingConfig: boolean;
  setIsEditingConfig: (v: boolean) => void;
  isSavingConfig: boolean;
  onSaveConfig: () => void;
}

export function QueueConfigSection({
  queueStats,
  queueTotal,
  queueHealthStatus,
  runtimeConfig,
  config,
  configDraft,
  setConfigDraft,
  isEditingConfig,
  setIsEditingConfig,
  isSavingConfig,
  onSaveConfig,
}: QueueConfigSectionProps) {
  return (
    <Section spacing="lg">
      <CenterStage size="XL">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Queue Stats */}
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
                  {kloelT('Saúde da Fila (BullMQ)')}
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT('Status do processamento de mensagens')}
                </p>
              </div>
              <div
                className="px-3 py-1 rounded-full text-xs font-semibold uppercase"
                style={{
                  backgroundColor:
                    queueHealthStatus === 'healthy'
                      ? `${colors.brand.green}20`
                      : queueHealthStatus === 'degraded'
                        ? `${colors.state.warning}26`
                        : queueHealthStatus === 'critical'
                          ? `${colors.state.error}1F`
                          : `${colors.brand.cyan}18`,
                  color:
                    queueHealthStatus === 'healthy'
                      ? colors.brand.green
                      : queueHealthStatus === 'degraded'
                        ? colors.state.warning
                        : queueHealthStatus === 'critical'
                          ? colors.state.error
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
                  <StatusPill
                    label={kloelT('Esperando')}
                    status={String(queueStats.waiting ?? 0)}
                  />
                  <StatusPill label={kloelT('Ativas')} status={String(queueStats.active ?? 0)} />
                  <StatusPill
                    label={kloelT('Atrasadas')}
                    status={String(queueStats.delayed ?? 0)}
                  />
                  <StatusPill label={kloelT('Falhas')} status={String(queueStats.failed ?? 0)} />
                </div>
                {(queueStats.completed != null || queueStats.paused != null) && (
                  <div className="grid grid-cols-2 gap-3">
                    {queueStats.completed != null && (
                      <StatusPill
                        label={kloelT('Completadas')}
                        status={String(queueStats.completed)}
                      />
                    )}
                    {queueStats.paused != null && (
                      <StatusPill label={kloelT('Pausadas')} status={String(queueStats.paused)} />
                    )}
                  </div>
                )}
                <div
                  className="flex items-center justify-between p-3 rounded-lg text-sm"
                  style={{ backgroundColor: colors.background.surface2 }}
                >
                  <span style={{ color: colors.text.secondary }}>{kloelT('Total na fila')}</span>
                  <span
                    className="font-semibold"
                    style={{
                      color: colors.text.primary,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
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
                  {kloelT('Dados da fila indisponíveis')}
                </p>
              </div>
            )}
          </div>

          {/* Runtime Config */}
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
                  {kloelT('Configuracao de Runtime')}
                </h2>
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT('Parametros de execucao do Autopilot')}
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
                              ? colors.state.error
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
                  {kloelT('Configuracao de runtime indisponivel')}
                </p>
              </div>
            )}
          </div>

          {/* Config Editor */}
          <div
            className="p-5 rounded-xl border"
            style={{ backgroundColor: colors.background.surface1, borderColor: colors.stroke }}
          >
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${colors.brand.green}20` }}
                >
                  <Settings2 size={20} style={{ color: colors.brand.green }} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: colors.text.primary }}>
                    {kloelT('Configuração')}
                  </h2>
                  <p className="text-sm" style={{ color: colors.text.muted }}>
                    {kloelT('Ajustes do Autopilot')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isEditingConfig) {
                    setConfigDraft(config || {});
                  }
                  setIsEditingConfig(!isEditingConfig);
                }}
                className="p-2 rounded-lg transition-colors hover:bg-white/5"
                style={{ color: isEditingConfig ? colors.state.error : colors.text.muted }}
              >
                {isEditingConfig ? (
                  <XCircle size={18} aria-hidden="true" />
                ) : (
                  <Settings2 size={18} aria-hidden="true" />
                )}
              </button>
            </div>

            {config ? (
              <div className="space-y-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span style={{ color: colors.text.secondary }}>
                    {kloelT('Flow de Conversão (ID)')}
                  </span>
                  <input
                    value={configDraft.conversionFlowId || ''}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        conversionFlowId: e.target.value || null,
                      }))
                    }
                    disabled={!isEditingConfig}
                    placeholder={kloelT('ID do flow')}
                    className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                    style={{
                      backgroundColor: isEditingConfig
                        ? colors.background.surface2
                        : colors.background.obsidian,
                      borderColor: colors.stroke,
                      color: colors.text.primary,
                      opacity: isEditingConfig ? 1 : 0.7,
                    }}
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span style={{ color: colors.text.secondary }}>{kloelT('Moeda Padrão')}</span>
                  <input
                    value={configDraft.currencyDefault || ''}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({ ...prev, currencyDefault: e.target.value }))
                    }
                    disabled={!isEditingConfig}
                    placeholder="BRL"
                    className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                    style={{
                      backgroundColor: isEditingConfig
                        ? colors.background.surface2
                        : colors.background.obsidian,
                      borderColor: colors.stroke,
                      color: colors.text.primary,
                      opacity: isEditingConfig ? 1 : 0.7,
                    }}
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span style={{ color: colors.text.secondary }}>
                    {kloelT('Template de Recuperação')}
                  </span>
                  <input
                    value={configDraft.recoveryTemplateName || ''}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        recoveryTemplateName: e.target.value || null,
                      }))
                    }
                    disabled={!isEditingConfig}
                    placeholder={kloelT('Nome do template')}
                    className="px-3 py-2.5 rounded-lg border outline-none text-sm"
                    style={{
                      backgroundColor: isEditingConfig
                        ? colors.background.surface2
                        : colors.background.obsidian,
                      borderColor: colors.stroke,
                      color: colors.text.primary,
                      opacity: isEditingConfig ? 1 : 0.7,
                    }}
                  />
                </label>

                {isEditingConfig && (
                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onSaveConfig}
                      isLoading={isSavingConfig}
                      leftIcon={!isSavingConfig ? <Save size={14} aria-hidden="true" /> : undefined}
                    >
                      {isSavingConfig ? 'Salvando...' : 'Salvar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setConfigDraft(config || {});
                        setIsEditingConfig(false);
                      }}
                    >
                      {kloelT('Cancelar')}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="p-6 rounded-lg text-center"
                style={{ backgroundColor: colors.background.surface2 }}
              >
                <Settings2
                  size={32}
                  className="mx-auto mb-2"
                  style={{ color: colors.text.muted }}
                  aria-hidden="true"
                />
                <p className="text-sm" style={{ color: colors.text.muted }}>
                  {kloelT('Configuração indisponível')}
                </p>
              </div>
            )}
          </div>
        </div>
      </CenterStage>
    </Section>
  );
}
