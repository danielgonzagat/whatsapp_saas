'use client';

import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';
import { Button } from '@/components/ui/button';
import {
  type CrmDeal,
  type CrmPipeline,
  type CrmContact,
  type SegmentationPreset,
  type SegmentationStats,
  crmApi,
  segmentationApi,
} from '@/lib/api';
import { RotateCw, Sparkles, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SettingsNotice, kloelSettingsClass } from './contract';
import { errorMessage } from './crm-settings-section.helpers';
import { fetchCrmInitialData } from './crm-settings-section.handlers';
import { ContactCard, SegmentationCard, StatCard } from './crm-settings-section.parts';
import { PipelineCard } from './crm-settings-section.pipeline';


interface PresetSegmentContactPayload {
  id: string;
  phone: string;
  name?: string | null;
}

function isPresetSegmentContactPayload(value: unknown): value is PresetSegmentContactPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { id?: unknown; phone?: unknown };
  return typeof candidate.id === 'string' && typeof candidate.phone === 'string';
}

function normalizePresetSegmentPayload(response: unknown): {
  contacts: Array<{ id: string; phone: string; name?: string | undefined }>;
  total: number;
} {
  const data = response && typeof response === 'object' && 'data' in response
    ? (response as { data?: unknown }).data
    : undefined;

  if (!data || typeof data !== 'object' || !('contacts' in data)) {
    throw new Error('Payload de segmento CRM invalido.');
  }

  const segment = data as { contacts?: unknown; total?: unknown };
  if (!Array.isArray(segment.contacts) || !segment.contacts.every(isPresetSegmentContactPayload)) {
    throw new Error('Payload de segmento CRM invalido.');
  }
  if (typeof segment.total !== 'number') {
    throw new Error('Payload de segmento CRM invalido.');
  }

  return {
    contacts: segment.contacts.map((contact) => ({
      id: contact.id,
      phone: contact.phone,
      name: contact.name || undefined,
    })),
    total: segment.total,
  };
}

