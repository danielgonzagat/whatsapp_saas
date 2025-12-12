"use client"

import { useState } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { RealtimeUsageCard } from "./realtime-usage-card"

interface BillingSettingsSectionProps {
  subscriptionStatus: "none" | "trial" | "active" | "expired" | "suspended"
  trialDaysLeft: number
  creditsBalance: number
  hasCard: boolean
  onActivateTrial: () => void
  scrollToCreditCard?: boolean
}

export function BillingSettingsSection({
  subscriptionStatus,
  trialDaysLeft,
  creditsBalance,
  hasCard,
  onActivateTrial,
  scrollToCreditCard = false,
}: BillingSettingsSectionProps) {
  const [showAddCard, setShowAddCard] = useState(scrollToCreditCard && !hasCard)
  const [showPixAdvanced, setShowPixAdvanced] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [showAddCreditsModal, setShowAddCreditsModal] = useState(false)
  const [showConfirmTrialModal, setShowConfirmTrialModal] = useState(false)
  const [cards, setCards] = useState(
    hasCard ? [{ id: "1", last4: "4242", brand: "Visa", expiry: "12/26", isDefault: true }] : [],
  )
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

  const handleSaveCard = () => {
    if (newCard.number && newCard.name && newCard.expiry && newCard.cvv) {
      const last4 = newCard.number.replace(/\s/g, "").slice(-4)
      setCards([
        ...cards,
        {
          id: Date.now().toString(),
          last4,
          brand: "Visa",
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
      setShowAddCard(true)
    } else {
      setShowConfirmTrialModal(true)
    }
  }

  const handleConfirmTrial = () => {
    setShowConfirmTrialModal(false)
    onActivateTrial()
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

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
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
            <div className="mb-4 rounded-xl bg-gray-50 p-4">
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
              className="w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Ativar teste gratis
            </Button>
          </>
        )}

        {subscriptionStatus === "trial" && (
          <>
            <div className="mb-4 rounded-xl bg-blue-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">Termina em:</span>
                <span className="text-lg font-bold text-blue-900">{trialDaysLeft} dias</span>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-gray-200 p-4">
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
                  className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-500 transition-all"
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
            <div className="mb-4 rounded-xl bg-gray-50 p-4">
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Proxima cobranca</span>
                  <span className="font-medium text-gray-900">15 de Janeiro, 2025</span>
                </div>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-gray-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Creditos de mensagens em uso</span>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl font-bold text-gray-900">US$ {creditsBalance.toFixed(2)}</span>
                <span className="text-sm text-gray-500">~{estimatedMessages} mensagens</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green-400 to-green-500 transition-all"
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
                className="flex-1 rounded-xl border-gray-200 bg-transparent"
              >
                Gerenciar assinatura
              </Button>
              <Button
                onClick={() => setShowAddCreditsModal(true)}
                className="flex-1 rounded-xl bg-gray-900 text-white hover:bg-gray-800"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar creditos
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h4 className="mb-4 font-semibold text-gray-900">Cartao de credito</h4>

        {scrollToCreditCard && cards.length === 0 && (
          <div className="mb-4 rounded-xl bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              Cadastre seu cartao para liberar o teste gratis. Nenhuma cobranca sera feita agora.
            </p>
          </div>
        )}

        {cards.length > 0 ? (
          <div className="mb-4 space-y-2">
            {cards.map((card) => (
              <div key={card.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
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
                  <button className="text-xs text-gray-500 hover:text-gray-700">Definir como padrao</button>
                  <button className="text-xs text-red-500 hover:text-red-700">
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
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="mb-4 h-40 w-full max-w-[280px] rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 p-5 shadow-lg">
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
                  className="rounded-xl border-gray-200 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-500">Numero do cartao</Label>
                <Input
                  placeholder="0000 0000 0000 0000"
                  value={newCard.number}
                  onChange={(e) => setNewCard({ ...newCard, number: formatCardNumber(e.target.value) })}
                  maxLength={19}
                  className="rounded-xl border-gray-200 bg-white"
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
                    className="rounded-xl border-gray-200 bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-gray-500">CVV</Label>
                  <Input
                    placeholder="123"
                    value={newCard.cvv}
                    onChange={(e) => setNewCard({ ...newCard, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    maxLength={4}
                    className="rounded-xl border-gray-200 bg-white"
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
                  className="flex-1 rounded-xl border-gray-200"
                >
                  Cancelar
                </Button>
                <Button onClick={handleSaveCard} className="flex-1 rounded-xl bg-gray-900 text-white hover:bg-gray-800">
                  Salvar cartao
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setShowAddCard(true)}
            className="w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
          >
            <Plus className="mr-2 h-4 w-4" />
            Adicionar cartao
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h4 className="mb-4 font-semibold text-gray-900">Planos futuros</h4>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-4 opacity-60">
            <div className="absolute right-2 top-2">
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">Em breve</span>
            </div>
            <h5 className="mb-1 font-semibold text-gray-700">Plano Pro</h5>
            <p className="mb-2 text-xs text-gray-500">Para equipes e negocios em crescimento</p>
            <p className="text-lg font-bold text-gray-600">R$ 297/mes</p>
            <Button disabled className="mt-3 w-full rounded-xl bg-gray-300 text-gray-500" variant="secondary">
              Em breve
            </Button>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-4 opacity-60">
            <div className="absolute right-2 top-2">
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">Em breve</span>
            </div>
            <h5 className="mb-1 font-semibold text-gray-700">Plano Enterprise</h5>
            <p className="mb-2 text-xs text-gray-500">Solucoes personalizadas para grandes empresas</p>
            <p className="text-lg font-bold text-gray-600">Sob consulta</p>
            <Button disabled className="mt-3 w-full rounded-xl bg-gray-300 text-gray-500" variant="secondary">
              Fale com a gente
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
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
                className="flex-1 rounded-xl border-gray-200"
              />
              <Button className="rounded-xl bg-gray-900 text-white hover:bg-gray-800">Salvar</Button>
            </div>
          </div>

          <button
            onClick={() => setShowPixAdvanced(!showPixAdvanced)}
            className="flex w-full items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700"
          >
            <span>Configuracoes avancadas do PIX</span>
            {showPixAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showPixAdvanced && (
            <div className="space-y-4 rounded-xl bg-gray-50 p-4">
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

      {/* Confirm Trial Modal */}
      {showConfirmTrialModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Confirmar ativacao</h3>
            <p className="mb-4 text-sm text-gray-600">
              Voce esta prestes a ativar o teste gratis do Plano Basic. Seu cartao nao sera cobrado durante os 7
              primeiros dias.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowConfirmTrialModal(false)}
                className="flex-1 rounded-xl border-gray-200"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmTrial}
                className="flex-1 rounded-xl bg-gray-900 text-white hover:bg-gray-800"
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
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
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
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
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
                className="flex-1 rounded-xl border-gray-200"
              >
                Cancelar
              </Button>
              <Button className="flex-1 rounded-xl bg-gray-900 text-white hover:bg-gray-800">Adicionar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Subscription Modal */}
      {showManageModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Gerenciar assinatura</h3>
            <div className="mb-4 space-y-2">
              <button className="flex w-full items-center justify-between rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50">
                <span className="text-sm text-gray-700">Alterar forma de pagamento</span>
              </button>
              <button className="flex w-full items-center justify-between rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50">
                <span className="text-sm text-gray-700">Historico de pagamentos</span>
              </button>
              <button className="flex w-full items-center justify-between rounded-xl border border-red-100 p-4 text-left transition-colors hover:border-red-200 hover:bg-red-50">
                <span className="text-sm text-red-600">Cancelar assinatura</span>
              </button>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowManageModal(false)}
              className="w-full rounded-xl border-gray-200"
            >
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
