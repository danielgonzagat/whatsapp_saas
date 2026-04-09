'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  KanbanSquare,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import {
  crmApi,
  segmentationApi,
  type CrmContact,
  type CrmDeal,
  type CrmPipeline,
  type SegmentationPreset,
  type SegmentationStats,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  kloelSettingsClass,
  SettingsCard,
  SettingsHeader,
  SettingsInset,
  SettingsMetricTile,
  SettingsNotice,
  SettingsStatusPill,
} from './contract';

function formatMoney(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function StatCard(props: { title: string; value: string; hint?: string }) {
  return (
    <SettingsMetricTile>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--app-text-secondary)]">
        {props.title}
      </p>
      <p className="mt-2 text-2xl font-semibold text-[var(--app-text-primary)]">{props.value}</p>
      {props.hint ? (
        <p className="mt-1 text-xs text-[var(--app-text-secondary)]">{props.hint}</p>
      ) : null}
    </SettingsMetricTile>
  );
}

const fieldClass =
  'h-10 rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition placeholder:text-[var(--app-text-placeholder)] focus:border-[var(--app-border-focus)]';

const textareaClass =
  'min-h-[96px] rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 py-2 text-sm text-[var(--app-text-primary)] outline-none transition placeholder:text-[var(--app-text-placeholder)] focus:border-[var(--app-border-focus)]';

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
    Array<{ id: string; phone: string; name?: string }>
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
    if (!selectedPipeline) return [];
    const stageIds = new Set(selectedPipeline.stages.map((stage) => stage.id));
    return deals.filter((deal) => stageIds.has(deal.stageId));
  }, [deals, selectedPipeline]);

  const stageDealMap = useMemo(() => {
    const map = new Map<string, CrmDeal[]>();
    if (!selectedPipeline) return map;
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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [contactsResponse, pipelinesResponse, dealsResponse, presetsResponse, statsResponse] =
        await Promise.all([
          crmApi.listContacts({ page: 1, limit: 20 }),
          crmApi.listPipelines(),
          crmApi.listDeals(),
          segmentationApi.getPresets(),
          segmentationApi.getStats(),
        ]);

      const nextContacts = contactsResponse.data?.data || [];
      const nextPipelines = pipelinesResponse.data || [];
      const nextDeals = dealsResponse.data || [];
      const nextPresets = presetsResponse.data?.presets || [];
      const nextStats = statsResponse.data || null;

      setContacts(nextContacts);
      setPipelines(nextPipelines);
      setDeals(nextDeals);
      setPresets(nextPresets);
      setSegmentStats(nextStats);

      const firstPipeline = nextPipelines[0];
      if (firstPipeline && !selectedPipelineId) {
        setSelectedPipelineId(firstPipeline.id);
      }
      const firstPreset = nextPresets[0];
      if (firstPreset && !selectedPreset) {
        setSelectedPreset(firstPreset.name);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Nao foi possivel carregar CRM e pipeline.');
    } finally {
      setLoading(false);
    }
  }, [selectedPipelineId, selectedPreset]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedPipeline?.stages?.length && !dealForm.stageId) {
      setDealForm((current) => ({ ...current, stageId: selectedPipeline.stages[0]?.id || '' }));
    }
  }, [dealForm.stageId, selectedPipeline]);

  useEffect(() => {
    if (!dealForm.contactId && contacts[0]?.id) {
      setDealForm((current) => ({ ...current, contactId: contacts[0]?.id || '' }));
    }
  }, [contacts, dealForm.contactId]);

  useEffect(() => {
    if (!selectedPreset) return;

    let active = true;
    setError(null);

    void segmentationApi
      .getPresetSegment(selectedPreset, 20)
      .then((response) => {
        if (!active) return;
        setPresetContacts(
          (response.data?.contacts || []).map((contact) => ({
            id: contact.id,
            phone: contact.phone,
            name: contact.name || undefined,
          })),
        );
        setPresetTotal(response.data?.total || 0);
      })
      .catch((presetError: any) => {
        if (!active) return;
        setError(presetError?.message || 'Nao foi possivel carregar o segmento selecionado.');
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
        name: contactForm.name.trim() || undefined,
        phone: contactForm.phone.trim(),
        email: contactForm.email.trim() || undefined,
        notes: contactForm.notes.trim() || undefined,
      });
      setContactForm({ name: '', phone: '', email: '', notes: '' });
      setSuccess('Contato criado no CRM.');
      await loadData();
    } catch (createError: any) {
      setError(createError?.message || 'Nao foi possivel criar o contato.');
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
    } catch (createError: any) {
      setError(createError?.message || 'Nao foi possivel criar o pipeline.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDeal = async () => {
    if (!dealForm.contactId || !dealForm.stageId || !dealForm.title.trim()) {
      setError('Preencha contato, etapa inicial e titulo do deal.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await crmApi.createDeal({
        contactId: dealForm.contactId,
        stageId: dealForm.stageId,
        title: dealForm.title.trim(),
        value: Number(dealForm.value || 0),
      });
      setDealForm((current) => ({ ...current, title: '', value: '' }));
      setSuccess('Deal criado no pipeline.');
      await loadData();
    } catch (createError: any) {
      setError(createError?.message || 'Nao foi possivel criar o deal.');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveDeal = async (deal: CrmDeal, direction: -1 | 1) => {
    if (!selectedPipeline) return;
    const currentIndex = selectedPipeline.stages.findIndex((stage) => stage.id === deal.stageId);
    const nextStage = selectedPipeline.stages[currentIndex + direction];
    if (!nextStage) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await crmApi.moveDeal(deal.id, nextStage.id);
      setSuccess(`Deal movido para ${nextStage.name}.`);
      await loadData();
    } catch (moveError: any) {
      setError(moveError?.message || 'Nao foi possivel mover o deal.');
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
    } catch (segmentError: any) {
      setError(segmentError?.message || 'Nao foi possivel rodar a auto-segmentacao.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className={kloelSettingsClass.sectionTitle}>CRM, segmentos e pipeline</h3>
          <p className={`mt-1 ${kloelSettingsClass.sectionDescription}`}>
            Contatos, segmentacao e deals operacionais sem sair da tela principal.
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
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Auto-segmentar
          </Button>
          <Button
            type="button"
            variant="outline"
            className={kloelSettingsClass.outlineButton}
            onClick={() => void loadData()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      {error ? (
        <SettingsNotice tone="danger" className="flex items-center gap-3">
          <XCircle className="h-4 w-4" />
          <span>{error}</span>
        </SettingsNotice>
      ) : null}

      {success ? <SettingsNotice tone="success">{success}</SettingsNotice> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Contatos" value={String(contacts.length)} hint="Primeira pagina do CRM" />
        <StatCard title="Pipelines" value={String(pipelines.length)} />
        <StatCard
          title="Deals"
          value={String(deals.length)}
          hint="Todos os deals ativos retornados"
        />
        <StatCard
          title="Media segmentada"
          value={String(Math.round(segmentStats?.total || 0))}
          hint="Media de contatos por preset"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SettingsCard>
          <SettingsHeader
            title="Novo contato"
            icon={<Users className="h-4 w-4" />}
            description="Crie contatos no CRM e mantenha as tags comerciais dentro do shell principal."
          />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              aria-label="Nome do contato"
              value={contactForm.name}
              onChange={(event) =>
                setContactForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Nome do contato"
              className={fieldClass}
            />
            <input
              aria-label="Telefone com DDI"
              value={contactForm.phone}
              onChange={(event) =>
                setContactForm((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="Telefone com DDI"
              className={fieldClass}
            />
            <input
              aria-label="Email do contato"
              value={contactForm.email}
              onChange={(event) =>
                setContactForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="Email"
              className={fieldClass}
            />
            <textarea
              aria-label="Observacao comercial"
              value={contactForm.notes}
              onChange={(event) =>
                setContactForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Observacao comercial"
              className={`${textareaClass} sm:col-span-2`}
            />
          </div>
          <Button
            type="button"
            className={`mt-4 ${kloelSettingsClass.primaryButton}`}
            onClick={() => void handleCreateContact()}
            disabled={saving}
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar contato
          </Button>

          <div className="mt-6 space-y-2">
            {(contacts || []).slice(0, 8).map((contact) => (
              <SettingsInset key={contact.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--app-text-primary)]">
                      {contact.name || 'Sem nome'}
                    </p>
                    <p className="text-xs text-[var(--app-text-secondary)]">{contact.phone}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {(contact.tags || []).map((tag) => (
                      <SettingsStatusPill key={tag.id}>{tag.name}</SettingsStatusPill>
                    ))}
                  </div>
                </div>
              </SettingsInset>
            ))}
          </div>
        </SettingsCard>

        <SettingsCard>
          <SettingsHeader
            title="Segmentacao"
            icon={<Sparkles className="h-4 w-4" />}
            description="Veja presets, volumes e audiencia operacional sem sair do CRM."
          />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(segmentStats?.segments || {})
              .slice(0, 8)
              .map(([name, total]) => (
                <SettingsInset key={name} className="px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--app-text-secondary)]">
                    {name}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[var(--app-text-primary)]">
                    {String(total)}
                  </p>
                </SettingsInset>
              ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <select
              value={selectedPreset}
              onChange={(event) => setSelectedPreset(event.target.value)}
              className={fieldClass}
            >
              <option value="">Escolha um preset</option>
              {presets.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.label || preset.name}
                </option>
              ))}
            </select>
            <SettingsInset className="px-4 py-2 text-sm text-[var(--app-text-secondary)]">
              {presetTotal} contatos nesse recorte
            </SettingsInset>
          </div>

          <div className="mt-4 space-y-2">
            {presetContacts.length === 0 ? (
              <SettingsNotice>Selecione um preset para ver a audiencia.</SettingsNotice>
            ) : (
              presetContacts.map((contact) => (
                <SettingsInset key={contact.id} className="px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--app-text-primary)]">
                    {contact.name || 'Contato sem nome'}
                  </p>
                  <p className="text-xs text-[var(--app-text-secondary)]">{contact.phone}</p>
                </SettingsInset>
              ))
            )}
          </div>
        </SettingsCard>
      </div>

      <SettingsCard>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <SettingsHeader
            className="mb-0"
            title="Pipeline e deals"
            icon={<KanbanSquare className="h-4 w-4" />}
            description="Crie pipeline, abra deals e mova etapas sem sair do shell principal."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              aria-label="Nome do novo pipeline"
              value={pipelineName}
              onChange={(event) => setPipelineName(event.target.value)}
              placeholder="Novo pipeline"
              className={fieldClass}
            />
            <select
              value={selectedPipeline?.id || ''}
              onChange={(event) => {
                setSelectedPipelineId(event.target.value);
                setDealForm((current) => ({
                  ...current,
                  stageId:
                    pipelines.find((pipeline) => pipeline.id === event.target.value)?.stages?.[0]
                      ?.id || '',
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
              <Plus className="mr-2 h-4 w-4" />
              Criar pipeline
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
            <option value="">Selecione o contato</option>
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
            <option value="">Etapa inicial</option>
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
            placeholder="Titulo do deal"
            className={fieldClass}
          />
          <input
            aria-label="Valor do deal em BRL"
            value={dealForm.value}
            onChange={(event) =>
              setDealForm((current) => ({ ...current, value: event.target.value }))
            }
            placeholder="Valor em BRL"
            className={fieldClass}
          />
        </div>

        <Button
          type="button"
          className={`mt-4 ${kloelSettingsClass.primaryButton}`}
          onClick={() => void handleCreateDeal()}
          disabled={saving}
        >
          <Plus className="mr-2 h-4 w-4" />
          Criar deal
        </Button>

        {!selectedPipeline ? (
          <SettingsNotice className="mt-6">Nenhum pipeline disponivel ainda.</SettingsNotice>
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
                      Nenhum deal nesta etapa.
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
                            <ArrowLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={`px-3 ${kloelSettingsClass.cardButton}`}
                            onClick={() => void handleMoveDeal(deal, 1)}
                            disabled={saving || index === selectedPipeline.stages.length - 1}
                          >
                            <ArrowRight className="h-4 w-4" />
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
    </div>
  );
}
