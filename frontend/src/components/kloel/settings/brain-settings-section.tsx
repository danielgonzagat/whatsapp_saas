"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Building2,
  Package,
  Users,
  MessageSquare,
  ShieldCheck,
  HelpCircle,
  FileText,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Upload,
  Sparkles,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ProductCheckoutPlans, type CheckoutPlan } from "./product-checkout-plans"
import { KloelStatusCard } from "./kloel-status-card"
import { MissingStepsCard } from "./missing-steps-card"
import { OpeningMessageCard } from "./opening-message-card"
import { EmergencyModeCard } from "./emergency-mode-card"
import {
  externalPaymentApi,
  getAutopilotConfig,
  getAutopilotStatus,
  knowledgeBaseApi,
  productApi,
  tokenStorage,
  toggleAutopilot,
  updateAutopilotConfig,
  workspaceApi,
  type ExternalPaymentLink,
  type KnowledgeBaseItem,
  type KnowledgeSourceItem,
} from "@/lib/api"

interface AccordionSectionProps {
  icon: React.ElementType
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function AccordionSection({ icon: Icon, title, children, defaultOpen = false }: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-2xl border border-[#1E1E34] bg-[#0A0A14] shadow-sm">
      <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between p-5">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-[#9896A8]" />
          <span className="font-semibold text-[#E8E6F0]">{title}</span>
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5 text-[#5C5A6E]" /> : <ChevronDown className="h-5 w-5 text-[#5C5A6E]" />}
      </button>
      {isOpen && <div className="border-t border-[#1E1E34] p-5">{children}</div>}
    </div>
  )
}

interface Product {
  id: string
  name: string
  type: string
  price: string
  description?: string
  files: number
  checkoutPlans: CheckoutPlan[]
}

interface CompanyProfile {
  name: string
  sector: string
  description: string
  mission: string
  differentials: string[]
}

interface VoiceToneProfile {
  style: string
  customInstructions: string
  useProfessional: boolean
  useFriendly: boolean
  usePersuasive: boolean
}

interface FaqItem {
  id: string
  question: string
  answer: string
}

interface OpeningMessageProfile {
  message: string
  useEmojis: boolean
  isFormal: boolean
  isFriendly: boolean
}

interface EmergencyModeProfile {
  emergencyAction: string
  fixedMessage: string
}

function formatCurrency(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return ""
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function parseCurrency(value: string) {
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapPaymentLinkToPlan(link: ExternalPaymentLink, isDefault: boolean): CheckoutPlan {
  return {
    id: link.id,
    name: link.productName,
    type: "single",
    price: formatCurrency(link.price),
    provider: link.platform,
    checkoutLink: link.checkoutUrl || link.paymentUrl,
    isDefault,
  }
}

function normalizeCompanyProfile(value: any): CompanyProfile {
  const differentials = Array.isArray(value?.differentials)
    ? value.differentials.filter((entry: unknown) => typeof entry === "string")
    : []

  return {
    name: typeof value?.name === "string" ? value.name : "",
    sector: typeof value?.sector === "string" ? value.sector : "",
    description: typeof value?.description === "string" ? value.description : "",
    mission: typeof value?.mission === "string" ? value.mission : "",
    differentials: differentials.length > 0 ? differentials : [""],
  }
}

function normalizeVoiceToneProfile(value: any): VoiceToneProfile {
  return {
    style: typeof value?.style === "string" ? value.style : "",
    customInstructions: typeof value?.customInstructions === "string" ? value.customInstructions : "",
    useProfessional: value?.useProfessional !== false,
    useFriendly: value?.useFriendly === true,
    usePersuasive: value?.usePersuasive === true,
  }
}

function normalizeFaqs(value: any): FaqItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((faq: any, index: number) => ({
      id: typeof faq?.id === "string" ? faq.id : `faq-${index + 1}`,
      question: typeof faq?.question === "string" ? faq.question : "",
      answer: typeof faq?.answer === "string" ? faq.answer : "",
    }))
    .filter((faq) => faq.question || faq.answer)
}

function normalizeOpeningMessage(value: any): OpeningMessageProfile {
  return {
    message: typeof value?.message === "string" ? value.message : "",
    useEmojis: value?.useEmojis !== false,
    isFormal: value?.isFormal === true,
    isFriendly: value?.isFriendly !== false,
  }
}

function normalizeEmergencyMode(value: any): EmergencyModeProfile {
  return {
    emergencyAction: typeof value?.emergencyAction === "string" ? value.emergencyAction : "",
    fixedMessage: typeof value?.fixedMessage === "string" ? value.fixedMessage : "",
  }
}

export function BrainSettingsSection() {
  const workspaceId = tokenStorage.getWorkspaceId()
  const [company, setCompany] = useState<CompanyProfile>({
    name: "",
    sector: "",
    description: "",
    mission: "",
    differentials: [""],
  })

  const [products, setProducts] = useState<Product[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState("")
  const [catalogSuccess, setCatalogSuccess] = useState("")
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState("")
  const [profileSuccess, setProfileSuccess] = useState("")

  const [showAddProduct, setShowAddProduct] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    price: "",
    benefits: "",
    persona: "",
  })

  const [personas, setPersonas] = useState<string[]>([])
  const [newPersona, setNewPersona] = useState("")

  const [voiceTone, setVoiceTone] = useState<VoiceToneProfile>({
    style: "",
    customInstructions: "",
    useProfessional: true,
    useFriendly: false,
    usePersuasive: false,
  })

  const [rules, setRules] = useState<string[]>([])
  const [newRule, setNewRule] = useState("")

  const [faqs, setFaqs] = useState<FaqItem[]>([])
  const [showAddFaq, setShowAddFaq] = useState(false)
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" })
  const [openingMessage, setOpeningMessage] = useState<OpeningMessageProfile>({
    message: "",
    useEmojis: true,
    isFormal: false,
    isFriendly: true,
  })
  const [emergencyMode, setEmergencyMode] = useState<EmergencyModeProfile>({
    emergencyAction: "",
    fixedMessage: "",
  })
  const [autopilotEnabled, setAutopilotEnabled] = useState(false)
  const [autopilotSaving, setAutopilotSaving] = useState(false)
  const [autopilotError, setAutopilotError] = useState("")
  const [autopilotSuccess, setAutopilotSuccess] = useState("")
  const [autopilotConfig, setAutopilotConfig] = useState({
    conversionFlowId: "",
    currencyDefault: "",
    recoveryTemplateName: "",
  })

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([])
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("")
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSourceItem[]>([])
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeError, setKnowledgeError] = useState("")
  const [knowledgeSuccess, setKnowledgeSuccess] = useState("")
  const [newKnowledgeBaseName, setNewKnowledgeBaseName] = useState("")
  const [knowledgeSourceType, setKnowledgeSourceType] = useState<"TEXT" | "URL" | "PDF">("TEXT")
  const [knowledgeSourceContent, setKnowledgeSourceContent] = useState("")

  const hydrateProfile = useCallback(async () => {
    if (!workspaceId) {
      setCompany(normalizeCompanyProfile(null))
      setPersonas([])
      setVoiceTone(normalizeVoiceToneProfile(null))
      setRules([])
      setFaqs([])
      return
    }

    setProfileLoading(true)
    setProfileError("")

    try {
      const response = await workspaceApi.getMe()
      const workspace = response.data as any
      const profile = workspace?.providerSettings?.kloelProfile || {}

      setCompany(normalizeCompanyProfile(profile.company))
      setPersonas(Array.isArray(profile.personas) ? profile.personas.filter((value: unknown) => typeof value === "string") : [])
      setVoiceTone(normalizeVoiceToneProfile(profile.voiceTone))
      setRules(Array.isArray(profile.rules) ? profile.rules.filter((value: unknown) => typeof value === "string") : [])
      setFaqs(normalizeFaqs(profile.faqs))
      setOpeningMessage(normalizeOpeningMessage(profile.openingMessage))
      setEmergencyMode(normalizeEmergencyMode(profile.emergencyMode))
    } catch (error: any) {
      setProfileError(error?.message || "Nao foi possivel carregar o perfil do Kloel.")
    } finally {
      setProfileLoading(false)
    }
  }, [workspaceId])

  const saveKloelProfile = useCallback(
    async (
      successMessage: string,
      overrides?: Partial<{
        company: CompanyProfile
        personas: string[]
        voiceTone: VoiceToneProfile
        rules: string[]
        faqs: FaqItem[]
        openingMessage: OpeningMessageProfile
        emergencyMode: EmergencyModeProfile
      }>,
    ) => {
      if (!workspaceId) return

      setProfileSaving(true)
      setProfileError("")
      setProfileSuccess("")

      try {
        const nextCompany = overrides?.company || company
        const nextPersonas = overrides?.personas || personas
        const nextVoiceTone = overrides?.voiceTone || voiceTone
        const nextRules = overrides?.rules || rules
        const nextFaqs = overrides?.faqs || faqs
        const nextOpeningMessage = overrides?.openingMessage || openingMessage
        const nextEmergencyMode = overrides?.emergencyMode || emergencyMode

        await workspaceApi.updateSettings({
          kloelProfile: {
            company: {
              ...nextCompany,
              differentials: nextCompany.differentials.filter((item) => item.trim().length > 0),
            },
            personas: nextPersonas.filter((item) => item.trim().length > 0),
            voiceTone: nextVoiceTone,
            rules: nextRules.filter((item) => item.trim().length > 0),
            faqs: nextFaqs.filter((faq) => faq.question.trim() || faq.answer.trim()),
            openingMessage: nextOpeningMessage,
            emergencyMode: nextEmergencyMode,
          },
        })
        setProfileSuccess(successMessage)
      } catch (error: any) {
        setProfileError(error?.message || "Nao foi possivel salvar o perfil do Kloel.")
      } finally {
        setProfileSaving(false)
      }
    },
    [company, emergencyMode, faqs, openingMessage, personas, rules, voiceTone, workspaceId],
  )

  const hydrateAutopilot = useCallback(async () => {
    if (!workspaceId) {
      setAutopilotEnabled(false)
      setAutopilotConfig({
        conversionFlowId: "",
        currencyDefault: "",
        recoveryTemplateName: "",
      })
      return
    }

    try {
      const [status, config] = await Promise.all([
        getAutopilotStatus(workspaceId),
        getAutopilotConfig(workspaceId),
      ])

      setAutopilotEnabled(Boolean(status?.enabled))
      setAutopilotConfig({
        conversionFlowId: String(config?.autopilot?.conversionFlowId || ""),
        currencyDefault: String(config?.autopilot?.currencyDefault || ""),
        recoveryTemplateName: String(config?.autopilot?.recoveryTemplateName || ""),
      })
    } catch (error: any) {
      setAutopilotError(error?.message || "Nao foi possivel carregar a autonomia.")
    }
  }, [workspaceId])

  const handleToggleAutopilot = useCallback(
    async (enabled: boolean) => {
      if (!workspaceId) return
      setAutopilotSaving(true)
      setAutopilotError("")
      setAutopilotSuccess("")
      try {
        await toggleAutopilot(workspaceId, enabled)
        setAutopilotEnabled(enabled)
        setAutopilotSuccess(enabled ? "Autonomia ativada." : "Autonomia pausada.")
      } catch (error: any) {
        setAutopilotError(error?.message || "Nao foi possivel alternar a autonomia.")
      } finally {
        setAutopilotSaving(false)
      }
    },
    [workspaceId],
  )

  const handleSaveAutopilotConfig = useCallback(async () => {
    if (!workspaceId) return
    setAutopilotSaving(true)
    setAutopilotError("")
    setAutopilotSuccess("")
    try {
      await updateAutopilotConfig(workspaceId, {
        conversionFlowId: autopilotConfig.conversionFlowId || null,
        currencyDefault: autopilotConfig.currencyDefault || undefined,
        recoveryTemplateName: autopilotConfig.recoveryTemplateName || null,
      })
      setAutopilotSuccess("Configuracao operacional do autopilot salva.")
    } catch (error: any) {
      setAutopilotError(error?.message || "Nao foi possivel salvar a configuracao do autopilot.")
    } finally {
      setAutopilotSaving(false)
    }
  }, [autopilotConfig, workspaceId])

  const hydrateKnowledgeBase = useCallback(async () => {
    if (!workspaceId) {
      setKnowledgeBases([])
      setKnowledgeSources([])
      setSelectedKnowledgeBaseId("")
      return
    }

    setKnowledgeLoading(true)
    setKnowledgeError("")

    try {
      const response = await knowledgeBaseApi.list()
      const items = (response.data as KnowledgeBaseItem[]) || []
      setKnowledgeBases(items)

      const nextSelectedId = selectedKnowledgeBaseId || items[0]?.id || ""
      setSelectedKnowledgeBaseId(nextSelectedId)

      if (nextSelectedId) {
        const sourcesResponse = await knowledgeBaseApi.listSources(nextSelectedId)
        setKnowledgeSources((sourcesResponse.data as KnowledgeSourceItem[]) || [])
      } else {
        setKnowledgeSources([])
      }
    } catch (error: any) {
      setKnowledgeError(error?.message || "Nao foi possivel carregar a base de conhecimento.")
    } finally {
      setKnowledgeLoading(false)
    }
  }, [selectedKnowledgeBaseId, workspaceId])

  const handleCreateKnowledgeBase = useCallback(async () => {
    if (!workspaceId || !newKnowledgeBaseName.trim()) return
    setKnowledgeLoading(true)
    setKnowledgeError("")
    setKnowledgeSuccess("")
    try {
      const response = await knowledgeBaseApi.create(newKnowledgeBaseName.trim())
      const created = response.data as KnowledgeBaseItem
      setKnowledgeSuccess(`Base ${created?.name || newKnowledgeBaseName} criada.`)
      setNewKnowledgeBaseName("")
      setSelectedKnowledgeBaseId(created?.id || "")
      await hydrateKnowledgeBase()
    } catch (error: any) {
      setKnowledgeError(error?.message || "Nao foi possivel criar a base.")
      setKnowledgeLoading(false)
    }
  }, [hydrateKnowledgeBase, newKnowledgeBaseName, workspaceId])

  const handleAddKnowledgeSource = useCallback(async () => {
    if (!workspaceId || !selectedKnowledgeBaseId || !knowledgeSourceContent.trim()) return
    setKnowledgeLoading(true)
    setKnowledgeError("")
    setKnowledgeSuccess("")
    try {
      await knowledgeBaseApi.addSource(selectedKnowledgeBaseId, {
        type: knowledgeSourceType,
        content: knowledgeSourceContent.trim(),
      })
      setKnowledgeSuccess("Fonte de conhecimento enviada para ingestao.")
      setKnowledgeSourceContent("")
      await hydrateKnowledgeBase()
    } catch (error: any) {
      setKnowledgeError(error?.message || "Nao foi possivel adicionar a fonte.")
      setKnowledgeLoading(false)
    }
  }, [hydrateKnowledgeBase, knowledgeSourceContent, knowledgeSourceType, selectedKnowledgeBaseId, workspaceId])

  const hydrateCatalog = useCallback(async () => {
    if (!workspaceId) {
      setProducts([])
      return
    }

    setCatalogLoading(true)
    setCatalogError("")

    try {
      const [productResponse, linkResponse] = await Promise.all([
        productApi.list(),
        externalPaymentApi.list(workspaceId),
      ])

      const linksByProduct = (linkResponse.links || []).reduce<Record<string, ExternalPaymentLink[]>>((acc, link) => {
        const key = String(link.productName || "").trim().toLowerCase()
        if (!key) return acc
        acc[key] = [...(acc[key] || []), link]
        return acc
      }, {})

      const nextProducts = (productResponse.data?.products || []).map((product) => {
        const productLinks = linksByProduct[String(product.name || "").trim().toLowerCase()] || []
        const checkoutPlans = productLinks.map((link, index) =>
          mapPaymentLinkToPlan(
            link,
            product.paymentLink
              ? (link.checkoutUrl || link.paymentUrl) === product.paymentLink
              : index === 0,
          ),
        )

        return {
          id: product.id,
          name: product.name,
          type: product.category || "Produto",
          price: formatCurrency(product.price),
          description: product.description || "",
          files: 0,
          checkoutPlans,
        } satisfies Product
      })

      setProducts(nextProducts)
    } catch (error: any) {
      setCatalogError(error?.message || "Nao foi possivel carregar produtos e links.")
    } finally {
      setCatalogLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void hydrateCatalog()
  }, [hydrateCatalog])

  useEffect(() => {
    void hydrateProfile()
  }, [hydrateProfile])

  useEffect(() => {
    void hydrateAutopilot()
  }, [hydrateAutopilot])

  useEffect(() => {
    void hydrateKnowledgeBase()
  }, [hydrateKnowledgeBase])

  const handleAddProduct = async () => {
    if (!workspaceId || !newProduct.name || !newProduct.price) {
      return
    }

    setCatalogLoading(true)
    setCatalogError("")
    setCatalogSuccess("")

    try {
      await productApi.create({
        name: newProduct.name,
        description: newProduct.description,
        price: parseCurrency(newProduct.price),
      })
      setNewProduct({ name: "", description: "", price: "", benefits: "", persona: "" })
      setShowAddProduct(false)
      setCatalogSuccess(`Produto ${newProduct.name} criado com sucesso.`)
      await hydrateCatalog()
    } catch (error: any) {
      setCatalogError(error?.message || "Nao foi possivel criar o produto.")
    } finally {
      setCatalogLoading(false)
    }
  }

  const handleAddPersona = () => {
    if (newPersona && !personas.includes(newPersona)) {
      setPersonas([...personas, newPersona])
      setNewPersona("")
    }
  }

  const handleAddRule = () => {
    if (newRule) {
      setRules([...rules, newRule])
      setNewRule("")
    }
  }

  const handleAddFaq = () => {
    if (newFaq.question && newFaq.answer) {
      setFaqs([...faqs, { id: Date.now().toString(), ...newFaq }])
      setNewFaq({ question: "", answer: "" })
      setShowAddFaq(false)
    }
  }

  const handleUpdateCheckoutPlans = async (productId: string, plans: CheckoutPlan[]) => {
    if (!workspaceId) return

    const product = products.find((item) => item.id === productId)
    if (!product) return

    setCatalogLoading(true)
    setCatalogError("")
    setCatalogSuccess("")

    try {
      const existingPlanIds = new Set(product.checkoutPlans.map((plan) => plan.id))
      const removedPlans = product.checkoutPlans.filter(
        (plan) => !plans.some((candidate) => candidate.id === plan.id),
      )
      const addedPlans = plans.filter((plan) => !existingPlanIds.has(plan.id))

      await Promise.all(
        removedPlans.map((plan) => externalPaymentApi.remove(workspaceId, plan.id)),
      )

      for (const plan of addedPlans) {
        await externalPaymentApi.add(workspaceId, {
          platform: (plan.provider as ExternalPaymentLink["platform"]) || "other",
          productName: product.name,
          price: parseCurrency(plan.price),
          paymentUrl: plan.checkoutLink,
          checkoutUrl: plan.checkoutLink,
        })
      }

      const defaultPlan = plans.find((plan) => plan.isDefault) || plans[0]
      if (defaultPlan) {
        await productApi.update(productId, {
          paymentLink: defaultPlan.checkoutLink,
          price: parseCurrency(defaultPlan.price),
        })
      }

      setCatalogSuccess(`Links de checkout atualizados para ${product.name}.`)
      await hydrateCatalog()
    } catch (error: any) {
      setCatalogError(error?.message || "Nao foi possivel atualizar os planos de checkout.")
    } finally {
      setCatalogLoading(false)
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    const product = products.find((item) => item.id === productId)
    if (!product) return

    setCatalogLoading(true)
    setCatalogError("")
    setCatalogSuccess("")

    try {
      await Promise.all(
        product.checkoutPlans.map((plan) =>
          workspaceId ? externalPaymentApi.remove(workspaceId, plan.id) : Promise.resolve(),
        ),
      )
      await productApi.remove(productId)
      setCatalogSuccess(`Produto ${product.name} removido.`)
      await hydrateCatalog()
    } catch (error: any) {
      setCatalogError(error?.message || "Nao foi possivel remover o produto.")
    } finally {
      setCatalogLoading(false)
    }
  }

  // Calculate status for KloelStatusCard
  const hasProducts = products.length > 0
  const hasFiles = knowledgeSources.length > 0
  const hasCheckout = products.some((p) => p.checkoutPlans.length > 0)
  const hasVoiceTone = voiceTone.style !== ""
  const hasFaq = faqs.length > 0
  const hasRules = rules.length > 0
  const checkoutLinksCount = useMemo(
    () => products.reduce((total, product) => total + product.checkoutPlans.length, 0),
    [products],
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Configurar Kloel</h3>
        <p className="mt-1 text-sm text-gray-500">Ensine o Kloel sobre seu negocio para um atendimento perfeito.</p>
      </div>

      {(profileError || profileSuccess) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            profileError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {profileError || profileSuccess}
        </div>
      )}

      {profileLoading ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Carregando perfil persistido do Kloel...
        </div>
      ) : null}

      <KloelStatusCard
        filesProcessed={knowledgeSources.length}
        productsConfigured={products.length}
        rulesLearned={rules.length}
        faqFilled={faqs.length}
        voiceToneDefined={hasVoiceTone}
        checkoutConfigured={hasCheckout}
      />

      <MissingStepsCard
        hasProducts={hasProducts}
        hasFiles={hasFiles}
        hasCheckout={hasCheckout}
        hasVoiceTone={hasVoiceTone}
        hasFaq={hasFaq}
        hasOpeningMessage={openingMessage.message.trim().length > 0}
        hasWhatsApp={false}
      />

      <OpeningMessageCard
        value={openingMessage}
        saving={profileSaving}
        onSave={(payload) => {
          setOpeningMessage(payload)
          return saveKloelProfile("Mensagem de abertura salva.", {
            openingMessage: payload,
          })
        }}
      />

      {/* Company Identity */}
      <AccordionSection icon={Building2} title="Identidade da empresa" defaultOpen>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Nome da empresa</Label>
            <Input
              placeholder="Ex: Minha Loja Digital"
              value={company.name}
              onChange={(e) => setCompany({ ...company, name: e.target.value })}
              className="rounded-xl border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Setor de atuacao</Label>
            <Select value={company.sector} onValueChange={(v: string) => setCompany({ ...company, sector: v })}>
              <SelectTrigger className="rounded-xl border-gray-200">
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ecommerce">E-commerce</SelectItem>
                <SelectItem value="infoproduct">Infoprodutos</SelectItem>
                <SelectItem value="services">Servicos</SelectItem>
                <SelectItem value="saas">SaaS</SelectItem>
                <SelectItem value="retail">Varejo</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Descricao do negocio</Label>
            <Textarea
              placeholder="Descreva brevemente o que sua empresa faz..."
              value={company.description}
              onChange={(e) => setCompany({ ...company, description: e.target.value })}
              className="min-h-[80px] rounded-xl border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Missao / Proposta de valor</Label>
            <Textarea
              placeholder="Qual o proposito da sua empresa?"
              value={company.mission}
              onChange={(e) => setCompany({ ...company, mission: e.target.value })}
              className="min-h-[60px] rounded-xl border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Diferenciais competitivos</Label>
            {company.differentials.map((diff, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder={`Diferencial ${i + 1}`}
                  value={diff}
                  onChange={(e) => {
                    const newDiffs = [...company.differentials]
                    newDiffs[i] = e.target.value
                    setCompany({ ...company, differentials: newDiffs })
                  }}
                  className="rounded-xl border-gray-200"
                />
                {i > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newDiffs = company.differentials.filter((_, idx) => idx !== i)
                      setCompany({ ...company, differentials: newDiffs })
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-gray-400" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              onClick={() => setCompany({ ...company, differentials: [...company.differentials, ""] })}
              className="text-sm text-gray-600"
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar diferencial
            </Button>
          </div>
          <Button
            onClick={() => void saveKloelProfile("Identidade da empresa salva.")}
            disabled={!workspaceId || profileSaving}
            className="w-full rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
          >
            Salvar identidade
          </Button>
        </div>
      </AccordionSection>

      {/* Products */}
      <AccordionSection icon={Package} title="Produtos e ofertas">
        <div className="space-y-4">
          {!workspaceId ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Entre com uma conta conectada para carregar o catalogo real e os links de checkout.
            </div>
          ) : null}

          {catalogError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {catalogError}
            </div>
          ) : null}

          {catalogSuccess ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {catalogSuccess}
            </div>
          ) : null}

          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            {catalogLoading
              ? "Sincronizando produtos e links de checkout..."
              : `${products.length} produto(s) e ${checkoutLinksCount} link(s) de checkout sincronizados com o backend.`}
          </div>

          {products.length > 0 ? (
            <div className="space-y-3">
              {products.map((product) => (
                <div key={product.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">
                        {product.type} - {product.price}
                      </p>
                      {product.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">{product.description}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingProductId(editingProductId === product.id ? null : product.id)}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-200"
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void handleDeleteProduct(product.id)}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {editingProductId === product.id && (
                    <ProductCheckoutPlans
                      plans={product.checkoutPlans}
                      onPlansChange={(plans) => void handleUpdateCheckoutPlans(product.id, plans)}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Nenhum produto cadastrado ainda.</p>
          )}

          {showAddProduct ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="space-y-3">
                <Input
                  placeholder="Nome do produto"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="rounded-xl border-gray-200"
                />
                <Input
                  placeholder="Preco (ex: R$ 97)"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                  className="rounded-xl border-gray-200"
                />
                <Textarea
                  placeholder="Descricao e beneficios"
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  className="min-h-[60px] rounded-xl border-gray-200"
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAddProduct(false)} className="flex-1 rounded-xl">
                    Cancelar
                  </Button>
                  <Button onClick={() => void handleAddProduct()} className="flex-1 rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]">
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAddProduct(true)}
              className="w-full rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
              disabled={!workspaceId}
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar produto
            </Button>
          )}
        </div>
      </AccordionSection>

      {/* Customers */}
      <AccordionSection icon={Users} title="Clientes e publico-alvo">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Personas de cliente</Label>
            <div className="flex flex-wrap gap-2">
              {personas.map((persona, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                >
                  {persona}
                  <button onClick={() => setPersonas(personas.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3 text-gray-500 hover:text-gray-700" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova persona..."
                value={newPersona}
                onChange={(e) => setNewPersona(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPersona()}
                className="rounded-xl border-gray-200"
              />
              <Button onClick={handleAddPersona} variant="outline" className="rounded-xl bg-transparent">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button
            onClick={() => void saveKloelProfile("Personas salvas.")}
            disabled={!workspaceId || profileSaving}
            className="w-full rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
          >
            Salvar personas
          </Button>
        </div>
      </AccordionSection>

      {/* Voice Tone */}
      <AccordionSection icon={MessageSquare} title="Tom de voz">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Estilo de comunicacao</Label>
            <Select value={voiceTone.style} onValueChange={(v: string) => setVoiceTone({ ...voiceTone, style: v })}>
              <SelectTrigger className="rounded-xl border-gray-200">
                <SelectValue placeholder="Selecione um estilo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Profissional e formal</SelectItem>
                <SelectItem value="friendly">Amigavel e descontraido</SelectItem>
                <SelectItem value="persuasive">Persuasivo e vendedor</SelectItem>
                <SelectItem value="technical">Tecnico e detalhado</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
              <span className="text-sm text-gray-700">Ser profissional</span>
              <Switch
                checked={voiceTone.useProfessional}
                onCheckedChange={(v: boolean) => setVoiceTone({ ...voiceTone, useProfessional: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
              <span className="text-sm text-gray-700">Ser amigavel</span>
              <Switch
                checked={voiceTone.useFriendly}
                onCheckedChange={(v: boolean) => setVoiceTone({ ...voiceTone, useFriendly: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
              <span className="text-sm text-gray-700">Ser persuasivo</span>
              <Switch
                checked={voiceTone.usePersuasive}
                onCheckedChange={(v: boolean) => setVoiceTone({ ...voiceTone, usePersuasive: v })}
              />
            </div>
          </div>

          {voiceTone.style === "custom" && (
            <div className="space-y-2">
              <Label className="text-sm text-gray-700">Instrucoes personalizadas</Label>
              <Textarea
                placeholder="Descreva como o Kloel deve se comunicar..."
                value={voiceTone.customInstructions}
                onChange={(e) => setVoiceTone({ ...voiceTone, customInstructions: e.target.value })}
                className="min-h-[80px] rounded-xl border-gray-200"
              />
            </div>
          )}

          <Button
            onClick={() => void saveKloelProfile("Tom de voz salvo.")}
            disabled={!workspaceId || profileSaving}
            className="w-full rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
          >
            Salvar tom de voz
          </Button>
        </div>
      </AccordionSection>

      {/* Rules */}
      <AccordionSection icon={ShieldCheck} title="Regras de atendimento">
        <div className="space-y-4">
          {rules.length > 0 && (
            <div className="space-y-2">
              {rules.map((rule, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-700">{rule}</span>
                  <button onClick={() => setRules(rules.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Nova regra..."
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
              className="rounded-xl border-gray-200"
            />
            <Button onClick={handleAddRule} variant="outline" className="rounded-xl bg-transparent">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button
            onClick={() => void saveKloelProfile("Regras de atendimento salvas.")}
            disabled={!workspaceId || profileSaving}
            className="w-full rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
          >
            Salvar regras
          </Button>
        </div>
      </AccordionSection>

      {/* FAQ */}
      <AccordionSection icon={HelpCircle} title="FAQ - Perguntas frequentes">
        <div className="space-y-4">
          {faqs.length > 0 && (
            <div className="space-y-2">
              {faqs.map((faq) => (
                <div key={faq.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <p className="font-medium text-gray-900">{faq.question}</p>
                    <button onClick={() => setFaqs(faqs.filter((f) => f.id !== faq.id))}>
                      <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600">{faq.answer}</p>
                </div>
              ))}
            </div>
          )}

          {showAddFaq ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="space-y-3">
                <Input
                  placeholder="Pergunta"
                  value={newFaq.question}
                  onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                  className="rounded-xl border-gray-200"
                />
                <Textarea
                  placeholder="Resposta"
                  value={newFaq.answer}
                  onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                  className="min-h-[60px] rounded-xl border-gray-200"
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAddFaq(false)} className="flex-1 rounded-xl">
                    Cancelar
                  </Button>
                  <Button onClick={handleAddFaq} className="flex-1 rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]">
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAddFaq(true)}
              className="w-full rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar pergunta
            </Button>
          )}
          <Button
            onClick={() => void saveKloelProfile("FAQ salvo no perfil do Kloel.")}
            disabled={!workspaceId || profileSaving}
            className="w-full rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
          >
            Salvar FAQ
          </Button>
        </div>
      </AccordionSection>

      {/* Knowledge Base */}
      <AccordionSection icon={FileText} title="Base de conhecimento">
        <div className="space-y-4">
          {(knowledgeError || knowledgeSuccess) && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                knowledgeError
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {knowledgeError || knowledgeSuccess}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-[1fr,auto]">
            <Input
              value={newKnowledgeBaseName}
              onChange={(e) => setNewKnowledgeBaseName(e.target.value)}
              placeholder="Nova base de conhecimento"
              className="rounded-xl border-gray-200"
            />
            <Button
              onClick={() => void handleCreateKnowledgeBase()}
              disabled={!workspaceId || knowledgeLoading || !newKnowledgeBaseName.trim()}
              className="rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
            >
              <Plus className="mr-2 h-4 w-4" /> Criar base
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-[220px,1fr]">
            <div className="space-y-2">
              <Label className="text-sm text-gray-700">Base selecionada</Label>
              <Select value={selectedKnowledgeBaseId || undefined} onValueChange={setSelectedKnowledgeBaseId}>
                <SelectTrigger className="rounded-xl border-gray-200">
                  <SelectValue placeholder="Selecione a base" />
                </SelectTrigger>
                <SelectContent>
                  {knowledgeBases.map((base) => (
                    <SelectItem key={base.id} value={base.id}>
                      {base.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {knowledgeBases.length} base(s) carregada(s) do backend.
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="grid gap-3 md:grid-cols-[180px,1fr]">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Tipo da fonte</Label>
                  <Select
                    value={knowledgeSourceType}
                    onValueChange={(value: "TEXT" | "URL" | "PDF") => setKnowledgeSourceType(value)}
                  >
                    <SelectTrigger className="rounded-xl border-gray-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEXT">Texto</SelectItem>
                      <SelectItem value="URL">URL</SelectItem>
                      <SelectItem value="PDF">PDF (conteudo bruto)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">
                    {knowledgeSourceType === "URL" ? "URL" : "Conteudo"}
                  </Label>
                  <Textarea
                    value={knowledgeSourceContent}
                    onChange={(e) => setKnowledgeSourceContent(e.target.value)}
                    placeholder={
                      knowledgeSourceType === "URL"
                        ? "https://seusite.com/artigo"
                        : "Cole aqui o texto que o Kloel deve aprender."
                    }
                    className="min-h-[96px] rounded-xl border-gray-200 bg-white"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  Upload de arquivo dedicado ainda falta; texto e URL ja entram no backend real.
                </p>
                <Button
                  onClick={() => void handleAddKnowledgeSource()}
                  disabled={!workspaceId || !selectedKnowledgeBaseId || knowledgeLoading || !knowledgeSourceContent.trim()}
                  className="rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
                >
                  <Upload className="mr-2 h-4 w-4" /> Ingerir fonte
                </Button>
              </div>
            </div>
          </div>

          {knowledgeLoading ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Sincronizando base de conhecimento...
            </div>
          ) : null}

          {knowledgeSources.length > 0 ? (
            <div className="space-y-2">
              {knowledgeSources.map((source) => (
                  <div key={source.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{source.type}</p>
                        <p className="text-xs text-gray-500">
                          {source.status || "PENDING"} · {source.createdAt ? new Date(source.createdAt).toLocaleString("pt-BR") : "Sem data"}
                        </p>
                        {source.content ? (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-500">{source.content}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Nenhuma fonte carregada na base de conhecimento selecionada.</p>
          )}
        </div>
      </AccordionSection>

      <EmergencyModeCard
        value={emergencyMode}
        saving={profileSaving}
        onSave={(payload) => {
          setEmergencyMode(payload)
          return saveKloelProfile("Configuracao de emergencia salva.", {
            emergencyMode: payload,
          })
        }}
      />

      <AccordionSection icon={Sparkles} title="Autonomia comercial">
        <div className="space-y-4">
          {(autopilotError || autopilotSuccess) && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                autopilotError
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {autopilotError || autopilotSuccess}
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
            <div>
              <p className="text-sm font-medium text-gray-800">Autopilot ativo</p>
              <p className="text-xs text-gray-500">Controla se o agente comercial age sozinho no workspace.</p>
            </div>
            <Switch checked={autopilotEnabled} onCheckedChange={(value: boolean) => void handleToggleAutopilot(value)} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Flow de conversao</Label>
              <Input
                value={autopilotConfig.conversionFlowId}
                onChange={(e) =>
                  setAutopilotConfig((current) => ({ ...current, conversionFlowId: e.target.value }))
                }
                placeholder="flow_id_de_conversao"
                className="rounded-xl border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Moeda padrao</Label>
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
              <Label className="text-xs text-gray-500">Template de recuperacao</Label>
              <Input
                value={autopilotConfig.recoveryTemplateName}
                onChange={(e) =>
                  setAutopilotConfig((current) => ({ ...current, recoveryTemplateName: e.target.value }))
                }
                placeholder="nome_do_template"
                className="rounded-xl border-gray-200"
              />
            </div>
          </div>

          <Button
            onClick={() => void handleSaveAutopilotConfig()}
            disabled={!workspaceId || autopilotSaving}
            className="w-full rounded-xl bg-[#4E7AE0] text-white hover:bg-[#6B93F0]"
          >
            Salvar configuracao operacional
          </Button>
        </div>
      </AccordionSection>
    </div>
  )
}