/** Crm settings section. */
export function CrmSettingsSection() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [presets, setPresets] = useState<SegmentationPreset[]>([]);
  const [segmentStats, setSegmentStats] = useState<SegmentationStats | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [presetContacts, setPresetContacts] = useState<
    Array<{ id: string; phone: string; name?: string | undefined }>
  >([]);
  const [presetTotal, setPresetTotal] = useState(0);

  const [contactForm, setContactForm] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [pipelineName, setPipelineName] = useState('');
  const [dealForm, setDealForm] = useState({
    contactId: '',
    stageId: '',
    title: '',
    value: '',
  });

  const selectedPipeline = useMemo(
    () => pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? pipelines[0] ?? null,
    [pipelines, selectedPipelineId],
  );

  const stageDeals = useMemo(() => {
    if (!selectedPipeline) {
      return [];
    }
    const stageIds = new Set(selectedPipeline.stages.map((stage) => stage.id));
    return deals.filter((deal) => stageIds.has(deal.stageId));
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
          .filter((deal) => deal.stageId === stage.id)
          .sort((a, b) => {
            const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
          }),
      );
    }
    return map;
  }, [selectedPipeline, stageDeals]);

  // Promise-chain (non-async) so no setState runs synchronously in the effect
  // tick (react-hooks/set-state-in-effect).
  const loadData = useCallback(() => {
    return Promise.resolve()
      .then(() => {
        setLoading(true);
        setError(null);
        return fetchCrmInitialData();
      })
      .then((nextData) => {
        setContacts(nextData.contacts);
        setPipelines(nextData.pipelines);
        setDeals(nextData.deals);
        setPresets(nextData.presets);
        setSegmentStats(nextData.stats);

        const firstPipeline = nextData.pipelines[0];
        if (firstPipeline && !selectedPipelineId) {
          setSelectedPipelineId(firstPipeline.id);
        }
        const firstPreset = nextData.presets[0];
        if (firstPreset && !selectedPreset) {
          setSelectedPreset(firstPreset.name);
        }
      })
      .catch((loadError: unknown) => {
        setError(errorMessage(loadError, 'Nao foi possivel carregar CRM e pipeline.'));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedPipelineId, selectedPreset]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Derived-during-render defaults: when the user has not yet picked a stage or
  // contact, fall back to the first available option instead of syncing that
  // default into state via an effect (react-hooks/set-state-in-effect).
  const effectiveDealForm = useMemo(
    () => ({
      ...dealForm,
      stageId: dealForm.stageId || (selectedPipeline?.stages?.[0]?.id ?? ''),
      contactId: dealForm.contactId || (contacts[0]?.id ?? ''),
    }),
    [contacts, dealForm, selectedPipeline],
  );

  useEffect(() => {
    if (!selectedPreset) {
      return;
    }

    let active = true;

    // setError(null) lives inside the chain so no setState runs synchronously
    // in the effect tick (react-hooks/set-state-in-effect).
    void Promise.resolve()
      .then(() => {
        if (active) {
          setError(null);
        }
        return segmentationApi.getPresetSegment(selectedPreset, 20);
      })
      .then((response) => {
        if (!active) {
          return;
        }
        const nextSegment = normalizePresetSegmentPayload(response);
        setPresetContacts(nextSegment.contacts);
        setPresetTotal(nextSegment.total);
      })
      .catch((presetError: unknown) => {
        if (!active) {
          return;
        }
        setError(errorMessage(presetError, 'Nao foi possivel carregar o segmento selecionado.'));
      });

    return () => {
      active = false;
    };
  }, [selectedPreset]);

  const handleCreateContact = async () => {
    if (!contactForm.phone.trim()) {
      setError('Informe o telefone do contato.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await crmApi.createContact({
        phone: contactForm.phone.trim(),
        ...(contactForm.name.trim() ? { name: contactForm.name.trim() } : {}),
        ...(contactForm.email.trim() ? { email: contactForm.email.trim() } : {}),
        ...(contactForm.notes.trim() ? { notes: contactForm.notes.trim() } : {}),
      });
      setContactForm({ name: '', phone: '', email: '', notes: '' });
      setSuccess('Contato criado no CRM.');
      await loadData();
    } catch (createError) {
      setError(errorMessage(createError, 'Nao foi possivel criar o contato.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePipeline = async () => {
    if (!pipelineName.trim()) {
      setError('Informe o nome do pipeline.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await crmApi.createPipeline(pipelineName.trim());
      const createdPipeline = response.data;
      setPipelineName('');
      if (createdPipeline?.id) {
        setSelectedPipelineId(createdPipeline.id);
      }
      setSuccess('Pipeline criado com sucesso.');
      await loadData();
    } catch (createError) {
      setError(errorMessage(createError, 'Nao foi possivel criar o pipeline.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDeal = async () => {
    if (!effectiveDealForm.contactId || !effectiveDealForm.stageId || !dealForm.title.trim()) {
      setError('Preencha contato, etapa inicial e titulo do deal.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await crmApi.createDeal({
        contactId: effectiveDealForm.contactId,
        stageId: effectiveDealForm.stageId,
        title: dealForm.title.trim(),
        value: Number(dealForm.value || 0),
      });
      setDealForm((current) => ({ ...current, title: '', value: '' }));
      setSuccess('Deal criado no pipeline.');
      await loadData();
    } catch (createError) {
      setError(errorMessage(createError, 'Nao foi possivel criar o deal.'));
    } finally {
      setSaving(false);
    }
  };

  const handleMoveDeal = async (deal: CrmDeal, direction: -1 | 1) => {
    if (!selectedPipeline) {
      return;
    }
    const currentIndex = selectedPipeline.stages.findIndex((stage) => stage.id === deal.stageId);
    const nextStage = selectedPipeline.stages[currentIndex + direction];
    if (!nextStage) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await crmApi.moveDeal(deal.id, nextStage.id);
      setSuccess(`Deal movido para ${nextStage.name}.`);
      await loadData();
    } catch (moveError) {
      setError(errorMessage(moveError, 'Nao foi possivel mover o deal.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAutoSegment = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await segmentationApi.autoSegment();
      const processed = response.data?.processed ?? 0;
      setSuccess(`Auto-segmentacao concluida para ${processed} contatos.`);
      await loadData();
    } catch (segmentError) {
      setError(errorMessage(segmentError, 'Nao foi possivel rodar a auto-segmentacao.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className={kloelSettingsClass.sectionTitle}>{kloelT(`CRM, segmentos e pipeline`)}</h3>
          <p className={`mt-1 ${kloelSettingsClass.sectionDescription}`}>
            {kloelT(`Contatos, segmentacao e deals operacionais sem sair da tela principal.`)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className={kloelSettingsClass.outlineButton}
            onClick={() => void handleAutoSegment()}
            disabled={saving}
          >
            {saving ? (
              <KloelMushroomMark
                size={18}
                title="Auto-segmentando"
                traceColor={colors.ember.primary}
              />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
            )}

            {kloelT(`Auto-segmentar`)}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={kloelSettingsClass.outlineButton}
            onClick={() => void loadData()}
            disabled={loading}
          >
            {loading ? (
              <KloelMushroomMark
                size={18}
                title="Atualizando CRM"
                traceColor={colors.ember.primary}
              />
            ) : (
              <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            )}

            {kloelT(`Atualizar`)}
          </Button>
        </div>
      </div>

      {error ? (
        <SettingsNotice tone="danger" className="flex items-center gap-3">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <span>{error}</span>
        </SettingsNotice>
      ) : null}

      {success ? <SettingsNotice tone="success">{success}</SettingsNotice> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          uppercase
          title={kloelT(`Contatos`)}
          value={String(contacts.length)}
          hint={kloelT(`Primeira pagina do CRM`)}
        />
        <StatCard uppercase title={kloelT(`Pipelines`)} value={String(pipelines.length)} />
        <StatCard
          uppercase
          title={kloelT(`Deals`)}
          value={String(deals.length)}
          hint={kloelT(`Todos os deals ativos retornados`)}
        />
        <StatCard
          uppercase
          title={kloelT(`Media segmentada`)}
          value={String(Math.round(segmentStats?.total || 0))}
          hint={kloelT(`Media de contatos por preset`)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ContactCard
          contactForm={contactForm}
          contacts={contacts}
          saving={saving}
          onFieldChange={(field, value) =>
            setContactForm((current) => ({ ...current, [field]: value }))
          }
          onCreateContact={() => void handleCreateContact()}
        />
        <SegmentationCard
          segmentStats={segmentStats}
          presets={presets}
          selectedPreset={selectedPreset}
          presetTotal={presetTotal}
          presetContacts={presetContacts}
          onPresetChange={setSelectedPreset}
        />
      </div>

      <PipelineCard
        pipelines={pipelines}
        selectedPipeline={selectedPipeline}
        pipelineName={pipelineName}
        contacts={contacts}
        dealForm={effectiveDealForm}
        saving={saving}
        stageDealMap={stageDealMap}
        onPipelineNameChange={setPipelineName}
        onPipelineSelect={(pipelineId) => {
          setSelectedPipelineId(pipelineId);
          setDealForm((current) => ({
            ...current,
            stageId:
              pipelines.find((p) => p.id === pipelineId)?.stages?.[0]?.id || '',
          }));
        }}
        onDealFormFieldChange={(field, value) =>
          setDealForm((current) => ({ ...current, [field]: value }))
        }
        onCreatePipeline={() => void handleCreatePipeline()}
        onCreateDeal={() => void handleCreateDeal()}
        onMoveDeal={(deal, direction) => void handleMoveDeal(deal, direction)}
      />
    </div>
  );
}
