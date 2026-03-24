"use client"

import { useCallback, useEffect, useState } from "react"
import {
  CreditCard,
  Plus,
  Trash2,
  QrCode,
  ChevronDown,
  ChevronUp,
  Lock,
  Check,
  AlertTriangle,
  Sparkles,
  Link2,
  Wallet,
  Activity,
  Power,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RealtimeUsageCard } from "./realtime-usage-card"
import {
  billingApi,
  externalPaymentApi,
  tokenStorage,
  type AsaasBalance,
  type AsaasPaymentRecord,
  type AsaasStatus,
  type ExternalPaymentLink,
  type ExternalPaymentPlatformConfig,
  type SalesReportSummary,
} from "@/lib/api"

interface BillingSettingsSectionProps {
  subscriptionStatus: "none" | "trial" | "active" | "expired" | "suspended"
  trialDaysLeft: number
  creditsBalance: number
  hasCard: boolean
  onActivateTrial: () => void
  scrollToCreditCard?: boolean
}

function formatMoney(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "R$ 0,00"
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatLocalDate(value?: string | null) {
  if (!value) return "Sem data"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("pt-BR")
}

function parseMoney(value: string) {
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function BillingSettingsSection({
  subscriptionStatus,
  trialDaysLeft,
  creditsBalance,
  hasCard,
  onActivateTrial,
  scrollToCreditCard = false,
}: BillingSettingsSectionProps) {
  const workspaceId = tokenStorage.getWorkspaceId()
  const [showAddCard, setShowAddCard] = useState(scrollToCreditCard && !hasCard)
  const [showPixAdvanced, setShowPixAdvanced] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [showAddCreditsModal, setShowAddCreditsModal] = useState(false)
  const [showConfirmTrialModal, setShowConfirmTrialModal] = useState(false)
  const [cards, setCards] = useState<Array<{ id: string; last4?: string; brand?: string; expiry?: string; isDefault?: boolean }>>([])
  const [newCard, setNewCard] = useState({
    name: "",
    number: "",
    expiry: "",
    cvv: "",
    isDefault: false,
  })
  const [pixKey, setPixKey] = useState("")
  const [pixSettings, setPixSettings] = useState({
    emailCopy: true,
    enablePaymentLink: false,
  })
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState("")
  const [billingSuccess, setBillingSuccess] = useState("")
  const [asaasStatus, setAsaasStatus] = useState<AsaasStatus | null>(null)
  const [asaasBalance, setAsaasBalance] = useState<AsaasBalance | null>(null)
  const [salesReport, setSalesReport] = useState<SalesReportSummary | null>(null)
  const [salesPeriod, setSalesPeriod] = useState("week")
  const [asaasPayments, setAsaasPayments] = useState<AsaasPaymentRecord[]>([])
  const [externalLinks, setExternalLinks] = useState<ExternalPaymentLink[]>([])
  const [platformConfigs, setPlatformConfigs] = useState<ExternalPaymentPlatformConfig[]>([])
  const [generatedTrackingUrl, setGeneratedTrackingUrl] = useState("")
  const [asaasForm, setAsaasForm] = useState({
    apiKey: "",
    environment: "sandbox" as "sandbox" | "production",
  })
  const [externalLinkForm, setExternalLinkForm] = useState({
    platform: "hotmart" as ExternalPaymentLink["platform"],
    productName: "",
    price: "",
    paymentUrl: "",
    checkoutUrl: "",
    affiliateUrl: "",
  })
  const [platformForm, setPlatformForm] = useState<ExternalPaymentPlatformConfig>({
    platform: "hotmart",
    apiKey: "",
    webhookSecret: "",
    enabled: true,
  })
  const [chargeForm, setChargeForm] = useState({
    method: "pix" as "pix" | "boleto",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerCpfCnpj: "",
    amount: "",
    description: "",
  })

  const loadPaymentMethods = useCallback(async () => {
    try {
      const res = await billingApi.getPaymentMethods()
      const paymentMethods = (res.data as any)?.paymentMethods || []

      const nextCards = paymentMethods.map((pm: any) => {
        const expMonth = pm.expMonth ? String(pm.expMonth).padStart(2, "0") : ""
        const expYear = pm.expYear ? String(pm.expYear).slice(-2) : ""
        const expiry = expMonth && expYear ? `${expMonth}/${expYear}` : ""

        return {
          id: pm.id,
          last4: pm.last4,
          brand: pm.brand ? String(pm.brand).toUpperCase() : "",
          expiry,
          isDefault: !!pm.isDefault,
        }
      })

      setCards(nextCards)
    } catch {
      // Se não estiver autenticado ou Stripe não configurado, apenas mantém vazio.
      setCards([])
    }
  }, [])

  const loadBillingOperations = useCallback(async () => {
    if (!workspaceId) {
      setAsaasStatus(null)
      setAsaasBalance(null)
      setSalesReport(null)
      setAsaasPayments([])
      setExternalLinks([])
      setPlatformConfigs([])
      return
    }

    setBillingLoading(true)
    setBillingError("")

    const [statusResult, linksResult, platformsResult, reportResult] = await Promise.allSettled([
      billingApi.getAsaasStatus(),
      externalPaymentApi.list(workspaceId),
      externalPaymentApi.getPlatforms(workspaceId),
      billingApi.getSalesReport(salesPeriod),
    ])

    if (statusResult.status === "fulfilled") {
      setAsaasStatus((statusResult.value.data as AsaasStatus) || null)
    } else {
      setAsaasStatus(null)
    }

    if (linksResult.status === "fulfilled") {
      setExternalLinks(linksResult.value.links || [])
    } else {
      setExternalLinks([])
    }

    if (platformsResult.status === "fulfilled") {
      setPlatformConfigs((platformsResult.value.data as any)?.platforms || [])
    } else {
      setPlatformConfigs([])
    }

    if (reportResult.status === "fulfilled") {
      setSalesReport((reportResult.value.data as SalesReportSummary) || null)
    } else {
      setSalesReport(null)
    }

    const connected = statusResult.status === "fulfilled" && !!(statusResult.value.data as AsaasStatus)?.connected

    if (connected) {
      const [balanceResult, paymentsResult] = await Promise.allSettled([
        billingApi.getAsaasBalance(),
        billingApi.listAsaasPayments(),
      ])

      if (balanceResult.status === "fulfilled") {
        setAsaasBalance((balanceResult.value.data as AsaasBalance) || null)
      } else {
        setAsaasBalance(null)
      }

      if (paymentsResult.status === "fulfilled") {
        setAsaasPayments((paymentsResult.value.data as any)?.payments || [])
      } else {
        setAsaasPayments([])
      }
    } else {
      setAsaasBalance(null)
      setAsaasPayments([])
    }

    setBillingLoading(false)
  }, [salesPeriod, workspaceId])

  useEffect(() => {
    loadPaymentMethods()
  }, [loadPaymentMethods])

  useEffect(() => {
    void loadBillingOperations()
  }, [loadBillingOperations])

  useEffect(() => {
    setShowAddCard(scrollToCreditCard && !hasCard)
  }, [scrollToCreditCard, hasCard])

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "")
    const matches = v.match(/\d{4,16}/g)
    const match = (matches && matches[0]) || ""
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    return parts.length ? parts.join(" ") : value
  }

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "")
    if (v.length >= 2) {
      return v.substring(0, 2) + "/" + v.substring(2, 4)
    }
    return v
  }

  const startAddCardFlow = useCallback(async () => {
    try {
      const returnUrl = typeof window !== "undefined" ? window.location.href : undefined
      const res = await billingApi.createSetupIntent(returnUrl)
      const url = (res.data as any)?.url
      if (url) {
        window.location.href = url
        return
      }
    } catch {
      // ignore
    }

    // Fallback (mantém UI existente se Stripe/endpoint não estiver disponível)
    setShowAddCard(true)
  }, [])

  const handleSaveCard = () => {
    // Mantido como fallback visual/UX (caso Stripe não esteja disponível)
    if (newCard.number && newCard.name && newCard.expiry && newCard.cvv) {
      const last4 = newCard.number.replace(/\s/g, "").slice(-4)
      setCards([
        ...cards,
        {
          id: Date.now().toString(),
          last4,
          brand: "VISA",
          expiry: newCard.expiry,
          isDefault: cards.length === 0 || newCard.isDefault,
        },
      ])
      setNewCard({ name: "", number: "", expiry: "", cvv: "", isDefault: false })
      setShowAddCard(false)
    }
  }

  const handleActivateTrialClick = () => {
    if (cards.length === 0) {
      startAddCardFlow()
    } else {
      setShowConfirmTrialModal(true)
    }
  }

  const handleConfirmTrial = () => {
    setShowConfirmTrialModal(false)
    onActivateTrial()
  }

  const handleSetDefault = async (paymentMethodId: string) => {
    try {
      await billingApi.setDefaultPaymentMethod(paymentMethodId)
      await loadPaymentMethods()
    } catch {
      // ignore
    }
  }

  const handleRemove = async (paymentMethodId: string) => {
    try {
      await billingApi.removePaymentMethod(paymentMethodId)
      await loadPaymentMethods()
    } catch {
      // ignore
    }
  }

  const handleConnectAsaas = async () => {
    if (!workspaceId || !asaasForm.apiKey.trim()) return

    setBillingLoading(true)
    setBillingError("")
    setBillingSuccess("")
    try {
      await billingApi.connectAsaas(asaasForm.apiKey.trim(), asaasForm.environment)
      setBillingSuccess("Conta Asaas conectada com sucesso.")
      setAsaasForm((current) => ({ ...current, apiKey: "" }))
      await loadBillingOperations()
    } catch (error: any) {
      setBillingError(error?.message || "Nao foi possivel conectar o Asaas.")
      setBillingLoading(false)
    }
  }

  const handleDisconnectAsaas = async () => {
    if (!workspaceId) return

    setBillingLoading(true)
    setBillingError("")
    setBillingSuccess("")
    try {
      await billingApi.disconnectAsaas()
      setBillingSuccess("Conta Asaas desconectada.")
      await loadBillingOperations()
    } catch (error: any) {
      setBillingError(error?.message || "Nao foi possivel desconectar o Asaas.")
      setBillingLoading(false)
    }
  }

  const handleCreateCharge = async () => {
    if (!workspaceId || !chargeForm.customerName || !chargeForm.customerPhone || !chargeForm.amount) return

    setBillingLoading(true)
    setBillingError("")
    setBillingSuccess("")
    try {
      const amount = parseMoney(chargeForm.amount)
      if (chargeForm.method === "pix") {
        const response = await billingApi.createAsaasPix({
          customerName: chargeForm.customerName,
          customerPhone: chargeForm.customerPhone,
          customerEmail: chargeForm.customerEmail || undefined,
          amount,
          description: chargeForm.description || "Cobranca PIX Kloel",
        })
        const payment = (response.data as any)?.payment
        setBillingSuccess(
          payment?.pixCopyPaste
            ? `PIX gerado com sucesso. Copia e cola: ${payment.pixCopyPaste}`
            : "PIX gerado com sucesso.",
        )
      } else {
        const response = await billingApi.createAsaasBoleto({
          customerName: chargeForm.customerName,
          customerPhone: chargeForm.customerPhone,
          customerEmail: chargeForm.customerEmail || undefined,
          customerCpfCnpj: chargeForm.customerCpfCnpj,
          amount,
          description: chargeForm.description || "Cobranca boleto Kloel",
        })
        const payment = (response.data as any)?.payment
        setBillingSuccess(
          payment?.invoiceUrl
            ? `Boleto gerado com sucesso. URL: ${payment.invoiceUrl}`
            : "Boleto gerado com sucesso.",
        )
      }

      setChargeForm({
        method: "pix",
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        customerCpfCnpj: "",
        amount: "",
        description: "",
      })
      await loadBillingOperations()
    } catch (error: any) {
      setBillingError(error?.message || "Nao foi possivel gerar a cobranca.")
      setBillingLoading(false)
    }
  }

  const handleAddExternalLink = async () => {
    if (!workspaceId || !externalLinkForm.productName || !externalLinkForm.paymentUrl) return

    setBillingLoading(true)
    setBillingError("")
    setBillingSuccess("")
    try {
      await externalPaymentApi.add(workspaceId, {
        platform: externalLinkForm.platform,
        productName: externalLinkForm.productName,
        price: parseMoney(externalLinkForm.price),
        paymentUrl: externalLinkForm.paymentUrl,
        checkoutUrl: externalLinkForm.checkoutUrl || undefined,
        affiliateUrl: externalLinkForm.affiliateUrl || undefined,
      })
      setBillingSuccess(`Link externo ${externalLinkForm.productName} salvo.`)
      setExternalLinkForm({
        platform: "hotmart",
        productName: "",
        price: "",
        paymentUrl: "",
        checkoutUrl: "",
        affiliateUrl: "",
      })
      await loadBillingOperations()
    } catch (error: any) {
      setBillingError(error?.message || "Nao foi possivel salvar o link externo.")
      setBillingLoading(false)
    }
  }

  const handleToggleLink = async (linkId: string) => {
    if (!workspaceId) return
    setBillingLoading(true)
    setBillingError("")
    setBillingSuccess("")
    try {
      await externalPaymentApi.toggle(workspaceId, linkId)
      setBillingSuccess("Status do link atualizado.")
      await loadBillingOperations()
    } catch (error: any) {
      setBillingError(error?.message || "Nao foi possivel atualizar o link.")
      setBillingLoading(false)
    }
  }

  const handleDeleteLink = async (linkId: string) => {
    if (!workspaceId) return
    setBillingLoading(true)
    setBillingError("")
    setBillingSuccess("")
    try {
      await externalPaymentApi.remove(workspaceId, linkId)
      setBillingSuccess("Link removido.")
      await loadBillingOperations()
    } catch (error: any) {
      setBillingError(error?.message || "Nao foi possivel remover o link.")
      setBillingLoading(false)
    }
  }

  const handleConfigurePlatform = async () => {
    if (!workspaceId || !platformForm.platform) return
    setBillingLoading(true)
    setBillingError("")
    setBillingSuccess("")
    try {
      await externalPaymentApi.configurePlatform(workspaceId, platformForm)
      setBillingSuccess(`Configuracao de ${platformForm.platform} salva.`)
      setPlatformForm({
        platform: "hotmart",
        apiKey: "",
        webhookSecret: "",
        enabled: true,
      })
      await loadBillingOperations()
    } catch (error: any) {
      setBillingError(error?.message || "Nao foi possivel salvar a plataforma.")
      setBillingLoading(false)
    }
  }

  const handleGenerateTracking = async (link: ExternalPaymentLink) => {
    if (!workspaceId) return
    setBillingLoading(true)
    setBillingError("")
    setBillingSuccess("")
    try {
      const response = await externalPaymentApi.generateTracking(workspaceId, {
        baseUrl: link.checkoutUrl || link.paymentUrl,
        source: "kloel",
        medium: "whatsapp",
        campaign: link.productName,
      })
      setGeneratedTrackingUrl(response.data?.trackingUrl || "")
      setBillingSuccess("Tracking gerado com sucesso.")
      setBillingLoading(false)
    } catch (error: any) {
      setBillingError(error?.message || "Nao foi possivel gerar tracking.")
      setBillingLoading(false)
    }
  }

  // Calculate credits progress
  const maxCredits = 5.0
  const creditsPercent = (creditsBalance / maxCredits) * 100
  const estimatedMessages = Math.floor(creditsBalance * 100)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Metodos de pagamento</h3>
        <p className="mt-1 text-sm text-gray-500">Gerencie como voce paga pelo Kloel e acompanhe seu plano.</p>
      </div>

      {(subscriptionStatus === "trial" || subscriptionStatus === "active") && (
        <RealtimeUsageCard
          messagesToday={42}
          estimatedDailyCost={0.42}
          monthlyConsumption={12.5}
          creditsBalance={creditsBalance}
          maxCredits={maxCredits}
          onAddCredits={() => setShowAddCreditsModal(true)}
        />
      )}

      <div className="rounded-md border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-gray-900">Plano Basic</h4>
              {subscriptionStatus === "trial" && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Teste gratis ativo
                </span>
              )}
              {subscriptionStatus === "active" && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Ativo</span>
              )}
              {subscriptionStatus === "expired" && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Expirado</span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">Plano atual recomendado para comecar.</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">R$ 97</p>
            <p className="text-xs text-gray-500">/mes</p>
            <span className="mt-1 inline-block rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              7 dias gratis
            </span>
          </div>
        </div>

        {subscriptionStatus === "none" && (
          <>
            <div className="mb-4 rounded-md bg-gray-50 p-4">
              <p className="mb-3 text-sm text-gray-600">Voce ainda nao ativou o Plano Basic.</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Lock className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-500">Conectar WhatsApp</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-gray-700">Atendimento autonomo 24/7 pelo Kloel</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-gray-700">US$ 5 em creditos de mensagens para testar</span>
                </div>
              </div>
            </div>
            <Button
              onClick={handleActivateTrialClick}
              className="w-full rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Ativar teste gratis
            </Button>
          </>
        )}

        {subscriptionStatus === "trial" && (
          <>
            <div className="mb-4 rounded-md bg-blue-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#E0DDD8]">Termina em:</span>
                <span className="text-lg font-bold text-[#E0DDD8]">{trialDaysLeft} dias</span>
              </div>
            </div>

            <div className="mb-4 rounded-md border border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Creditos de mensagens</span>
                <span className="text-xs text-gray-500">Bonus de ativacao</span>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl font-bold text-gray-900">US$ {creditsBalance.toFixed(2)}</span>
                <span className="text-sm text-gray-500">~{estimatedMessages} mensagens</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#E0DDD8] to-[#E0DDD8] transition-all"
                  style={{ width: `${creditsPercent}%` }}
                />
              </div>
              {creditsBalance < 1 && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-yellow-50 p-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-xs text-yellow-700">Saldo quase no fim</span>
                </div>
              )}
            </div>

            <p className="mb-4 text-xs text-gray-500">
              Apos o consumo dos creditos e o fim do periodo de teste, sua assinatura Basic sera cobrada automaticamente
              em R$ 97,00/mes, com cobranca proporcional por mensagens adicionais.
            </p>
          </>
        )}

        {subscriptionStatus === "active" && (
          <>
            <div className="mb-4 rounded-md bg-gray-50 p-4">
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Proxima cobranca</span>
                  <span className="font-medium text-gray-900">15 de Janeiro, 2025</span>
                </div>
              </div>
            </div>

            <div className="mb-4 rounded-md border border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Creditos de mensagens em uso</span>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl font-bold text-gray-900">US$ {creditsBalance.toFixed(2)}</span>
                <span className="text-sm text-gray-500">~{estimatedMessages} mensagens</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#E0DDD8] to-[#E0DDD8] transition-all"
                  style={{ width: `${creditsPercent}%` }}
                />
              </div>
              {creditsBalance < 1 && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-yellow-50 p-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <span className="text-xs text-yellow-700">
                    Quando seus creditos acabarem, o Kloel continuara atendendo, mas as novas mensagens poderao ser
                    pausadas ate voce adicionar mais creditos.
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowManageModal(true)}
                className="flex-1 rounded-md border-gray-200 bg-transparent"
              >
                Gerenciar assinatura
              </Button>
              <Button
                onClick={() => setShowAddCreditsModal(true)}
                className="flex-1 rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar creditos
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-md border border-gray-100 bg-white p-5 shadow-sm">
        <h4 className="mb-4 font-semibold text-gray-900">Cartao de credito</h4>

        {scrollToCreditCard && cards.length === 0 && (
          <div className="mb-4 rounded-md bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              Cadastre seu cartao para liberar o teste gratis. Nenhuma cobranca sera feita agora.
            </p>
          </div>
        )}

        {cards.length > 0 ? (
          <div className="mb-4 space-y-2">
            {cards.map((card) => (
              <div key={card.id} className="flex items-center justify-between rounded-md bg-gray-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-gray-700 to-gray-900">
                    <CreditCard className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {card.brand} **** {card.last4}
                    </p>
                    <p className="text-xs text-gray-500">Expira em {card.expiry}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {card.isDefault && (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                      Padrao
                    </span>
                  )}
                  <button
                    className="text-xs text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!!card.isDefault}
                    onClick={() => handleSetDefault(card.id)}
                  >
                    Definir como padrao
                  </button>
                  <button
                    className="text-xs text-red-500 hover:text-red-700"
                    onClick={() => handleRemove(card.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-4 text-sm text-gray-500">Nenhum cartao cadastrado.</p>
        )}

        <p className="mb-4 text-xs text-gray-500">
          Usamos seu cartao apenas para garantir a continuidade do servico apos o teste. Durante os 7 primeiros dias,
          nada sera cobrado.
        </p>

        {showAddCard ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <div className="mb-4 h-40 w-full max-w-[280px] rounded-md bg-gradient-to-br from-gray-800 to-gray-900 p-5 shadow-lg">
              <div className="flex h-full flex-col justify-between">
                <div className="flex justify-between">
                  <div className="h-8 w-10 rounded bg-gradient-to-br from-yellow-300 to-yellow-500" />
                  <CreditCard className="h-6 w-6 text-white/50" />
                </div>
                <div>
                  <p className="mb-1 font-mono text-lg tracking-wider text-white">
                    {newCard.number || "**** **** **** ****"}
                  </p>
                  <div className="flex justify-between">
                    <p className="text-xs uppercase text-white/70">{newCard.name || "SEU NOME"}</p>
                    <p className="text-xs text-white/70">{newCard.expiry || "MM/AA"}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Nome impresso no cartao</Label>
                <Input
                  placeholder="JOAO DA SILVA"
                  value={newCard.name}
                  onChange={(e) => setNewCard({ ...newCard, name: e.target.value.toUpperCase() })}
                  className="rounded-md border-gray-200 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Numero do cartao</Label>
                <Input
                  placeholder="0000 0000 0000 0000"
                  value={newCard.number}
                  onChange={(e) => setNewCard({ ...newCard, number: formatCardNumber(e.target.value) })}
                  maxLength={19}
                  className="rounded-md border-gray-200 bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Validade</Label>
                  <Input
                    placeholder="MM/AA"
                    value={newCard.expiry}
                    onChange={(e) => setNewCard({ ...newCard, expiry: formatExpiry(e.target.value) })}
                    maxLength={5}
                    className="rounded-md border-gray-200 bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">CVV</Label>
                  <Input
                    placeholder="123"
                    value={newCard.cvv}
                    onChange={(e) => setNewCard({ ...newCard, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    maxLength={4}
                    className="rounded-md border-gray-200 bg-white"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="defaultCard"
                  checked={newCard.isDefault}
                  onChange={(e) => setNewCard({ ...newCard, isDefault: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="defaultCard" className="text-sm text-gray-700">
                  Definir como forma de pagamento principal
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAddCard(false)}
                  className="flex-1 rounded-md border-gray-200"
                >
                  Cancelar
                </Button>
                <Button onClick={handleSaveCard} className="flex-1 rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]">
                  Salvar cartao
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            onClick={startAddCardFlow}
            className="w-full rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar cartao
          </Button>
        )}
      </div>

      <div className="rounded-md border border-gray-100 bg-white p-5 shadow-sm">
        <h4 className="mb-4 font-semibold text-gray-900">Planos futuros</h4>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-md border border-gray-200 bg-gray-50 p-4 opacity-60">
            <div className="absolute right-2 top-2">
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">Em breve</span>
            </div>
            <h5 className="mb-1 font-semibold text-gray-700">Plano Pro</h5>
            <p className="mb-2 text-xs text-gray-500">Para equipes e negocios em crescimento</p>
            <p className="text-lg font-bold text-gray-600">R$ 297/mes</p>
            <Button disabled className="mt-3 w-full rounded-md bg-gray-300 text-gray-500" variant="secondary">
              Em breve
            </Button>
          </div>

          <div className="relative overflow-hidden rounded-md border border-gray-200 bg-gray-50 p-4 opacity-60">
            <div className="absolute right-2 top-2">
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">Em breve</span>
            </div>
            <h5 className="mb-1 font-semibold text-gray-700">Plano Enterprise</h5>
            <p className="mb-2 text-xs text-gray-500">Solucoes personalizadas para grandes empresas</p>
            <p className="text-lg font-bold text-gray-600">Sob consulta</p>
            <Button disabled className="mt-3 w-full rounded-md bg-gray-300 text-gray-500" variant="secondary">
              Fale com a gente
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <QrCode className="h-5 w-5 text-gray-700" />
          <h4 className="font-semibold text-gray-900">Pagamento via PIX</h4>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Chave PIX cadastrada</Label>
            <div className="flex gap-2">
              <Input
                placeholder="E-mail, CPF, CNPJ ou chave aleatoria"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className="flex-1 rounded-md border-gray-200"
              />
              <Button className="rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]">Salvar</Button>
            </div>
          </div>

          <button
            onClick={() => setShowPixAdvanced(!showPixAdvanced)}
            className="flex w-full items-center justify-between rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-700"
          >
            <span>Configuracoes avancadas do PIX</span>
            {showPixAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showPixAdvanced && (
            <div className="space-y-4 rounded-md bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Enviar copia por e-mail</p>
                  <p className="text-xs text-gray-500">Receba confirmacao de pagamento por e-mail</p>
                </div>
                <Switch
                  checked={pixSettings.emailCopy}
                  onCheckedChange={(v: boolean) => setPixSettings({ ...pixSettings, emailCopy: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Habilitar link de pagamento</p>
                  <p className="text-xs text-gray-500">Gere links de pagamento PIX para compartilhar</p>
                </div>
                <Switch
                  checked={pixSettings.enablePaymentLink}
                  onCheckedChange={(v: boolean) => setPixSettings({ ...pixSettings, enablePaymentLink: v })}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {(billingError || billingSuccess) && (
        <div
          className={`rounded-md border p-4 text-sm ${
            billingError
              ? "border-red-100 bg-red-50 text-red-700"
              : "border-green-100 bg-green-50 text-green-700"
          }`}
        >
          {billingError || billingSuccess}
        </div>
      )}

      <div className="rounded-md border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-gray-700" />
            <div>
              <h4 className="font-semibold text-gray-900">Asaas e cobrancas</h4>
              <p className="text-xs text-gray-500">Conecte sua conta, acompanhe saldo e gere PIX ou boleto.</p>
            </div>
          </div>
          {asaasStatus?.connected ? (
            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Conectado</span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">Desconectado</span>
          )}
        </div>

        {!asaasStatus?.connected ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr,180px]">
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">API key do Asaas</Label>
                <Input
                  value={asaasForm.apiKey}
                  onChange={(e) => setAsaasForm((current) => ({ ...current, apiKey: e.target.value }))}
                  placeholder="$aact_prod_... ou $aact_sandbox_..."
                  className="rounded-md border-gray-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Ambiente</Label>
                <Select
                  value={asaasForm.environment}
                  onValueChange={(value: "sandbox" | "production") =>
                    setAsaasForm((current) => ({ ...current, environment: value }))
                  }
                >
                  <SelectTrigger className="rounded-md border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                    <SelectItem value="production">Producao</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={handleConnectAsaas}
              disabled={billingLoading || !asaasForm.apiKey.trim()}
              className="rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
            >
              <Power className="mr-2 h-4 w-4" />
              Conectar Asaas
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-md border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Disponivel</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">{asaasBalance?.formattedBalance || "R$ 0,00"}</p>
              </div>
              <div className="rounded-md border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Pendente</p>
                <p className="mt-1 text-xl font-semibold text-gray-900">{asaasBalance?.formattedPending || "R$ 0,00"}</p>
              </div>
              <div className="rounded-md border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Conta</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{asaasStatus.accountName || "Asaas conectado"}</p>
                <p className="mt-1 text-xs text-gray-500">{asaasStatus.environment || "sandbox"}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr,auto]">
              <div className="rounded-md border border-gray-100 bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">Resumo de vendas</span>
                  <Select value={salesPeriod} onValueChange={setSalesPeriod}>
                    <SelectTrigger className="h-8 w-[130px] rounded-lg border-gray-200 bg-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">7 dias</SelectItem>
                      <SelectItem value="month">30 dias</SelectItem>
                      <SelectItem value="quarter">90 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-gray-500">Vendas pagas</p>
                    <p className="text-lg font-semibold text-gray-900">{salesReport?.totalSales || 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Receita</p>
                    <p className="text-lg font-semibold text-gray-900">{formatMoney(salesReport?.totalAmount)}</p>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleDisconnectAsaas}
                disabled={billingLoading}
                className="rounded-md border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                Desconectar Asaas
              </Button>
            </div>

            <div className="rounded-md border border-gray-100 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-gray-600" />
                <h5 className="font-medium text-gray-900">Cobranca rapida</h5>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Metodo</Label>
                  <Select
                    value={chargeForm.method}
                    onValueChange={(value: "pix" | "boleto") => setChargeForm((current) => ({ ...current, method: value }))}
                  >
                    <SelectTrigger className="rounded-md border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Valor</Label>
                  <Input
                    value={chargeForm.amount}
                    onChange={(e) => setChargeForm((current) => ({ ...current, amount: e.target.value }))}
                    placeholder="R$ 0,00"
                    className="rounded-md border-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Cliente</Label>
                  <Input
                    value={chargeForm.customerName}
                    onChange={(e) => setChargeForm((current) => ({ ...current, customerName: e.target.value }))}
                    placeholder="Nome do cliente"
                    className="rounded-md border-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Telefone</Label>
                  <Input
                    value={chargeForm.customerPhone}
                    onChange={(e) => setChargeForm((current) => ({ ...current, customerPhone: e.target.value }))}
                    placeholder="5511999999999"
                    className="rounded-md border-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">E-mail</Label>
                  <Input
                    value={chargeForm.customerEmail}
                    onChange={(e) => setChargeForm((current) => ({ ...current, customerEmail: e.target.value }))}
                    placeholder="cliente@exemplo.com"
                    className="rounded-md border-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">Descricao</Label>
                  <Input
                    value={chargeForm.description}
                    onChange={(e) => setChargeForm((current) => ({ ...current, description: e.target.value }))}
                    placeholder="Descricao da cobranca"
                    className="rounded-md border-gray-200"
                  />
                </div>
                {chargeForm.method === "boleto" && (
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-xs text-gray-500">CPF/CNPJ</Label>
                    <Input
                      value={chargeForm.customerCpfCnpj}
                      onChange={(e) => setChargeForm((current) => ({ ...current, customerCpfCnpj: e.target.value }))}
                      placeholder="000.000.000-00"
                      className="rounded-md border-gray-200"
                    />
                  </div>
                )}
              </div>
              <Button
                onClick={handleCreateCharge}
                disabled={billingLoading || !chargeForm.customerName || !chargeForm.customerPhone || !chargeForm.amount}
                className="mt-4 rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
              >
                Gerar {chargeForm.method === "pix" ? "PIX" : "boleto"}
              </Button>
            </div>

            <div className="rounded-md border border-gray-100 p-4">
              <h5 className="mb-3 font-medium text-gray-900">Ultimos pagamentos</h5>
              <div className="space-y-2">
                {asaasPayments.length === 0 && (
                  <p className="text-sm text-gray-500">Nenhum pagamento retornado pelo Asaas ainda.</p>
                )}
                {asaasPayments.slice(0, 6).map((payment) => (
                  <div key={payment.id} className="flex items-start justify-between rounded-md bg-gray-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{payment.description || payment.id}</p>
                      <p className="text-xs text-gray-500">{formatLocalDate(payment.createdAt || payment.dueDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{formatMoney(payment.value)}</p>
                      <p className="text-xs uppercase tracking-wide text-gray-500">{payment.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Link2 className="h-5 w-5 text-gray-700" />
          <div>
            <h4 className="font-semibold text-gray-900">Links externos e tracking</h4>
            <p className="text-xs text-gray-500">Hotmart, Kiwify, Braip, Monetizze e outros checkouts.</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Plataforma</Label>
            <Select
              value={externalLinkForm.platform}
              onValueChange={(value: ExternalPaymentLink["platform"]) =>
                setExternalLinkForm((current) => ({ ...current, platform: value }))
              }
            >
              <SelectTrigger className="rounded-md border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hotmart">Hotmart</SelectItem>
                <SelectItem value="kiwify">Kiwify</SelectItem>
                <SelectItem value="braip">Braip</SelectItem>
                <SelectItem value="monetizze">Monetizze</SelectItem>
                <SelectItem value="eduzz">Eduzz</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Produto</Label>
            <Input
              value={externalLinkForm.productName}
              onChange={(e) => setExternalLinkForm((current) => ({ ...current, productName: e.target.value }))}
              placeholder="Nome do produto"
              className="rounded-md border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Preco</Label>
            <Input
              value={externalLinkForm.price}
              onChange={(e) => setExternalLinkForm((current) => ({ ...current, price: e.target.value }))}
              placeholder="R$ 0,00"
              className="rounded-md border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Payment URL</Label>
            <Input
              value={externalLinkForm.paymentUrl}
              onChange={(e) => setExternalLinkForm((current) => ({ ...current, paymentUrl: e.target.value }))}
              placeholder="https://..."
              className="rounded-md border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Checkout URL</Label>
            <Input
              value={externalLinkForm.checkoutUrl}
              onChange={(e) => setExternalLinkForm((current) => ({ ...current, checkoutUrl: e.target.value }))}
              placeholder="https://..."
              className="rounded-md border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Affiliate URL</Label>
            <Input
              value={externalLinkForm.affiliateUrl}
              onChange={(e) => setExternalLinkForm((current) => ({ ...current, affiliateUrl: e.target.value }))}
              placeholder="https://..."
              className="rounded-md border-gray-200"
            />
          </div>
        </div>

        <Button
          onClick={handleAddExternalLink}
          disabled={billingLoading || !externalLinkForm.productName || !externalLinkForm.paymentUrl}
          className="mt-4 rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
        >
          Salvar link externo
        </Button>

        <div className="mt-4 space-y-2">
          {externalLinks.length === 0 && <p className="text-sm text-gray-500">Nenhum link externo cadastrado ainda.</p>}
          {externalLinks.map((link) => (
            <div key={link.id} className="rounded-md border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{link.productName}</p>
                  <p className="truncate text-xs text-gray-500">{link.checkoutUrl || link.paymentUrl}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">{link.platform}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={link.isActive} onCheckedChange={() => handleToggleLink(link.id)} />
                  <Button variant="outline" onClick={() => handleGenerateTracking(link)} className="rounded-md border-gray-200">
                    Tracking
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDeleteLink(link.id)}
                    className="rounded-md border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>{formatMoney(link.price)}</span>
                <span>{link.isActive ? "Ativo" : "Inativo"}</span>
              </div>
            </div>
          ))}
          {generatedTrackingUrl && (
            <div className="rounded-md bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium text-gray-700">Tracking gerado</p>
              <p className="break-all text-xs text-gray-600">{generatedTrackingUrl}</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-md border border-gray-100 bg-white p-5 shadow-sm">
        <h4 className="mb-4 font-semibold text-gray-900">Credenciais das plataformas</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Plataforma</Label>
            <Select
              value={platformForm.platform}
              onValueChange={(value) => setPlatformForm((current) => ({ ...current, platform: value }))}
            >
              <SelectTrigger className="rounded-md border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hotmart">Hotmart</SelectItem>
                <SelectItem value="kiwify">Kiwify</SelectItem>
                <SelectItem value="braip">Braip</SelectItem>
                <SelectItem value="monetizze">Monetizze</SelectItem>
                <SelectItem value="eduzz">Eduzz</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <div className="flex w-full items-center justify-between rounded-md border border-gray-100 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Habilitado</p>
                <p className="text-xs text-gray-500">Controla se o webhook pode operar.</p>
              </div>
              <Switch
                checked={platformForm.enabled}
                onCheckedChange={(enabled: boolean) => setPlatformForm((current) => ({ ...current, enabled }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">API key</Label>
            <Input
              value={platformForm.apiKey || ""}
              onChange={(e) => setPlatformForm((current) => ({ ...current, apiKey: e.target.value }))}
              placeholder="Token/API key"
              className="rounded-md border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Webhook secret</Label>
            <Input
              value={platformForm.webhookSecret || ""}
              onChange={(e) => setPlatformForm((current) => ({ ...current, webhookSecret: e.target.value }))}
              placeholder="Segredo do webhook"
              className="rounded-md border-gray-200"
            />
          </div>
        </div>

        <Button
          onClick={handleConfigurePlatform}
          disabled={billingLoading || !platformForm.platform}
          className="mt-4 rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
        >
          Salvar configuracao
        </Button>

        <div className="mt-4 space-y-2">
          {platformConfigs.length === 0 && <p className="text-sm text-gray-500">Nenhuma credencial configurada ainda.</p>}
          {platformConfigs.map((platform) => (
            <div key={platform.platform} className="flex items-center justify-between rounded-md bg-gray-50 p-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{platform.platform}</p>
                <p className="text-xs text-gray-500">
                  {platform.apiKey ? "API key configurada" : "Sem API key"} ·{" "}
                  {platform.webhookSecret ? "Webhook secret configurado" : "Sem webhook secret"}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${
                  platform.enabled ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
                }`}
              >
                {platform.enabled ? "Ativo" : "Inativo"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm Trial Modal */}
      {showConfirmTrialModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-md bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Confirmar ativacao</h3>
            <p className="mb-4 text-sm text-gray-600">
              Voce esta prestes a ativar o teste gratis do Plano Basic. Seu cartao nao sera cobrado durante os 7
              primeiros dias.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowConfirmTrialModal(false)}
                className="flex-1 rounded-md border-gray-200"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmTrial}
                className="flex-1 rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]"
              >
                Ativar agora
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Credits Modal */}
      {showAddCreditsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-md bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Adicionar creditos</h3>
            <div className="mb-4 space-y-2">
              {[
                { amount: 5, messages: 500 },
                { amount: 10, messages: 1000 },
                { amount: 25, messages: 2500 },
                { amount: 50, messages: 5000 },
              ].map((option) => (
                <button
                  key={option.amount}
                  className="flex w-full items-center justify-between rounded-md border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">US$ {option.amount}</span>
                  <span className="text-sm text-gray-500">~{option.messages} mensagens</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAddCreditsModal(false)}
                className="flex-1 rounded-md border-gray-200"
              >
                Cancelar
              </Button>
              <Button className="flex-1 rounded-md bg-[#E0DDD8] text-[#0A0A0C] hover:bg-[#E0DDD8]">Adicionar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Subscription Modal */}
      {showManageModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-md bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Gerenciar assinatura</h3>
            <div className="mb-4 space-y-2">
              <button
                className="flex w-full items-center justify-between rounded-md border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50"
                onClick={() => {
                  setShowManageModal(false)
                  startAddCardFlow()
                }}
              >
                <span className="text-sm text-gray-700">Alterar forma de pagamento</span>
              </button>
              <button className="flex w-full items-center justify-between rounded-md border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50">
                <span className="text-sm text-gray-700">Historico de pagamentos</span>
              </button>
              <button className="flex w-full items-center justify-between rounded-md border border-red-100 p-4 text-left transition-colors hover:border-red-200 hover:bg-red-50">
                <span className="text-sm text-red-600">Cancelar assinatura</span>
              </button>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowManageModal(false)}
              className="w-full rounded-md border-gray-200"
            >
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
