'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PlanStoreTab } from '@/components/plans/PlanStoreTab';
import { PlanPaymentTab } from '@/components/plans/PlanPaymentTab';
import { PlanShippingTab } from '@/components/plans/PlanShippingTab';
import { PlanAIConfigTab } from '@/components/plans/PlanAIConfigTab';
import { PlanOrderBumpTab } from '@/components/plans/PlanOrderBumpTab';
import { PlanAffiliateTab } from '@/components/plans/PlanAffiliateTab';
import { PlanThankYouTab } from '@/components/plans/PlanThankYouTab';
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
} from 'lucide-react';
import { colors } from '@/lib/design-tokens';

// ============================================
// SUB-TABS
// ============================================

const SUB_TABS = [
  { id: 'store', label: 'Loja', icon: Store },
  { id: 'payment', label: 'Pagamento', icon: CreditCard },
  { id: 'packaging', label: 'Embalagem', icon: Package },
  { id: 'shipping', label: 'Frete', icon: Truck },
  { id: 'affiliate', label: 'Afiliacao', icon: Users },
  { id: 'files', label: 'Arquivos', icon: FileText },
  { id: 'orderbump', label: 'Order Bump', icon: ShoppingCart },
  { id: 'terms', label: 'Termos', icon: ScrollText },
  { id: 'ai', label: 'IA', icon: Brain },
];

// ============================================
// MAIN PAGE
// ============================================

export default function PlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params?.id as string;
  const planId = params?.planId as string;
  const [activeTab, setActiveTab] = useState('store');
  const [saving, setSaving] = useState(false);

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px', backgroundColor: '#0A0A0C' }}>
      <div style={{ maxWidth: 1024, margin: '0 auto' }}>
        {/* Back */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => router.push(`/products/${productId}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 14,
              color: '#6E6E73',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
            Voltar ao produto
          </button>
        </div>

        <h1
          style={{
            marginBottom: 24,
            fontSize: 20,
            fontWeight: 700,
            color: '#E0DDD8',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          Configuracoes do plano
        </h1>

        {/* Sub-tabs */}
        <div style={{ marginBottom: 24, overflowX: 'auto' }}>
          <div
            style={{
              display: 'flex',
              gap: 4,
              borderRadius: 6,
              backgroundColor: '#19191C',
              padding: 4,
            }}
          >
            {SUB_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 12,
                    fontWeight: 500,
                    fontFamily: "'Sora', sans-serif",
                    backgroundColor: isActive ? '#222226' : 'transparent',
                    color: isActive ? '#E85D30' : '#6E6E73',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  <Icon style={{ width: 14, height: 14 }} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div
          style={{
            borderRadius: 6,
            border: '1px solid #222226',
            backgroundColor: '#111113',
            padding: 24,
          }}
        >
          {activeTab === 'store' ? (
            <PlanStoreTab planId={planId} productId={productId} />
          ) : activeTab === 'payment' ? (
            <PlanPaymentTab planId={planId} productId={productId} />
          ) : activeTab === 'shipping' ? (
            <PlanShippingTab planId={planId} productId={productId} />
          ) : activeTab === 'packaging' ? (
            <PlanShippingTab planId={planId} productId={productId} />
          ) : activeTab === 'files' ? (
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#E85D30',
                  letterSpacing: '.25em',
                  textTransform: 'uppercase' as const,
                  marginBottom: 12,
                }}
              >
                EM BREVE
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#E0DDD8',
                  marginBottom: 6,
                  fontFamily: "'Sora', sans-serif",
                }}
              >
                Upload de arquivos
              </div>
              <div style={{ fontSize: 12, color: '#3A3A3F', fontFamily: "'Sora', sans-serif" }}>
                Anexe eBooks, PDFs e materiais digitais ao plano
              </div>
            </div>
          ) : activeTab === 'orderbump' ? (
            <PlanOrderBumpTab planId={planId} />
          ) : activeTab === 'affiliate' ? (
            <PlanAffiliateTab planId={planId} productId={productId} priceInCents={0} />
          ) : activeTab === 'terms' ? (
            <PlanThankYouTab planId={planId} productId={productId} />
          ) : activeTab === 'ai' ? (
            <PlanAIConfigTab planId={planId} productId={productId} />
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '64px 0',
              }}
            >
              <p style={{ fontSize: 14, color: '#6E6E73', fontFamily: "'Sora', sans-serif" }}>
                Aba &ldquo;{SUB_TABS.find((t) => t.id === activeTab)?.label}&rdquo; -- em construcao
              </p>
            </div>
          )}
        </div>

        {/* Save */}
        <div
          style={{
            marginTop: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            onClick={() => router.push(`/products/${productId}`)}
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: '#6E6E73',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Sora', sans-serif",
            }}
          >
            Sair da Edicao
          </button>
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
              color: '#0A0A0C',
              backgroundColor: '#E0DDD8',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? (
              <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
            ) : (
              <Save style={{ width: 16, height: 16 }} />
            )}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
