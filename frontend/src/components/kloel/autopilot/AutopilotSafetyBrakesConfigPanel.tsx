import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';
import { Save, Settings2, XCircle } from 'lucide-react';
import type { AutopilotConfigLike } from './AutopilotSafetyBrakes.types';

export default function AutopilotSafetyBrakesConfigPanel({
  config,
  isEditingConfig,
  configDraft,
  isSavingConfig,
  onConfigDraftChange,
  onToggleEditingConfig,
  onSaveConfig,
}: {
  config: AutopilotConfigLike | null;
  isEditingConfig: boolean;
  configDraft: AutopilotConfigLike;
  isSavingConfig: boolean;
  onConfigDraftChange: (updater: (prev: AutopilotConfigLike) => AutopilotConfigLike) => void;
  onToggleEditingConfig: () => void;
  onSaveConfig: () => void;
}) {
  return (
    <div
      className="p-5 rounded-xl border"
      style={{
        backgroundColor: colors.background.surface1,
        borderColor: colors.stroke,
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${colors.brand.green}20` }}>
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
          onClick={onToggleEditingConfig}
          className="p-2 rounded-lg transition-colors hover:bg-white/5"
          style={{
            color: isEditingConfig ? colors.semantic.error : colors.text.muted,
          }}
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
            <span style={{ color: colors.text.secondary }}>{kloelT('Flow de Conversão (ID)')}</span>
            <input
              value={configDraft.conversionFlowId || ''}
              onChange={(e) =>
                onConfigDraftChange((prev) => ({
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
                onConfigDraftChange((prev) => ({
                  ...prev,
                  currencyDefault: e.target.value,
                }))
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
                onConfigDraftChange((prev) => ({
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
              <Button variant="ghost" size="sm" onClick={onToggleEditingConfig}>
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
  );
}
