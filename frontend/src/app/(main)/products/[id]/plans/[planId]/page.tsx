"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { PlanStoreTab } from "@/components/plans/PlanStoreTab"
import { PlanPaymentTab } from "@/components/plans/PlanPaymentTab"
import { PlanShippingTab } from "@/components/plans/PlanShippingTab"
import {
  Store,
  CreditCard,
  Package,
  Truck,
  Users,
  FileText,
  ShoppingCart,
  ScrollText,
  Brain,
  ArrowLeft,
  Save,
  Loader2,
} from "lucide-react"
import { colors } from "@/lib/design-tokens"

// ============================================
// SUB-TABS
// ============================================

const SUB_TABS = [
  { id: "store", label: "Loja", icon: Store },
  { id: "payment", label: "Pagamento", icon: CreditCard },
  { id: "packaging", label: "Embalagem", icon: Package },
  { id: "shipping", label: "Frete", icon: Truck },
  { id: "affiliate", label: "Afiliação", icon: Users },
  { id: "files", label: "Arquivos", icon: FileText },
  { id: "orderbump", label: "Order Bump", icon: ShoppingCart },
  { id: "terms", label: "Termos", icon: ScrollText },
  { id: "ai", label: "IA", icon: Brain },
]

// ============================================
// AI CONFIG SECTION (FASE 6 — Marketing Artificial)
// ============================================

function AIConfigSection() {
  const [tone, setTone] = useState("CONSULTIVE")
  const [persistence, setPersistence] = useState(3)
  const [messageLimit, setMessageLimit] = useState(10)

  const tones = [
    { value: "CONSULTIVE", label: "Consultivo" },
    { value: "DIRECT", label: "Direto" },
    { value: "EMPATHETIC", label: "Empático" },
    { value: "EDUCATIVE", label: "Educativo" },
    { value: "URGENT", label: "Urgente" },
    { value: "AUTO", label: "Automático" },
  ]

  const objections = [
    { id: "expensive", label: "Está caro", enabled: true },
    { id: "think", label: "Preciso pensar", enabled: true },
    { id: "works", label: "Não sei se funciona", enabled: true },
    { id: "tried", label: "Já tentei outros", enabled: false },
    { id: "cheaper", label: "Achei mais barato", enabled: true },
    { id: "trust", label: "Não confio em compra online", enabled: true },
    { id: "deadline", label: "Prazo é muito longo", enabled: false },
    { id: "human", label: "Quero falar com alguém", enabled: true },
    { id: "notforme", label: "Não é para mim", enabled: false },
    { id: "later", label: "Compro depois", enabled: true },
  ]

  return (
    <div className="space-y-8">
      {/* Intro */}
      <div
        className="rounded-xl p-6"
        style={{ background: `linear-gradient(135deg, ${colors.brand.primary}08, ${colors.brand.accent}08)` }}
      >
        <div className="flex items-start gap-3">
          <Brain className="mt-0.5 h-6 w-6" style={{ color: colors.brand.primary }} />
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Configure a inteligência do Kloel para este plano
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Estas configurações ensinam o Kloel a vender este plano. Quanto mais detalhado, melhores as vendas.
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Behavior */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">
          Comportamento da IA
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">Tom da IA</label>
            <div className="space-y-1.5">
              {tones.map((t) => (
                <label key={t.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="tone"
                    value={t.value}
                    checked={tone === t.value}
                    onChange={() => setTone(t.value)}
                    className="accent-teal-600"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Nível de insistência
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={persistence}
              onChange={(e) => setPersistence(Number(e.target.value))}
              className="w-full accent-teal-600"
            />
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>Passivo</span>
              <span>Moderado</span>
              <span>Agressivo</span>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600">
              Limite de mensagens
            </label>
            <select
              value={messageLimit}
              onChange={(e) => setMessageLimit(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value={3}>3 mensagens</option>
              <option value={5}>5 mensagens</option>
              <option value={10}>10 mensagens</option>
              <option value={15}>15 mensagens</option>
              <option value={0}>Sem limite</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section 2: Objections */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">
          Objeções e Respostas
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {objections.map((obj) => (
            <div
              key={obj.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <input type="checkbox" defaultChecked={obj.enabled} className="accent-teal-600" />
                <span className="text-sm font-medium text-gray-800">{obj.label}</span>
              </div>
              <select className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600">
                <option>Resposta padrão</option>
                <option>Valor e benefício</option>
                <option>Prova social</option>
                <option>Garantia</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3: Summary */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: `${colors.brand.primary}30`, background: `${colors.brand.primary}05` }}
      >
        <div className="flex items-start gap-2">
          <Brain className="mt-0.5 h-5 w-5" style={{ color: colors.brand.primary }} />
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Resumo do que a IA sabe sobre este plano
            </h4>
            <p className="mt-2 text-sm text-gray-600">
              Tom: <strong>{tones.find((t) => t.value === tone)?.label}</strong> · Insistência:{" "}
              <strong>{persistence}/5</strong> · Limite: <strong>{messageLimit || "∞"} msgs</strong>
              {" "}· Objeções ativas:{" "}
              <strong>{objections.filter((o) => o.enabled).length}/{objections.length}</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// MAIN PAGE
// ============================================

export default function PlanDetailPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params?.id as string
  const planId = params?.planId as string
  const [activeTab, setActiveTab] = useState("store")
  const [saving, setSaving] = useState(false)

  return (
    <div className="min-h-screen px-6 py-8" style={{ backgroundColor: colors.background.base }}>
      <div className="mx-auto max-w-5xl">
        {/* Back */}
        <div className="mb-4">
          <button
            onClick={() => router.push(`/products/${productId}`)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao produto
          </button>
        </div>

        <h1 className="mb-6 text-xl font-bold text-gray-900">Configurações do plano</h1>

        {/* Sub-tabs */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {SUB_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-all"
                  style={{
                    backgroundColor: isActive ? "#fff" : "transparent",
                    color: isActive ? colors.brand.primary : "#6B7280",
                    boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          {activeTab === "store" ? (
            <PlanStoreTab planId={planId} productId={productId} />
          ) : activeTab === "payment" ? (
            <PlanPaymentTab planId={planId} />
          ) : activeTab === "shipping" ? (
            <PlanShippingTab planId={planId} />
          ) : activeTab === "ai" ? (
            <AIConfigSection />
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-gray-500">
                Aba "{SUB_TABS.find((t) => t.id === activeTab)?.label}" — em construção
              </p>
            </div>
          )}
        </div>

        {/* Save */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => router.push(`/products/${productId}`)}
            className="text-sm font-medium text-red-500 hover:text-red-700"
          >
            ← Sair da Edição
          </button>
          <button
            onClick={() => setSaving(true)}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: colors.brand.primary }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
