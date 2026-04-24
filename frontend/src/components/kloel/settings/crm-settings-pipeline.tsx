'use client';

import { kloelT } from '@/lib/i18n/t';
import { Button } from '@/components/ui/button';
import { type CrmContact, type CrmDeal, type CrmPipeline, crmApi } from '@/lib/api';
import { ArrowLeft, ArrowRight, KanbanSquare, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsNotice,
  kloelSettingsClass,
} from './contract';
import { errorMessage, formatMoney } from './crm-settings-section.helpers';

const fieldClass =
  'h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition placeholder:text-[var(--app-text-placeholder)] focus:border-[var(--app-border-focus)]';

interface CrmSettingsPipelineProps {
  contacts: CrmContact[];
  pipelines: CrmPipeline[];
  deals: CrmDeal[];
  selectedPipelineId: string;
  onPipelineSelect: (id: string) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onReload: () => Promise<void>;
}

/** Pipeline creation, deal creation and deal board card. */
export function CrmSettingsPipeline({
  contacts,
  pipelines,
  deals,
  selectedPipelineId,
  onPipelineSelect,
  onSuccess,
  onError,
  onReload,
}: CrmSettingsPipelineProps) {
  const [saving, setSaving] = useState(false);
  const [pipelineName, setPipelineName] = useState('');
  const [dealForm, setDealForm] = useState({
    contactId: contacts[0]?.id || '',
    stageId: '',
    title: '',
    value: '',
  });

  const selectedPipeline = useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? pipelines[0] ?? null,
    [pipelines, selectedPipelineId],
  );

  const stageDeals = useMemo(() => {
    if (!selectedPipeline) {
      return [];
    }
    const stageIds = new Set(selectedPipeline.stages.map((s) => s.id));
    return deals.filter((d) => stageIds.has(d.stageId));
  }, [deals, selectedPipeline]);

  const stageDealMap = useMemo(() => {
    const map = new Map<string, CrmDeal[]>();
    if (!selectedPipeline) {
      return map;
    }
    for (const stage of selectedPipeline.stages) {
      map.set(
        stage.id,
        stageDeals
          .filter((d) => d.stageId === stage.id)
          .sort((a, b) => {
            const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
          }),
      );
    }
    return map;
  }, [selectedPipeline, stageDeals]);

  const handleCreatePipeline = async () => {
    if (!pipelineName.trim()) {
      onError('Informe o nome do pipeline.');
      return;
    }
    setSaving(true);
    try {
      const response = await crmApi.createPipeline(pipelineName.trim());
      const created = response.data;
      setPipelineName('');
      if (created?.id) {
        onPipelineSelect(created.id);
      }
      onSuccess('Pipeline criado com sucesso.');
      await onReload();
    } catch (createError) {
      onError(errorMessage(createError, 'Nao foi possivel criar o pipeline.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDeal = async () => {
    if (!dealForm.contactId || !dealForm.stageId || !dealForm.title.trim()) {
      onError('Preencha contato, etapa inicial e titulo do deal.');
      return;
    }
    setSaving(true);
    try {
      await crmApi.createDeal({
        contactId: dealForm.contactId,
        stageId: dealForm.stageId,
        title: dealForm.title.trim(),
        value: Number(dealForm.value || 0),
      });
      setDealForm((current) => ({ ...current, title: '', value: '' }));
      onSuccess('Deal criado no pipeline.');
      await onReload();
    } catch (createError) {
      onError(errorMessage(createError, 'Nao foi possivel criar o deal.'));
    } finally {
      setSaving(false);
    }
  };

  const handleMoveDeal = async (deal: CrmDeal, direction: -1 | 1) => {
    if (!selectedPipeline) {
      return;
    }
    const currentIndex = selectedPipeline.stages.findIndex((s) => s.id === deal.stageId);
    const nextStage = selectedPipeline.stages[currentIndex + direction];
    if (!nextStage) {
      return;
    }
    setSaving(true);
    try {
      await crmApi.moveDeal(deal.id, nextStage.id);
      onSuccess(`Deal movido para ${nextStage.name}.`);
      await onReload();
    } catch (moveError) {
      onError(errorMessage(moveError, 'Nao foi possivel mover o deal.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <SettingsHeader
          className="mb-0"
          title={kloelT(`Pipeline e deals`)}
          icon={<KanbanSquare className="h-4 w-4" aria-hidden="true" />}
          description={kloelT(
            `Crie pipeline, abra deals e mova etapas sem sair do shell principal.`,
          )}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            aria-label="Nome do novo pipeline"
            value={pipelineName}
            onChange={(event) => setPipelineName(event.target.value)}
            placeholder={kloelT(`Novo pipeline`)}
            className={fieldClass}
          />
          <select
            value={selectedPipeline?.id || ''}
            onChange={(event) => {
              onPipelineSelect(event.target.value);
              setDealForm((current) => ({
                ...current,
                stageId: pipelines.find((p) => p.id === event.target.value)?.stages?.[0]?.id || '',
              }));
            }}
            className={fieldClass}
          >
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            className={kloelSettingsClass.outlineButton}
            onClick={() => void handleCreatePipeline()}
            disabled={saving}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {kloelT(`Criar pipeline`)}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-4">
        <select
          value={dealForm.contactId}
          onChange={(event) =>
            setDealForm((current) => ({ ...current, contactId: event.target.value }))
          }
          className={fieldClass}
        >
          <option value="">{kloelT(`Selecione o contato`)}</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name || contact.phone}
            </option>
          ))}
        </select>
        <select
          value={dealForm.stageId}
          onChange={(event) =>
            setDealForm((current) => ({ ...current, stageId: event.target.value }))
          }
          className={fieldClass}
        >
          <option value="">{kloelT(`Etapa inicial`)}</option>
          {(selectedPipeline?.stages || []).map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Titulo do deal"
          value={dealForm.title}
          onChange={(event) =>
            setDealForm((current) => ({ ...current, title: event.target.value }))
          }
          placeholder={kloelT(`Titulo do deal`)}
          className={fieldClass}
        />
        <input
          aria-label="Valor do deal em BRL"
          value={dealForm.value}
          onChange={(event) =>
            setDealForm((current) => ({ ...current, value: event.target.value }))
          }
          placeholder={kloelT(`Valor em BRL`)}
          className={fieldClass}
        />
      </div>

      <Button
        type="button"
        className={`mt-4 ${kloelSettingsClass.primaryButton}`}
        onClick={() => void handleCreateDeal()}
        disabled={saving}
      >
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        {kloelT(`Criar deal`)}
      </Button>

      {!selectedPipeline ? (
        <SettingsNotice className="mt-6">
          {kloelT(`Nenhum pipeline disponivel ainda.`)}
        </SettingsNotice>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
          {selectedPipeline.stages.map((stage, index) => (
            <SettingsInset key={stage.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: stage.color || '#d1d5db' }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-[var(--app-text-primary)]">
                      {stage.name}
                    </p>
                    <p className="text-xs text-[var(--app-text-secondary)]">
                      {(stageDealMap.get(stage.id) || []).length} deals
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {(stageDealMap.get(stage.id) || []).length === 0 ? (
                  <SettingsInset className="px-3 py-4 text-sm text-[var(--app-text-secondary)]">
                    {kloelT(`Nenhum deal nesta etapa.`)}
                  </SettingsInset>
                ) : (
                  (stageDealMap.get(stage.id) || []).map((deal) => (
                    <SettingsInset
                      key={deal.id}
                      className="border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] p-4"
                    >
                      <p className="text-sm font-semibold text-[var(--app-text-primary)]">
                        {deal.title}
                      </p>
                      <p className="mt-1 text-xs text-[var(--app-text-secondary)]">
                        {deal.contact?.name || deal.contact?.phone || 'Sem contato'}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--app-text-primary)]">
                        {formatMoney(deal.value)}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className={`px-3 ${kloelSettingsClass.cardButton}`}
                          onClick={() => void handleMoveDeal(deal, -1)}
                          disabled={saving || index === 0}
                        >
                          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className={`px-3 ${kloelSettingsClass.cardButton}`}
                          onClick={() => void handleMoveDeal(deal, 1)}
                          disabled={saving || index === selectedPipeline.stages.length - 1}
                        >
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </SettingsInset>
                  ))
                )}
              </div>
            </SettingsInset>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}
