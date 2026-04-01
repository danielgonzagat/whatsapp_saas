'use client'

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Package,
  Monitor,
  Layers,
  Box,
  Truck,
  Users,
  CreditCard,
  ClipboardList,
  Pencil,
  X,
} from 'lucide-react'
import { MediaPreviewBox } from '@/components/kloel/MediaPreviewBox'
import { usePersistentImagePreview } from '@/hooks/usePersistentImagePreview'
import { colors, typography, shadows } from '@/lib/design-tokens'
import { apiFetch } from '@/lib/api'
import { mutate as globalMutate } from 'swr'
import { useWorkspaceId } from '@/hooks/useWorkspaceId'
import { PRODUCT_CATEGORIES } from '@/lib/categories'
import { readFileAsDataUrl, uploadGenericMedia } from '@/lib/media-upload'

// ============================================
// STEPS CONFIG
// ============================================

const STEPS = [
  { id: 1, label: 'Detalhes', icon: ClipboardList },
  { id: 2, label: 'Vendas', icon: CreditCard },
  { id: 3, label: 'Embalagem', icon: Box },
  { id: 4, label: 'Entrega', icon: Truck },
  { id: 5, label: 'Afiliacao', icon: Users },
  { id: 6, label: 'Pagamento', icon: CreditCard },
  { id: 7, label: 'Revisao', icon: ClipboardList },
]

const GUARANTEE_OPTIONS = [
  { value: '7', label: '7 dias' },
  { value: '15', label: '15 dias' },
  { value: '30', label: '30 dias' },
  { value: '60', label: '60 dias' },
  { value: '90', label: '90 dias' },
]

const PACKAGE_TYPES = [
  'Caixa',
  'Envelope',
  'Tubo',
  'Sacola',
  'Palete',
  'Outro',
]

const DISPATCH_TIMES = [
  { value: '1', label: '1 dia util' },
  { value: '2', label: '2 dias uteis' },
  { value: '3', label: '3 dias uteis' },
  { value: '5', label: '5 dias uteis' },
  { value: '7', label: '7 dias uteis' },
  { value: '10', label: '10 dias uteis' },
  { value: '15', label: '15 dias uteis' },
]

const CARRIERS = [
  'Correios PAC',
  'SEDEX',
  'Jadlog',
  'Loggi',
  'Total Express',
  'Azul Cargo',
  'Latam Cargo',
  'Sequoia',
  'Kangu',
  'Melhor Envio',
  'Transportadora Local',
]

// ============================================
// FORM STATE TYPE
// ============================================

interface FormState {
  // Step 1 - Detalhes
  name: string
  description: string
  category: string
  tags: string[]
  format: 'PHYSICAL' | 'DIGITAL' | 'HYBRID'
  imageUrl: string
  // Step 2 - Vendas
  price: string
  paymentType: 'ONE_TIME' | 'SUBSCRIPTION' | 'INSTALLMENT'
  affiliateCommission: string
  salesPageUrl: string
  guaranteeDays: string
  checkoutType: 'standard' | 'conversational'
  facebookPixelId: string
  googleTagManagerId: string
  // Step 3 - Embalagem
  packageType: string
  width: string
  height: string
  depth: string
  weight: string
  // Step 4 - Entrega
  shippingResponsible: 'producer' | 'supplier' | 'fulfillment' | 'dropshipping'
  dispatchTime: string
  carriers: string[]
  // Step 5 - Afiliacao
  affiliatesEnabled: boolean
  affiliateCommissionPercent: string
  affiliateApprovalMode: 'auto' | 'manual'
  // Step 6 - Pagamento
  billingType: 'one_time' | 'recurring' | 'free'
  maxInstallments: string
  interestFreeInstallments: string
}

const initialForm: FormState = {
  name: '',
  description: '',
  category: '',
  tags: [],
  format: 'PHYSICAL',
  imageUrl: '',
  price: '',
  paymentType: 'ONE_TIME',
  affiliateCommission: '',
  salesPageUrl: '',
  guaranteeDays: '30',
  checkoutType: 'standard',
  facebookPixelId: '',
  googleTagManagerId: '',
  packageType: '',
  width: '',
  height: '',
  depth: '',
  weight: '',
  shippingResponsible: 'producer',
  dispatchTime: '3',
  carriers: [],
  affiliatesEnabled: false,
  affiliateCommissionPercent: '',
  affiliateApprovalMode: 'auto',
  billingType: 'one_time',
  maxInstallments: '12',
  interestFreeInstallments: '1',
}

// ============================================
// MONITOR STYLE HELPERS
// ============================================

const monitorInput: React.CSSProperties = {
  width: '100%',
  backgroundColor: colors.background.nebula,
  border: `1px solid ${colors.border.space}`,
  borderRadius: 6,
  padding: '12px 16px',
  fontSize: 14,
  fontFamily: typography.fontFamily.sans,
  color: colors.text.starlight,
  outline: 'none',
  transition: 'border-color 150ms ease',
}

const monitorLabel: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: typography.fontFamily.display,
  color: colors.text.moonlight,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
}

