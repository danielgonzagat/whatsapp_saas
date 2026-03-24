"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { PlanStoreTab } from "@/components/plans/PlanStoreTab"
import { PlanPaymentTab } from "@/components/plans/PlanPaymentTab"
import { PlanShippingTab } from "@/components/plans/PlanShippingTab"
import { PlanAIConfigTab } from "@/components/plans/PlanAIConfigTab"
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
            <PlanPaymentTab planId={planId} productId={productId} />
          ) : activeTab === "shipping" ? (
            <PlanShippingTab planId={planId} productId={productId} />
          ) : activeTab === "ai" ? (
            <PlanAIConfigTab planId={planId} productId={productId} />
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
