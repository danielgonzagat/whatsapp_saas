"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ProductGeneralTab } from "@/components/products/ProductGeneralTab"
import { ProductPlansTab } from "@/components/products/ProductPlansTab"
import { ProductCheckoutsTab } from "@/components/products/ProductCheckoutsTab"
import { ProductUrlsTab } from "@/components/products/ProductUrlsTab"
import { ProductCommissionsTab } from "@/components/products/ProductCommissionsTab"
import { ProductCouponsTab } from "@/components/products/ProductCouponsTab"
import { ProductReviewsTab } from "@/components/products/ProductReviewsTab"
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        border: '2px dashed #222226',
        padding: '64px 0',
      }}
    >
      <p style={{ fontSize: 14, fontWeight: 500, color: '#6E6E73', fontFamily: "'Sora', sans-serif" }}>
        Aba "{tabLabel}" -- em construcao
      </p>
      <p style={{ marginTop: 4, fontSize: 12, color: '#3A3A3F', fontFamily: "'Sora', sans-serif" }}>
        Salve o produto para configurar esta secao.
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
    <div style={{ minHeight: '100vh', padding: '32px 24px', backgroundColor: '#0A0A0C' }}>
      <div style={{ maxWidth: 1152, margin: '0 auto' }}>
        {/* Breadcrumb + Back */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.push("/products")}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 14,
              color: '#6E6E73',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Sora', sans-serif",
              transition: 'color 150ms ease',
            }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
            Voltar
          </button>
          <span style={{ fontSize: 14, color: '#3A3A3F' }}>·</span>
          <span style={{ fontSize: 14, color: '#6E6E73', fontFamily: "'Sora', sans-serif" }}>Produto {productId?.slice(0, 8)}...</span>
        </div>

        {/* Tab Navigation */}
        <div style={{ marginBottom: 24, overflowX: 'auto' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #222226' }}>
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    whiteSpace: 'nowrap',
                    borderBottom: `2px solid ${isActive ? '#E85D30' : 'transparent'}`,
                    padding: '12px 16px',
                    fontSize: 14,
                    fontWeight: 500,
                    fontFamily: "'Sora', sans-serif",
                    color: isActive ? '#E85D30' : '#6E6E73',
                    background: 'transparent',
                    border: 'none',
                    borderBottomWidth: 2,
                    borderBottomStyle: 'solid',
                    borderBottomColor: isActive ? '#E85D30' : 'transparent',
                    cursor: 'pointer',
                    transition: 'color 150ms ease',
                  }}
                >
                  <Icon style={{ width: 16, height: 16 }} />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div style={{ borderRadius: 6, border: '1px solid #222226', backgroundColor: '#111113', padding: 24 }}>
          {activeTab === "general" ? (
            <ProductGeneralTab productId={productId} />
          ) : activeTab === "plans" ? (
            <ProductPlansTab productId={productId} />
          ) : activeTab === "checkouts" ? (
            <ProductCheckoutsTab productId={productId} />
          ) : activeTab === "urls" ? (
            <ProductUrlsTab productId={productId} />
          ) : activeTab === "commissions" ? (
            <ProductCommissionsTab productId={productId} />
          ) : activeTab === "coupons" ? (
            <ProductCouponsTab productId={productId} />
          ) : activeTab === "reviews" ? (
            <ProductReviewsTab productId={productId} />
          ) : (
            <TabPlaceholder tabId={activeTab} tabLabel={activeTabInfo.label} />
          )}
        </div>

        {/* Save Bar */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setSaving(true)}
            disabled={saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 6,
              padding: '10px 24px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Sora', sans-serif",
              color: '#fff',
              backgroundColor: '#E85D30',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
              transition: 'opacity 150ms ease',
            }}
          >
            {saving ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Save style={{ width: 16, height: 16 }} />}
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}
