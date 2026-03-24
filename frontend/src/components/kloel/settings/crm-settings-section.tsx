"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
} from "lucide-react"
import {
  crmApi,
  segmentationApi,
  type CrmContact,
  type CrmDeal,
  type CrmPipeline,
  type SegmentationPreset,
  type SegmentationStats,
} from "@/lib/api"
import { Button } from "@/components/ui/button"

function formatMoney(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "R$ 0,00"
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function StatCard(props: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{props.title}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-gray-500">{props.hint}</p> : null}
    </div>
  )
}

export function CrmSettingsSection() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [pipelines, setPipelines] = useState<CrmPipeline[]>([])
  const [deals, setDeals] = useState<CrmDeal[]>([])
  const [presets, setPresets] = useState<SegmentationPreset[]>([])
  const [segmentStats, setSegmentStats] = useState<SegmentationStats | null>(null)
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("")
  const [selectedPreset, setSelectedPreset] = useState<string>("")
  const [presetContacts, setPresetContacts] = useState<Array<{ id: string; phone: string; name?: string }>>([])
  const [presetTotal, setPresetTotal] = useState(0)

  const [contactForm, setContactForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  })
  const [pipelineName, setPipelineName] = useState("")
  const [dealForm, setDealForm] = useState({
    contactId: "",
    stageId: "",
    title: "",
    value: "",
  })

  const selectedPipeline = useMemo(
    () => pipelines.find((pipeline) => pipeline.id === selectedPipelineId) ?? pipelines[0] ?? null,
    [pipelines, selectedPipelineId],
  )

  const stageDeals = useMemo(() => {
    if (!selectedPipeline) return []
    const stageIds = new Set(selectedPipeline.stages.map((stage) => stage.id))
    return deals.filter((deal) => stageIds.has(deal.stageId))
  }, [deals, selectedPipeline])

  const stageDealMap = useMemo(() => {
    const map = new Map<string, CrmDeal[]>()
    if (!selectedPipeline) return map
    for (const stage of selectedPipeline.stages) {
      map.set(
        stage.id,
        stageDeals
          .filter((deal) => deal.stageId === stage.id)
          .sort((a, b) => {
            const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime()
            const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime()
            return bTime - aTime
          }),
      )
    }
    return map
  }, [selectedPipeline, stageDeals])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [contactsResponse, pipelinesResponse, dealsResponse, presetsResponse, statsResponse] =
        await Promise.all([
          crmApi.listContacts({ page: 1, limit: 20 }),
          crmApi.listPipelines(),
          crmApi.listDeals(),
          segmentationApi.getPresets(),
          segmentationApi.getStats(),
        ])

      const nextContacts = contactsResponse.data?.data || []
      const nextPipelines = pipelinesResponse.data || []
      const nextDeals = dealsResponse.data || []
      const nextPresets = presetsResponse.data?.presets || []
      const nextStats = statsResponse.data || null

      setContacts(nextContacts)
      setPipelines(nextPipelines)
      setDeals(nextDeals)
      setPresets(nextPresets)
      setSegmentStats(nextStats)

      const firstPipeline = nextPipelines[0]
      if (firstPipeline && !selectedPipelineId) {
        setSelectedPipelineId(firstPipeline.id)
      }
      const firstPreset = nextPresets[0]
      if (firstPreset && !selectedPreset) {
        setSelectedPreset(firstPreset.name)
      }
    } catch (loadError: any) {
      setError(loadError?.message || "Nao foi possivel carregar CRM e pipeline.")
    } finally {
      setLoading(false)
    }
  }, [selectedPipelineId, selectedPreset])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (selectedPipeline?.stages?.length && !dealForm.stageId) {
      setDealForm((current) => ({ ...current, stageId: selectedPipeline.stages[0]?.id || "" }))
    }
  }, [dealForm.stageId, selectedPipeline])

  useEffect(() => {
    if (!dealForm.contactId && contacts[0]?.id) {
      setDealForm((current) => ({ ...current, contactId: contacts[0]?.id || "" }))
    }
  }, [contacts, dealForm.contactId])

  useEffect(() => {
    if (!selectedPreset) return

    let active = true
    setError(null)

    void segmentationApi
      .getPresetSegment(selectedPreset, 20)
      .then((response) => {
        if (!active) return
        setPresetContacts(
          (response.data?.contacts || []).map((contact) => ({
            id: contact.id,
            phone: contact.phone,
            name: contact.name || undefined,
          })),
        )
        setPresetTotal(response.data?.total || 0)
      })
      .catch((presetError: any) => {
        if (!active) return
        setError(presetError?.message || "Nao foi possivel carregar o segmento selecionado.")
      })

    return () => {
      active = false
    }
  }, [selectedPreset])

  const handleCreateContact = async () => {
    if (!contactForm.phone.trim()) {
      setError("Informe o telefone do contato.")
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await crmApi.createContact({
        name: contactForm.name.trim() || undefined,
        phone: contactForm.phone.trim(),
        email: contactForm.email.trim() || undefined,
        notes: contactForm.notes.trim() || undefined,
      })
      setContactForm({ name: "", phone: "", email: "", notes: "" })
      setSuccess("Contato criado no CRM.")
      await loadData()
    } catch (createError: any) {
      setError(createError?.message || "Nao foi possivel criar o contato.")
    } finally {
      setSaving(false)
    }
  }

  const handleCreatePipeline = async () => {
    if (!pipelineName.trim()) {
      setError("Informe o nome do pipeline.")
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await crmApi.createPipeline(pipelineName.trim())
      const createdPipeline = response.data
      setPipelineName("")
      if (createdPipeline?.id) {
        setSelectedPipelineId(createdPipeline.id)
      }
      setSuccess("Pipeline criado com sucesso.")
      await loadData()
    } catch (createError: any) {
      setError(createError?.message || "Nao foi possivel criar o pipeline.")
    } finally {
      setSaving(false)
    }
  }

  const handleCreateDeal = async () => {
    if (!dealForm.contactId || !dealForm.stageId || !dealForm.title.trim()) {
      setError("Preencha contato, etapa inicial e titulo do deal.")
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await crmApi.createDeal({
        contactId: dealForm.contactId,
        stageId: dealForm.stageId,
        title: dealForm.title.trim(),
        value: Number(dealForm.value || 0),
      })
      setDealForm((current) => ({ ...current, title: "", value: "" }))
      setSuccess("Deal criado no pipeline.")
      await loadData()
    } catch (createError: any) {
      setError(createError?.message || "Nao foi possivel criar o deal.")
    } finally {
      setSaving(false)
    }
  }

  const handleMoveDeal = async (deal: CrmDeal, direction: -1 | 1) => {
    if (!selectedPipeline) return
    const currentIndex = selectedPipeline.stages.findIndex((stage) => stage.id === deal.stageId)
    const nextStage = selectedPipeline.stages[currentIndex + direction]
    if (!nextStage) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await crmApi.moveDeal(deal.id, nextStage.id)
      setSuccess(`Deal movido para ${nextStage.name}.`)
      await loadData()
    } catch (moveError: any) {
      setError(moveError?.message || "Nao foi possivel mover o deal.")
    } finally {
      setSaving(false)
    }
  }

  const handleAutoSegment = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await segmentationApi.autoSegment()
      const processed = response.data?.processed ?? 0
      setSuccess(`Auto-segmentacao concluida para ${processed} contatos.`)
      await loadData()
    } catch (segmentError: any) {
      setError(segmentError?.message || "Nao foi possivel rodar a auto-segmentacao.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">CRM, segmentos e pipeline</h3>
          <p className="mt-1 text-sm text-gray-500">
            Contatos, segmentacao e deals operacionais sem sair da tela principal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-gray-200 bg-white"
            onClick={() => void handleAutoSegment()}
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Auto-segmentar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-gray-200 bg-white"
            onClick={() => void loadData()}
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Contatos" value={String(contacts.length)} hint="Primeira pagina do CRM" />
        <StatCard title="Pipelines" value={String(pipelines.length)} />
        <StatCard title="Deals" value={String(deals.length)} hint="Todos os deals ativos retornados" />
        <StatCard
          title="Media segmentada"
          value={String(Math.round(segmentStats?.total || 0))}
          hint="Media de contatos por preset"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <h4 className="font-semibold text-gray-900">Novo contato</h4>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={contactForm.name}
              onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nome do contato"
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400"
            />
            <input
              value={contactForm.phone}
              onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="Telefone com DDI"
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400"
            />
            <input
              value={contactForm.email}
              onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Email"
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400"
            />
            <input
              value={contactForm.notes}
              onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Observacao comercial"
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400"
            />
          </div>
          <Button
            type="button"
            className="mt-4 rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
            onClick={() => void handleCreateContact()}
            disabled={saving}
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar contato
          </Button>

          <div className="mt-6 space-y-2">
            {(contacts || []).slice(0, 8).map((contact) => (
              <div key={contact.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{contact.name || "Sem nome"}</p>
                    <p className="text-xs text-gray-500">{contact.phone}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {(contact.tags || []).map((tag) => (
                      <span key={tag.id} className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-gray-600">
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gray-500" />
            <h4 className="font-semibold text-gray-900">Segmentacao</h4>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(segmentStats?.segments || {}).slice(0, 8).map(([name, total]) => (
              <div key={name} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{name}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{String(total)}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <select
              value={selectedPreset}
              onChange={(event) => setSelectedPreset(event.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-400"
            >
              <option value="">Escolha um preset</option>
              {presets.map((preset) => (
                <option key={preset.name} value={preset.name}>
                  {preset.label || preset.name}
                </option>
              ))}
            </select>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2 text-sm text-gray-600">
              {presetTotal} contatos nesse recorte
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {presetContacts.length === 0 ? (
              <p className="text-sm text-gray-500">Selecione um preset para ver a audiencia.</p>
            ) : (
              presetContacts.map((contact) => (
                <div key={contact.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">{contact.name || "Contato sem nome"}</p>
                  <p className="text-xs text-gray-500">{contact.phone}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <KanbanSquare className="h-4 w-4 text-gray-500" />
              <h4 className="font-semibold text-gray-900">Pipeline e deals</h4>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Crie pipeline, abra deals e mova etapas sem sair do shell principal.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              value={pipelineName}
              onChange={(event) => setPipelineName(event.target.value)}
              placeholder="Novo pipeline"
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400"
            />
            <select
              value={selectedPipeline?.id || ""}
              onChange={(event) => {
                setSelectedPipelineId(event.target.value)
                setDealForm((current) => ({
                  ...current,
                  stageId:
                    pipelines.find((pipeline) => pipeline.id === event.target.value)?.stages?.[0]?.id || "",
                }))
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-400"
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
              className="rounded-xl border-gray-200 bg-white"
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
            onChange={(event) => setDealForm((current) => ({ ...current, contactId: event.target.value }))}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-400"
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
            onChange={(event) => setDealForm((current) => ({ ...current, stageId: event.target.value }))}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-400"
          >
            <option value="">Etapa inicial</option>
            {(selectedPipeline?.stages || []).map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <input
            value={dealForm.title}
            onChange={(event) => setDealForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Titulo do deal"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400"
          />
          <input
            value={dealForm.value}
            onChange={(event) => setDealForm((current) => ({ ...current, value: event.target.value }))}
            placeholder="Valor em BRL"
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-gray-400"
          />
        </div>

        <Button
          type="button"
          className="mt-4 rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
          onClick={() => void handleCreateDeal()}
          disabled={saving}
        >
          <Plus className="mr-2 h-4 w-4" />
          Criar deal
        </Button>

        {!selectedPipeline ? (
          <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
            Nenhum pipeline disponivel ainda.
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {selectedPipeline.stages.map((stage, index) => (
              <div key={stage.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color || "#d1d5db" }} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{stage.name}</p>
                      <p className="text-xs text-gray-500">
                        {(stageDealMap.get(stage.id) || []).length} deals
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {(stageDealMap.get(stage.id) || []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-sm text-gray-500">
                      Nenhum deal nesta etapa.
                    </div>
                  ) : (
                    (stageDealMap.get(stage.id) || []).map((deal) => (
                      <div key={deal.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                        <p className="text-sm font-semibold text-gray-900">{deal.title}</p>
                        <p className="mt-1 text-xs text-gray-500">{deal.contact?.name || deal.contact?.phone || "Sem contato"}</p>
                        <p className="mt-2 text-sm font-medium text-gray-800">{formatMoney(deal.value)}</p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl border-gray-200 bg-white px-3"
                            onClick={() => void handleMoveDeal(deal, -1)}
                            disabled={saving || index === 0}
                          >
                            <ArrowLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl border-gray-200 bg-white px-3"
                            onClick={() => void handleMoveDeal(deal, 1)}
                            disabled={saving || index === selectedPipeline.stages.length - 1}
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
