'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Button } from '@/components/ui/button';
import { type CrmContact, type CrmDeal, type CrmPipeline } from '@/lib/api';
import { ArrowLeft, ArrowRight, KanbanSquare, Plus } from 'lucide-react';
import {
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsNotice,
  kloelSettingsClass,
} from './contract';
import { formatMoney } from './crm-settings-section.helpers';
import { fieldClass } from './crm-settings-section.parts';
interface PipelineCardProps {
  pipelines: CrmPipeline[];
  selectedPipeline: CrmPipeline | null;
  pipelineName: string;
  contacts: CrmContact[];
  dealForm: { contactId: string; stageId: string; title: string; value: string };
  saving: boolean;
  stageDealMap: Map<string, CrmDeal[]>;
  onPipelineNameChange: (name: string) => void;
  onPipelineSelect: (pipelineId: string) => void;
  onDealFormFieldChange: (field: 'contactId' | 'stageId' | 'title' | 'value', value: string) => void;
  onCreatePipeline: () => void;
  onCreateDeal: () => void;
  onMoveDeal: (deal: CrmDeal, direction: -1 | 1) => void;
}
/** Pipeline and deals kanban card. */
export function PipelineCard({
  pipelines,
  selectedPipeline,
  pipelineName,
  contacts,
  dealForm,
  saving,
  stageDealMap,
  onPipelineNameChange,
  onPipelineSelect,
  onDealFormFieldChange,
  onCreatePipeline,
  onCreateDeal,
  onMoveDeal,
}: PipelineCardProps) {
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
            onChange={(event) => onPipelineNameChange(event.target.value)}
            placeholder={kloelT(`Novo pipeline`)}
            className={fieldClass}
          />
          <select
            value={selectedPipeline?.id || ''}
            onChange={(event) => onPipelineSelect(event.target.value)}
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
            onClick={() => void onCreatePipeline()}
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
            onDealFormFieldChange('contactId', event.target.value)
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
            onDealFormFieldChange('stageId', event.target.value)
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
            onDealFormFieldChange('title', event.target.value)
          }
          placeholder={kloelT(`Titulo do deal`)}
          className={fieldClass}
        />
        <input
          aria-label="Valor do deal em BRL"
          value={dealForm.value}
          onChange={(event) =>
            onDealFormFieldChange('value', event.target.value)
          }
          placeholder={kloelT(`Valor em BRL`)}
          className={fieldClass}
        />
      </div>

      <Button
        type="button"
        className={`mt-4 ${kloelSettingsClass.primaryButton}`}
        onClick={() => void onCreateDeal()}
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
                    style={{ backgroundColor: stage.color || colors.background.surface }}
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
                          onClick={() => void onMoveDeal(deal, -1)}
                          disabled={saving || index === 0}
                        >
                          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className={`px-3 ${kloelSettingsClass.cardButton}`}
                          onClick={() => void onMoveDeal(deal, 1)}
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
