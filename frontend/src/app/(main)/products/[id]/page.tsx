"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ProductGeneralTab } from "@/components/products/ProductGeneralTab"
import { ProductPlansTab } from "@/components/products/ProductPlansTab"
import {
  Home,
  DollarSign,
  ShoppingCart,
  Link2,
  Users,
  Tag,
  Megaphone,
  Star,
  CreditCard,
  ArrowLeft,
  Save,
  Loader2,
} from "lucide-react"
import { colors } from "@/lib/design-tokens"

// ============================================
// TABS
// ============================================

const TABS = [
  { id: "general", label: "Dados gerais", icon: Home },
  { id: "plans", label: "Planos", icon: DollarSign },
  { id: "checkouts", label: "Checkouts", icon: ShoppingCart },
  { id: "urls", label: "Urls", icon: Link2 },
  { id: "commissions", label: "Comissionamento", icon: Users },
  { id: "coupons", label: "Cupons", icon: Tag },
  { id: "campaigns", label: "Campanhas", icon: Megaphone },
  { id: "reviews", label: "Avaliações", icon: Star },
  { id: "afterpay", label: "After Pay", icon: CreditCard },
]

// ============================================
// PLACEHOLDER TAB CONTENT
// ============================================

function TabPlaceholder({ tabId, tabLabel }: { tabId: string; tabLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
      <p className="text-sm font-medium text-gray-500">
        Aba "{tabLabel}" — em construção
      </p>
      <p className="mt-1 text-xs text-gray-400">
        Salve o produto para configurar esta seção.
      </p>
    </div>
  )
}

// ============================================
// MAIN PAGE
// ============================================

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const productId = params?.id as string
  const [activeTab, setActiveTab] = useState("general")
  const [saving, setSaving] = useState(false)

  const activeTabInfo = TABS.find((t) => t.id === activeTab) || TABS[0]

  return (
    <div className="min-h-screen px-6 py-8" style={{ backgroundColor: colors.background.base }}>
      <div className="mx-auto max-w-6xl">
        {/* Breadcrumb + Back */}
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => router.push("/products")}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <span className="text-sm text-gray-400">·</span>
          <span className="text-sm text-gray-500">Produto {productId?.slice(0, 8)}...</span>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex border-b border-gray-200">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors"
                  style={{
                    borderBottomColor: isActive ? colors.brand.primary : "transparent",
                    color: isActive ? colors.brand.primary : "#6B7280",
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          {activeTab === "general" ? (
            <ProductGeneralTab productId={productId} />
          ) : activeTab === "plans" ? (
            <ProductPlansTab productId={productId} />
          ) : (
            <TabPlaceholder tabId={activeTab} tabLabel={activeTabInfo.label} />
          )}
        </div>

        {/* Save Bar */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setSaving(true)}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: colors.brand.primary }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}
