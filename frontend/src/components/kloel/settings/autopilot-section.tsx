'use client';

import { kloelT } from '@/lib/i18n/t';
import { AccordionSection } from './accordion-section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  getAutopilotConfig,
  getAutopilotStatus,
  toggleAutopilot,
  tokenStorage,
  updateAutopilotConfig,
} from '@/lib/api';
import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export function AutopilotSection() {
  const workspaceId = tokenStorage.getWorkspaceId();
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [autopilotSaving, setAutopilotSaving] = useState(false);
  const [autopilotError, setAutopilotError] = useState('');
  const [autopilotSuccess, setAutopilotSuccess] = useState('');
  const [autopilotConfig, setAutopilotConfig] = useState({
    conversionFlowId: '',
    currencyDefault: '',
    recoveryTemplateName: '',
  });

  const hydrateAutopilot = useCallback(async () => {
    if (!workspaceId) {
      setAutopilotEnabled(false);
      setAutopilotConfig({
        conversionFlowId: '',
        currencyDefault: '',
        recoveryTemplateName: '',
      });
      return;
    }

    try {
      const [status, config] = await Promise.all([
        getAutopilotStatus(workspaceId),
        getAutopilotConfig(workspaceId),
      ]);

      setAutopilotEnabled(Boolean(status?.enabled));
      const autopilotCfg = (config?.autopilot ?? config) as Record<string, unknown> | undefined;
      setAutopilotConfig({
        conversionFlowId: String(autopilotCfg?.conversionFlowId || ''),
        currencyDefault: String(autopilotCfg?.currencyDefault || ''),
        recoveryTemplateName: String(autopilotCfg?.recoveryTemplateName || ''),
      });
    } catch (error: unknown) {
      setAutopilotError(
        error instanceof Error ? error.message : 'Nao foi possivel carregar a autonomia.',
      );
    }
  }, [workspaceId]);

  useEffect(() => {
    void hydrateAutopilot();
  }, [hydrateAutopilot]);

  const handleToggleAutopilot = useCallback(
    async (enabled: boolean) => {
      if (!workspaceId) {
        return;
      }
      setAutopilotSaving(true);
      setAutopilotError('');
      setAutopilotSuccess('');
      try {
        await toggleAutopilot(workspaceId, enabled);
        setAutopilotEnabled(enabled);
        setAutopilotSuccess(enabled ? 'Autonomia ativada.' : 'Autonomia pausada.');
      } catch (error: unknown) {
        setAutopilotError(
          error instanceof Error ? error.message : 'Nao foi possivel alternar a autonomia.',
        );
      } finally {
        setAutopilotSaving(false);
      }
    },
    [workspaceId],
  );

  const handleSaveAutopilotConfig = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setAutopilotSaving(true);
    setAutopilotError('');
    setAutopilotSuccess('');
    try {
      await updateAutopilotConfig(workspaceId, {
        conversionFlowId: autopilotConfig.conversionFlowId || null,
        currencyDefault: autopilotConfig.currencyDefault,
        recoveryTemplateName: autopilotConfig.recoveryTemplateName || null,
      });
      setAutopilotSuccess('Configuracao operacional do autopilot salva.');
    } catch (error: unknown) {
      setAutopilotError(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel salvar a configuracao do autopilot.',
      );
    } finally {
      setAutopilotSaving(false);
    }
  }, [autopilotConfig, workspaceId]);

  return (
    <AccordionSection icon={Sparkles} title={kloelT(`Autonomia comercial`)}>
      <div className="space-y-4">
        {(autopilotError || autopilotSuccess) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              autopilotError
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {autopilotError || autopilotSuccess}
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <div>
            <p className="text-sm font-medium text-gray-800">{kloelT(`Autopilot ativo`)}</p>
            <p className="text-xs text-gray-500">
              {kloelT(`Controla se o agente comercial age sozinho no workspace.`)}
            </p>
          </div>
          <Switch
            checked={autopilotEnabled}
            onCheckedChange={(value: boolean) => void handleToggleAutopilot(value)}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">{kloelT(`Flow de conversao`)}</Label>
            <Input
              value={autopilotConfig.conversionFlowId}
              onChange={(e) =>
                setAutopilotConfig((current) => ({
                  ...current,
                  conversionFlowId: e.target.value,
                }))
              }
              placeholder="flow_id_de_conversao"
              className="rounded-xl border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">{kloelT(`Moeda padrao`)}</Label>
            <Input
              value={autopilotConfig.currencyDefault}
              onChange={(e) =>
                setAutopilotConfig((current) => ({ ...current, currencyDefault: e.target.value }))
              }
              placeholder="BRL"
              className="rounded-xl border-gray-200"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label className="text-xs text-gray-500">{kloelT(`Template de recuperacao`)}</Label>
            <Input
              value={autopilotConfig.recoveryTemplateName}
              onChange={(e) =>
                setAutopilotConfig((current) => ({
                  ...current,
                  recoveryTemplateName: e.target.value,
                }))
              }
              placeholder="nome_do_template"
              className="rounded-xl border-gray-200"
            />
          </div>
        </div>

        <Button
          onClick={() => void handleSaveAutopilotConfig()}
          disabled={!workspaceId || autopilotSaving}
          className="w-full rounded-xl bg-[colors.text.silver] text-[colors.background.void] hover:bg-[colors.text.silver]"
        >
          {kloelT(`Salvar configuracao operacional`)}
        </Button>
      </div>
    </AccordionSection>
  );
}