const monitorCard: React.CSSProperties = {
  backgroundColor: colors.background.space,
  border: `1px solid ${colors.border.space}`,
  borderRadius: 6,
  padding: 24,
}

// ============================================
// STEPPER COMPONENT
// ============================================

function MonitorStepper({
  currentStep,
  steps,
  visibleSteps,
}: {
  currentStep: number
  steps: typeof STEPS
  visibleSteps: number[]
}) {
  const filtered = steps.filter((s) => visibleSteps.includes(s.id))

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
        {filtered.map((step, idx) => {
          const isActive = step.id === currentStep
          const isCompleted = step.id < currentStep
          const isFuture = step.id > currentStep

          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 }}>
                {/* Dot */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: typography.fontFamily.display,
                    backgroundColor: isCompleted
                      ? colors.state.success
                      : isActive
                      ? colors.accent.webb
                      : colors.background.nebula,
                    color: isCompleted || isActive ? '#fff' : colors.text.void,
                    border: isActive
                      ? `2px solid ${colors.accent.webb}`
                      : isCompleted
                      ? `2px solid ${colors.state.success}`
                      : `1px solid ${colors.border.space}`,
                    transition: 'all 150ms ease',
                  }}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step.id}
                </div>
                {/* Label */}
                <span
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily: typography.fontFamily.display,
                    color: isActive
                      ? colors.accent.webb
                      : isCompleted
                      ? colors.state.success
                      : colors.text.void,
                    letterSpacing: '0.02em',
                    transition: 'color 150ms ease',
                  }}
                >
                  {step.label}
                </span>
              </div>
              {/* Connecting line */}
              {idx < filtered.length - 1 && (
                <div
                  style={{
                    width: 40,
                    height: 2,
                    backgroundColor: step.id < currentStep ? colors.state.success : colors.border.space,
                    marginBottom: 18,
                    transition: 'background-color 150ms ease',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================
// MONITOR INPUT WRAPPER
// ============================================

function MonitorInputField({
  label,
  children,
  hint,
}: {
  label?: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <label style={monitorLabel}>{label}</label>}
      {children}
      {hint && (
        <p style={{ marginTop: 4, fontSize: 11, color: colors.text.dust, fontFamily: typography.fontFamily.sans }}>
          {hint}
        </p>
      )}
    </div>
  )
}

// ============================================
// MAIN PAGE
// ============================================

export default function NewProductPage() {
  const router = useRouter()
  const workspaceId = useWorkspaceId()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(initialForm)
  const [tagInput, setTagInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const {
    previewUrl: localPreviewUrl,
    clearPreview: clearLocalPreview,
    setPreviewUrl: setLocalPreviewUrl,
  } = usePersistentImagePreview({
    storageKey: 'kloel_product_preview',
  })

  const needsPhysical = form.format === 'PHYSICAL' || form.format === 'HYBRID'

  // Build visible steps based on format
  const visibleSteps = needsPhysical ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 5, 6, 7]

  // Map logical next/prev considering skipped steps
  const currentVisibleIndex = visibleSteps.indexOf(step)
  const isLastStep = currentVisibleIndex === visibleSteps.length - 1
  const isFirstStep = currentVisibleIndex === 0

  const goNext = () => {
    if (currentVisibleIndex < visibleSteps.length - 1) {
      setStep(visibleSteps[currentVisibleIndex + 1])
    }
  }
  const goPrev = () => {
    if (currentVisibleIndex > 0) {
      setStep(visibleSteps[currentVisibleIndex - 1])
    } else {
      router.push('/products')
    }
  }

  const updateForm = (partial: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  const handleTagAdd = () => {
    const t = tagInput.trim()
    if (t && form.tags.length < 5 && !form.tags.includes(t)) {
      updateForm({ tags: [...form.tags, t] })
      setTagInput('')
    }
  }

  const handleTagRemove = (tag: string) => {
    updateForm({ tags: form.tags.filter((t) => t !== tag) })
  }

  const handleCarrierToggle = (carrier: string) => {
    if (form.carriers.includes(carrier)) {
      updateForm({ carriers: form.carriers.filter((c) => c !== carrier) })
    } else {
      updateForm({ carriers: [...form.carriers, carrier] })
    }
  }

  const handleFileUpload = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file)
    setLocalPreviewUrl(dataUrl)

    setUploading(true)
    try {
      const uploadedUrl = await uploadGenericMedia(file, { folder: 'products' })
      if (uploadedUrl) {
        updateForm({ imageUrl: uploadedUrl })
      }
    } catch (e) {
      console.error('Upload failed:', e)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, any> = {
        workspaceId,
        name: form.name,
        description: form.description,
        category: form.category,
        tags: form.tags,
        format: form.format,
        imageUrl: form.imageUrl || undefined,
        price: parseFloat(form.price) || 0,
        paymentType: form.paymentType,
        affiliateCommission: parseFloat(form.affiliateCommission) || 0,
        salesPageUrl: form.salesPageUrl || undefined,
        guaranteeDays: parseInt(form.guaranteeDays) || 30,
        checkoutType: form.checkoutType,
        facebookPixelId: form.facebookPixelId || undefined,
        googleTagManagerId: form.googleTagManagerId || undefined,
        affiliatesEnabled: form.affiliatesEnabled,
        affiliateCommissionPercent: parseFloat(form.affiliateCommissionPercent) || 0,
        affiliateApprovalMode: form.affiliateApprovalMode,
        billingType: form.billingType,
        maxInstallments: parseInt(form.maxInstallments) || 12,
        interestFreeInstallments: parseInt(form.interestFreeInstallments) || 1,
        status: 'DRAFT',
      }

      if (needsPhysical) {
        body.packageType = form.packageType || undefined
        body.width = parseFloat(form.width) || undefined
        body.height = parseFloat(form.height) || undefined
        body.depth = parseFloat(form.depth) || undefined
        body.weight = parseFloat(form.weight) || undefined
        body.shippingResponsible = form.shippingResponsible
        body.dispatchTime = parseInt(form.dispatchTime) || 3
        body.carriers = form.carriers
      }

      const res = await apiFetch<any>('/products', { method: 'POST', body })
      globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'))
      if (res.data?.id) {
        clearLocalPreview()
        router.push(`/products/${res.data.id}`)
      } else {
        clearLocalPreview()
        router.push('/products')
      }
    } catch {
      console.error('Erro ao salvar produto')
    } finally {
      setSaving(false)
    }
  }

  // Focus style handler
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = colors.accent.webb
    // removed boxShadow
  }
  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = colors.border.space
    e.target.style.boxShadow = 'none'
  }

  // Shared input props
  const inputProps = {
    style: monitorInput,
    onFocus: handleInputFocus,
    onBlur: handleInputBlur,
  }

  const selectStyle: React.CSSProperties = {
    ...monitorInput,
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235C5A6E' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    paddingRight: 36,
  }

  // ============================================
  // FORMAT CARDS
  // ============================================

  const formatOptions = [
    { value: 'PHYSICAL' as const, label: 'Fisico', icon: Package, desc: 'Produto tangivel enviado por correio' },
    { value: 'DIGITAL' as const, label: 'Digital', icon: Monitor, desc: 'Curso, e-book, software ou arquivo' },
    { value: 'HYBRID' as const, label: 'Hibrido', icon: Layers, desc: 'Parte fisica + parte digital' },
  ]

  // ============================================
  // RENDER
  // ============================================

  return (
    <div
      style={{
        height: '100vh',
        backgroundColor: colors.background.void,
        position: 'relative',
        overflowY: 'auto',
      }}
    >
      <style>{`*{box-sizing:border-box}:root{--pg2:1fr 1fr;--pg3:repeat(3,1fr)}@media(max-width:640px){:root{--pg2:1fr;--pg3:1fr}}`}</style>

      <div className="pnew-wrap" style={{ position: 'relative', zIndex: 1, padding: '24px clamp(12px, 4vw, 24px)', paddingBottom: '80px', maxWidth: 780, margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ marginBottom: 8 }}>
          <p
            style={{
              fontSize: 12,
              color: colors.text.dust,
              fontFamily: typography.fontFamily.sans,
              marginBottom: 4,
            }}
          >
            Home &rarr; Produtos &rarr; Cadastrar produto
          </p>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              fontFamily: typography.fontFamily.display,
              color: colors.text.starlight,
              margin: 0,
              letterSpacing: '0.02em',
            }}
          >
            Cadastrar produto
          </h1>
        </div>

        {/* Stepper */}
        <MonitorStepper currentStep={step} steps={STEPS} visibleSteps={visibleSteps} />

        {/* ============================================ */}
        {/* STEP 1 — DETALHES */}
        {/* ============================================ */}
        {step === 1 && (
          <div style={monitorCard}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                color: colors.text.starlight,
                margin: '0 0 24px 0',
              }}
            >
              Detalhes do produto
            </h2>

            {/* Nome */}
            <MonitorInputField label="Nome do produto *">
              <input
                {...inputProps}
                value={form.name}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="Nome do produto"
                maxLength={200}
              />
              <p style={{ textAlign: 'right', marginTop: 4, fontSize: 11, color: colors.text.dust }}>
                {form.name.length}/200
              </p>
            </MonitorInputField>

            {/* Descricao */}
            <MonitorInputField label="Descricao *">
              <textarea
                style={{ ...monitorInput, resize: 'vertical' as const, minHeight: 100 }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder="Descreva seu produto..."
                maxLength={5000}
                rows={4}
              />
              <p style={{ textAlign: 'right', marginTop: 4, fontSize: 11, color: colors.text.dust }}>
                {form.description.length}/5000
              </p>
            </MonitorInputField>

            {/* Categoria */}
            <MonitorInputField label="Categoria *">
              <select
                style={selectStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                value={form.category}
                onChange={(e) => updateForm({ category: e.target.value })}
              >
                <option value="">Selecione uma categoria</option>
                {PRODUCT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </MonitorInputField>

            {/* Tags */}
            <MonitorInputField label="Tags (max. 5)">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  {...inputProps}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleTagAdd()
                    }
                  }}
                  placeholder={form.tags.length >= 5 ? 'Maximo atingido' : 'Adicionar tag e pressionar Enter...'}
                  disabled={form.tags.length >= 5}
                />
              </div>
              {form.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 12px',
                        borderRadius: 6,
                        backgroundColor: `rgba(232, 93, 48, 0.12)`,
                        color: colors.accent.webb,
                        fontSize: 12,
                        fontWeight: 500,
                        fontFamily: typography.fontFamily.sans,
                      }}
                    >
                      {tag}
                      <button
                        onClick={() => handleTagRemove(tag)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: colors.accent.webb,
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </MonitorInputField>

            {/* Formato */}
            <MonitorInputField label="Formato do produto *">
              <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg3)', gap: 12 }}>
                {formatOptions.map((opt) => {
                  const selected = form.format === opt.value
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateForm({ format: opt.value })}
                      style={{
                        background: selected
                          ? `rgba(232, 93, 48, 0.08)`
                          : colors.background.nebula,
                        border: `1.5px solid ${selected ? colors.accent.webb : colors.border.space}`,
                        borderRadius: 6,
                        padding: '20px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'all 150ms ease',
                        
                      }}
                    >
                      <Icon
                        style={{
                          width: 28,
                          height: 28,
                          color: selected ? colors.accent.webb : colors.text.dust,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          fontFamily: typography.fontFamily.display,
                          color: selected ? colors.accent.webb : colors.text.moonlight,
                        }}
                      >
                        {opt.label}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: colors.text.dust,
                          fontFamily: typography.fontFamily.sans,
                          textAlign: 'center',
                        }}
                      >
                        {opt.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </MonitorInputField>

            {/* Photo Upload */}
            <MonitorInputField label="Foto do produto">
              <MediaPreviewBox
                inputAriaLabel="Imagem do produto"
                previewUrl={localPreviewUrl}
                fallbackUrl={form.imageUrl}
                uploading={uploading}
                emptySubtitle="JPG, PNG ou WebP - Max 10MB"
                emptyTitle="Arraste ou clique para enviar"
                onSelectFile={(file) => {
                  void handleFileUpload(file)
                }}
                onClear={() => {
                  clearLocalPreview()
                  updateForm({ imageUrl: '' })
                }}
                theme={{
                  accentColor: colors.accent.webb,
                  borderColor: colors.border.space,
                  frameBackground: 'rgba(255,255,255,0.04)',
                  labelColor: colors.text.dust,
                  mutedColor: colors.text.dust,
                  textColor: colors.text.moonlight,
                }}
              />
            </MonitorInputField>
          </div>
        )}

        {/* ============================================ */}
        {/* STEP 2 — CONFIGURACAO DE VENDAS */}
        {/* ============================================ */}
        {step === 2 && (
          <div style={monitorCard}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                color: colors.text.starlight,
                margin: '0 0 24px 0',
              }}
            >
              Configuracao de Vendas
            </h2>

            {/* Preco */}
            <MonitorInputField label="Preco (R$) *">
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 14,
                    fontWeight: 600,
                    color: colors.text.dust,
                  }}
                >
                  R$
                </span>
                <input
                  aria-label="Preco em reais"
                  {...inputProps}
                  style={{ ...monitorInput, paddingLeft: 44 }}
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => updateForm({ price: e.target.value })}
                  placeholder="0,00"
                />
              </div>
            </MonitorInputField>

            {/* Tipo de pagamento */}
            <MonitorInputField label="Tipo de pagamento *">
              <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg3)', gap: 12 }}>
                {[
                  { value: 'ONE_TIME' as const, label: 'Avista', desc: 'Pagamento unico' },
                  { value: 'SUBSCRIPTION' as const, label: 'Assinatura', desc: 'Cobranca recorrente' },
                  { value: 'INSTALLMENT' as const, label: 'Parcelado', desc: 'Dividido em parcelas' },
                ].map((opt) => {
                  const selected = form.paymentType === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateForm({ paymentType: opt.value })}
                      style={{
                        background: selected ? 'rgba(232, 93, 48, 0.08)' : colors.background.nebula,
                        border: `1.5px solid ${selected ? colors.accent.webb : colors.border.space}`,
                        borderRadius: 6,
                        padding: '14px 12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 150ms ease',
                        
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: typography.fontFamily.display,
                          color: selected ? colors.accent.webb : colors.text.moonlight,
                          display: 'block',
                        }}
                      >
                        {opt.label}
                      </span>
                      <span style={{ fontSize: 11, color: colors.text.dust, display: 'block', marginTop: 2 }}>
                        {opt.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </MonitorInputField>

            {/* Comissao afiliado */}
            <MonitorInputField label="Comissao de afiliado (%)" hint="De 0 a 100%">
              <input
                {...inputProps}
                type="number"
                min="0"
                max="100"
                value={form.affiliateCommission}
                onChange={(e) => updateForm({ affiliateCommission: e.target.value })}
                placeholder="0"
              />
            </MonitorInputField>

            {/* URL de vendas */}
            <MonitorInputField label="URL da pagina de vendas">
              <input
                {...inputProps}
                value={form.salesPageUrl}
                onChange={(e) => updateForm({ salesPageUrl: e.target.value })}
                placeholder="https://..."
              />
            </MonitorInputField>

            {/* Garantia */}
            <MonitorInputField label="Periodo de garantia">
              <select
                style={selectStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                value={form.guaranteeDays}
                onChange={(e) => updateForm({ guaranteeDays: e.target.value })}
              >
                {GUARANTEE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </MonitorInputField>

            {/* Tipo de checkout */}
            <MonitorInputField label="Tipo de checkout">
              <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg2)', gap: 12 }}>
                {[
                  { value: 'standard' as const, label: 'Standard', desc: 'Checkout tradicional' },
                  { value: 'conversational' as const, label: 'Conversacional', desc: 'Via WhatsApp com IA' },
                ].map((opt) => {
                  const selected = form.checkoutType === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateForm({ checkoutType: opt.value })}
                      style={{
                        background: selected ? 'rgba(232, 93, 48, 0.08)' : colors.background.nebula,
                        border: `1.5px solid ${selected ? colors.accent.webb : colors.border.space}`,
                        borderRadius: 6,
                        padding: '14px 12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 150ms ease',
                        
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: typography.fontFamily.display,
                          color: selected ? colors.accent.webb : colors.text.moonlight,
                        }}
                      >
                        {opt.label}
                      </span>
                      <span style={{ fontSize: 11, color: colors.text.dust, display: 'block', marginTop: 2 }}>
                        {opt.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </MonitorInputField>

            {/* Pixel Section */}
            <div
              style={{
                marginTop: 20,
                padding: 20,
                borderRadius: 6,
                backgroundColor: colors.background.nebula,
                border: `1px solid ${colors.border.space}`,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: typography.fontFamily.display,
                  color: colors.text.starlight,
                  marginBottom: 16,
                }}
              >
                Pixels de rastreamento
              </h3>

              <MonitorInputField label="Facebook Pixel ID">
                <input
                  {...inputProps}
                  value={form.facebookPixelId}
                  onChange={(e) => updateForm({ facebookPixelId: e.target.value })}
                  placeholder="123456789012345"
                />
              </MonitorInputField>

              <MonitorInputField label="Google Tag Manager ID">
                <input
                  {...inputProps}
                  value={form.googleTagManagerId}
                  onChange={(e) => updateForm({ googleTagManagerId: e.target.value })}
                  placeholder="GTM-XXXXXXX"
                />
              </MonitorInputField>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* STEP 3 — EMBALAGEM (Physical/Hybrid only) */}
        {/* ============================================ */}
        {step === 3 && needsPhysical && (
          <div style={monitorCard}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                color: colors.text.starlight,
                margin: '0 0 24px 0',
              }}
            >
              Embalagem
            </h2>

            {/* Tipo de embalagem */}
            <MonitorInputField label="Tipo de embalagem">
              <select
                style={selectStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                value={form.packageType}
                onChange={(e) => updateForm({ packageType: e.target.value })}
              >
                <option value="">Selecione...</option>
                {PACKAGE_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </MonitorInputField>

            {/* Dimensoes */}
            <MonitorInputField label="Dimensoes (cm)">
              <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg3)', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: colors.text.dust, marginBottom: 4, display: 'block' }}>
                    Largura
                  </label>
                  <input
                    {...inputProps}
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.width}
                    onChange={(e) => updateForm({ width: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: colors.text.dust, marginBottom: 4, display: 'block' }}>
                    Altura
                  </label>
                  <input
                    aria-label="Altura em cm"
                    {...inputProps}
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.height}
                    onChange={(e) => updateForm({ height: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: colors.text.dust, marginBottom: 4, display: 'block' }}>
                    Profundidade
                  </label>
                  <input
                    aria-label="Profundidade em cm"
                    {...inputProps}
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.depth}
                    onChange={(e) => updateForm({ depth: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
            </MonitorInputField>

            {/* Peso */}
            <MonitorInputField label="Peso (kg)">
              <input
                {...inputProps}
                type="number"
                min="0"
                step="0.01"
                value={form.weight}
                onChange={(e) => updateForm({ weight: e.target.value })}
                placeholder="0,00"
              />
            </MonitorInputField>
          </div>
        )}

        {/* ============================================ */}
        {/* STEP 4 — ENTREGA (Physical/Hybrid only) */}
        {/* ============================================ */}
        {step === 4 && needsPhysical && (
          <div style={monitorCard}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                color: colors.text.starlight,
                margin: '0 0 24px 0',
              }}
            >
              Entrega
            </h2>

            {/* Quem envia */}
            <MonitorInputField label="Quem realiza o envio? *">
              <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg2)', gap: 12 }}>
                {[
                  { value: 'producer' as const, label: 'Produtor', desc: 'Voce mesmo envia' },
                  { value: 'supplier' as const, label: 'Fornecedor', desc: 'Seu fornecedor envia' },
                  { value: 'fulfillment' as const, label: 'Fulfillment', desc: 'Centro de distribuicao' },
                  { value: 'dropshipping' as const, label: 'Dropshipping', desc: 'Envio direto ao cliente' },
                ].map((opt) => {
                  const selected = form.shippingResponsible === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateForm({ shippingResponsible: opt.value })}
                      style={{
                        background: selected ? 'rgba(232, 93, 48, 0.08)' : colors.background.nebula,
                        border: `1.5px solid ${selected ? colors.accent.webb : colors.border.space}`,
                        borderRadius: 6,
                        padding: '14px 12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 150ms ease',
                        
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: typography.fontFamily.display,
                          color: selected ? colors.accent.webb : colors.text.moonlight,
                          display: 'block',
                        }}
                      >
                        {opt.label}
                      </span>
                      <span style={{ fontSize: 11, color: colors.text.dust, display: 'block', marginTop: 2 }}>
                        {opt.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </MonitorInputField>

            {/* Prazo de despacho */}
            <MonitorInputField label="Prazo de despacho">
              <select
                style={selectStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                value={form.dispatchTime}
                onChange={(e) => updateForm({ dispatchTime: e.target.value })}
              >
                {DISPATCH_TIMES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </MonitorInputField>

            {/* Transportadoras */}
            <MonitorInputField label="Transportadoras disponiveis">
              <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg2)', gap: 8 }}>
                {CARRIERS.map((carrier) => {
                  const checked = form.carriers.includes(carrier)
                  return (
                    <label
                      key={carrier}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderRadius: 6,
                        backgroundColor: checked ? 'rgba(232, 93, 48, 0.06)' : colors.background.nebula,
                        border: `1px solid ${checked ? colors.accent.webb : colors.border.space}`,
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                      }}
                    >
                      <input
                        aria-label={carrier}
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleCarrierToggle(carrier)}
                        style={{ accentColor: colors.accent.webb }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          fontFamily: typography.fontFamily.sans,
                          color: checked ? colors.text.starlight : colors.text.moonlight,
                          fontWeight: checked ? 500 : 400,
                        }}
                      >
                        {carrier}
                      </span>
                    </label>
                  )
                })}
              </div>
            </MonitorInputField>
          </div>
        )}

        {/* ============================================ */}
        {/* STEP 5 — AFILIACAO */}
        {/* ============================================ */}
        {step === 5 && (
          <div style={monitorCard}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                color: colors.text.starlight,
                margin: '0 0 24px 0',
              }}
            >
              Programa de Afiliados
            </h2>

            {/* Toggle */}
            <MonitorInputField label="Habilitar afiliados">
              <button
                onClick={() => updateForm({ affiliatesEnabled: !form.affiliatesEnabled })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 18px',
                  borderRadius: 6,
                  backgroundColor: form.affiliatesEnabled
                    ? 'rgba(224, 221, 216, 0.08)'
                    : colors.background.nebula,
                  border: `1.5px solid ${form.affiliatesEnabled ? colors.state.success : colors.border.space}`,
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'all 150ms ease',
                }}
              >
                {/* Toggle switch */}
                <div
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 6,
                    backgroundColor: form.affiliatesEnabled ? colors.state.success : colors.border.space,
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'background-color 150ms ease',
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      position: 'absolute',
                      top: 3,
                      left: form.affiliatesEnabled ? 23 : 3,
                      transition: 'left 150ms ease',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 14,
                    fontFamily: typography.fontFamily.sans,
                    color: form.affiliatesEnabled ? colors.state.success : colors.text.moonlight,
                    fontWeight: 500,
                  }}
                >
                  {form.affiliatesEnabled ? 'Afiliados habilitados' : 'Afiliados desabilitados'}
                </span>
              </button>
            </MonitorInputField>

            {form.affiliatesEnabled && (
              <>
                {/* Comissao */}
                <MonitorInputField label="Comissao do afiliado (%)" hint="Percentual sobre cada venda">
                  <input
                    {...inputProps}
                    type="number"
                    min="0"
                    max="100"
                    value={form.affiliateCommissionPercent}
                    onChange={(e) => updateForm({ affiliateCommissionPercent: e.target.value })}
                    placeholder="0"
                  />
                </MonitorInputField>

                {/* Modo de aprovacao */}
                <MonitorInputField label="Modo de aprovacao">
                  <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg2)', gap: 12 }}>
                    {[
                      { value: 'auto' as const, label: 'Automatico', desc: 'Aprovacao instantanea' },
                      { value: 'manual' as const, label: 'Manual', desc: 'Voce aprova cada solicitacao' },
                    ].map((opt) => {
                      const selected = form.affiliateApprovalMode === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => updateForm({ affiliateApprovalMode: opt.value })}
                          style={{
                            background: selected ? 'rgba(232, 93, 48, 0.08)' : colors.background.nebula,
                            border: `1.5px solid ${selected ? colors.accent.webb : colors.border.space}`,
                            borderRadius: 6,
                            padding: '14px 12px',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 150ms ease',
                            
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              fontFamily: typography.fontFamily.display,
                              color: selected ? colors.accent.webb : colors.text.moonlight,
                              display: 'block',
                            }}
                          >
                            {opt.label}
                          </span>
                          <span style={{ fontSize: 11, color: colors.text.dust, display: 'block', marginTop: 2 }}>
                            {opt.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </MonitorInputField>
              </>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* STEP 6 — PAGAMENTO */}
        {/* ============================================ */}
        {step === 6 && (
          <div style={monitorCard}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                color: colors.text.starlight,
                margin: '0 0 24px 0',
              }}
            >
              Pagamento
            </h2>

            {/* Tipo de cobranca */}
            <MonitorInputField label="Tipo de cobranca *">
              <div style={{ display: 'grid', gridTemplateColumns: 'var(--pg3)', gap: 12 }}>
                {[
                  { value: 'one_time' as const, label: 'Unico', desc: 'Uma cobranca' },
                  { value: 'recurring' as const, label: 'Recorrente', desc: 'Assinatura mensal' },
                  { value: 'free' as const, label: 'Gratuito', desc: 'Sem cobranca' },
                ].map((opt) => {
                  const selected = form.billingType === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => updateForm({ billingType: opt.value })}
                      style={{
                        background: selected ? 'rgba(232, 93, 48, 0.08)' : colors.background.nebula,
                        border: `1.5px solid ${selected ? colors.accent.webb : colors.border.space}`,
                        borderRadius: 6,
                        padding: '14px 12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 150ms ease',
                        
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: typography.fontFamily.display,
                          color: selected ? colors.accent.webb : colors.text.moonlight,
                          display: 'block',
                        }}
                      >
                        {opt.label}
                      </span>
                      <span style={{ fontSize: 11, color: colors.text.dust, display: 'block', marginTop: 2 }}>
                        {opt.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </MonitorInputField>

            {form.billingType !== 'free' && (
              <>
                {/* Maximo de parcelas */}
                <MonitorInputField label="Maximo de parcelas">
                  <select
                    style={selectStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    value={form.maxInstallments}
                    onChange={(e) => updateForm({ maxInstallments: e.target.value })}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={String(n)}>
                        {n}x
                      </option>
                    ))}
                  </select>
                </MonitorInputField>

                {/* Parcelas sem juros */}
                <MonitorInputField label="Parcelas sem juros">
                  <select
                    style={selectStyle}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    value={form.interestFreeInstallments}
                    onChange={(e) => updateForm({ interestFreeInstallments: e.target.value })}
                  >
                    {Array.from({ length: parseInt(form.maxInstallments) || 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={String(n)}>
                        {n}x sem juros
                      </option>
                    ))}
                  </select>
                </MonitorInputField>
              </>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* STEP 7 — REVISAO */}
        {/* ============================================ */}
        {step === 7 && (
          <div style={monitorCard}>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                color: colors.text.starlight,
                margin: '0 0 24px 0',
              }}
            >
              Revisao do Produto
            </h2>

            {/* Section: Detalhes */}
            <ReviewSection
              title="Detalhes"
              onEdit={() => setStep(1)}
              items={[
                { label: 'Nome', value: form.name },
                { label: 'Descricao', value: form.description ? `${form.description.slice(0, 120)}...` : '' },
                { label: 'Categoria', value: form.category },
                { label: 'Tags', value: form.tags.join(', ') },
                {
                  label: 'Formato',
                  value:
                    form.format === 'PHYSICAL' ? 'Fisico' : form.format === 'DIGITAL' ? 'Digital' : 'Hibrido',
                },
              ]}
            />

            {/* Section: Vendas */}
            <ReviewSection
              title="Configuracao de Vendas"
              onEdit={() => setStep(2)}
              items={[
                {
                  label: 'Preco',
                  value: `R$ ${parseFloat(form.price || '0').toFixed(2).replace('.', ',')}`,
                  highlight: true,
                },
                {
                  label: 'Tipo de pagamento',
                  value:
                    form.paymentType === 'ONE_TIME'
                      ? 'Avista'
                      : form.paymentType === 'SUBSCRIPTION'
                      ? 'Assinatura'
                      : 'Parcelado',
                },
                { label: 'Comissao afiliado', value: form.affiliateCommission ? `${form.affiliateCommission}%` : '' },
                { label: 'Garantia', value: `${form.guaranteeDays} dias` },
                {
                  label: 'Checkout',
                  value: form.checkoutType === 'standard' ? 'Standard' : 'Conversacional',
                },
                { label: 'Facebook Pixel', value: form.facebookPixelId },
                { label: 'GTM ID', value: form.googleTagManagerId },
              ]}
            />

            {/* Section: Embalagem (conditional) */}
            {needsPhysical && (
              <ReviewSection
                title="Embalagem"
                onEdit={() => setStep(3)}
                items={[
                  { label: 'Tipo', value: form.packageType },
                  {
                    label: 'Dimensoes',
                    value:
                      form.width || form.height || form.depth
                        ? `${form.width || 0} x ${form.height || 0} x ${form.depth || 0} cm`
                        : '',
                  },
                  { label: 'Peso', value: form.weight ? `${form.weight} kg` : '' },
                ]}
              />
            )}

            {/* Section: Entrega (conditional) */}
            {needsPhysical && (
              <ReviewSection
                title="Entrega"
                onEdit={() => setStep(4)}
                items={[
                  {
                    label: 'Responsavel',
                    value:
                      form.shippingResponsible === 'producer'
                        ? 'Produtor'
                        : form.shippingResponsible === 'supplier'
                        ? 'Fornecedor'
                        : form.shippingResponsible === 'fulfillment'
                        ? 'Fulfillment'
                        : 'Dropshipping',
                  },
                  {
                    label: 'Prazo de despacho',
                    value: `${form.dispatchTime} dia(s) util(is)`,
                  },
                  { label: 'Transportadoras', value: form.carriers.join(', ') },
                ]}
              />
            )}

            {/* Section: Afiliacao */}
            <ReviewSection
              title="Afiliacao"
              onEdit={() => setStep(5)}
              items={[
                { label: 'Afiliados', value: form.affiliatesEnabled ? 'Habilitado' : 'Desabilitado' },
                ...(form.affiliatesEnabled
                  ? [
                      {
                        label: 'Comissao',
                        value: form.affiliateCommissionPercent
                          ? `${form.affiliateCommissionPercent}%`
                          : '',
                      },
                      {
                        label: 'Aprovacao',
                        value: form.affiliateApprovalMode === 'auto' ? 'Automatica' : 'Manual',
                      },
                    ]
                  : []),
              ]}
            />

            {/* Section: Pagamento */}
            <ReviewSection
              title="Pagamento"
              onEdit={() => setStep(6)}
              items={[
                {
                  label: 'Tipo de cobranca',
                  value:
                    form.billingType === 'one_time'
                      ? 'Unico'
                      : form.billingType === 'recurring'
                      ? 'Recorrente'
                      : 'Gratuito',
                },
                ...(form.billingType !== 'free'
                  ? [
                      { label: 'Max. parcelas', value: `${form.maxInstallments}x` },
                      {
                        label: 'Sem juros',
                        value: `${form.interestFreeInstallments}x`,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        )}

        {/* ============================================ */}
        {/* NAVIGATION */}
        {/* ============================================ */}
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            background: '#0A0A0C',
            borderTop: '1px solid #222226',
            padding: '16px 0',
            zIndex: 10,
            marginTop: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            onClick={goPrev}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 6,
              border: `1px solid ${colors.border.space}`,
              backgroundColor: 'transparent',
              color: colors.text.moonlight,
              fontSize: 14,
              fontWeight: 500,
              fontFamily: typography.fontFamily.sans,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = colors.background.nebula
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
            }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
            {isFirstStep ? 'Voltar' : 'Anterior'}
          </button>

          {!isLastStep ? (
            <button
              onClick={goNext}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 24px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: colors.accent.webb,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = colors.accent.webbHover
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = colors.accent.webb
              }}
            >
              Continuar
              <ArrowRight style={{ width: 16, height: 16 }} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || !form.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 28px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: saving || !form.name ? colors.border.space : colors.accent.webb,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: typography.fontFamily.display,
                cursor: saving || !form.name ? 'not-allowed' : 'pointer',
                transition: 'all 150ms ease',
                opacity: saving || !form.name ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!saving && form.name) {
                  ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = colors.accent.webbHover
                }
              }}
              onMouseLeave={(e) => {
                if (!saving && form.name) {
                  ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = colors.accent.webb
                }
              }}
            >
              {saving ? (
                <div style={{width:20,height:20,border:'2px solid transparent',borderTopColor:'#E85D30',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
              ) : (
                <Check style={{ width: 16, height: 16 }} />
              )}
              {saving ? 'Salvando...' : 'Publicar Produto'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// REVIEW SECTION
// ============================================

function ReviewSection({
  title,
  onEdit,
  items,
}: {
  title: string
  onEdit: () => void
  items: { label: string; value: string; highlight?: boolean }[]
}) {
  return (
    <div
      style={{
        marginBottom: 20,
        padding: 20,
        borderRadius: 6,
        backgroundColor: colors.background.nebula,
        border: `1px solid ${colors.border.space}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            fontFamily: typography.fontFamily.display,
            color: colors.text.starlight,
            margin: 0,
          }}
        >
          {title}
        </h3>
        <button
          onClick={onEdit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontWeight: 500,
            color: colors.accent.webb,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: typography.fontFamily.sans,
          }}
        >
          <Pencil style={{ width: 12, height: 12 }} />
          Editar
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 0',
              borderBottom: `1px solid ${colors.border.void}`,
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: colors.text.dust,
                fontFamily: typography.fontFamily.sans,
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: item.highlight ? 700 : 500,
                color: item.highlight ? colors.accent.webb : colors.text.starlight,
                fontFamily: typography.fontFamily.sans,
                maxWidth: '60%',
                textAlign: 'right',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.value || '\u2014'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
