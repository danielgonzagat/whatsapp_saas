"use client"
import { useState, useEffect } from "react"
import { CreditCard, FileText, AlertTriangle, QrCode, Check } from "lucide-react"
import { CurrencyInput } from "@/components/kloel/FormExtras"
import { colors, typography, shadows } from "@/lib/design-tokens"
import { apiFetch } from '@/lib/api'

export function PlanPaymentTab({ planId, productId }: { planId: string; productId: string }) {
  const [maxInstallments, setMaxInstallments] = useState("12")
  const [maxNoInterest, setMaxNoInterest] = useState("3")
  const [discountByPayment, setDiscountByPayment] = useState(false)
  const [notifyBoleto, setNotifyBoleto] = useState(true)
  const [billingType, setBillingType] = useState("ONE_TIME")
  const [recurringInterval, setRecurringInterval] = useState("MONTHLY")
  const [trialEnabled, setTrialEnabled] = useState(false)
  const [trialDays, setTrialDays] = useState("7")
  const [trialPrice, setTrialPrice] = useState("")
  const [limitedBilling, setLimitedBilling] = useState(false)
  const [affiliateRecurring, setAffiliateRecurring] = useState(true)
  const [boletoInstallment, setBoletoInstallment] = useState(false)
  const [boletoMaxInstallments, setBoletoMaxInstallments] = useState("6")
  const [boletoInterest, setBoletoInterest] = useState(false)
  const [creditEnabled, setCreditEnabled] = useState(true)
  const [boletoEnabled, setBoletoEnabled] = useState(true)
  const [pixEnabled, setPixEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!productId || !planId) return
    apiFetch(`/products/${encodeURIComponent(productId)}/plans/${encodeURIComponent(planId)}`).then((res) => {
      if (res.error || !res.data) return
      const d = res.data as any
      if (d.maxInstallments != null) setMaxInstallments(String(d.maxInstallments))
      if (d.interestFreeInstallments != null) setMaxNoInterest(String(d.interestFreeInstallments))
      if (d.discountByPayment != null) setDiscountByPayment(d.discountByPayment)
      if (d.notifyBoleto != null) setNotifyBoleto(d.notifyBoleto)
      if (d.billingType != null) setBillingType(d.billingType)
      if (d.subscriptionPeriod != null) setRecurringInterval(d.subscriptionPeriod)
      if (d.trialEnabled != null) setTrialEnabled(d.trialEnabled)
      if (d.trialDays != null) setTrialDays(String(d.trialDays))
      if (d.trialPrice != null) setTrialPrice(String(d.trialPrice))
      if (d.limitedBilling != null) setLimitedBilling(d.limitedBilling)
      if (d.affiliateRecurring != null) setAffiliateRecurring(d.affiliateRecurring)
      if (d.boletoInstallment != null) setBoletoInstallment(d.boletoInstallment)
      if (d.boletoInstallments != null) setBoletoMaxInstallments(String(d.boletoInstallments))
      if (d.boletoInterest != null) setBoletoInterest(d.boletoInterest)
      if (d.paymentMethods) {
        if (d.paymentMethods.credit != null) setCreditEnabled(d.paymentMethods.credit)
        if (d.paymentMethods.boleto != null) setBoletoEnabled(d.paymentMethods.boleto)
        if (d.paymentMethods.pix != null) setPixEnabled(d.paymentMethods.pix)
      }
      if (d.boletoEnabled != null) setBoletoEnabled(d.boletoEnabled)
    })
  }, [productId, planId])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await apiFetch(`/products/${encodeURIComponent(productId)}/plans/${encodeURIComponent(planId)}`, {
        method: 'PUT',
        body: {
          maxInstallments: Number(maxInstallments),
          interestFreeInstallments: Number(maxNoInterest),
          billingType,
          subscriptionPeriod: recurringInterval,
          trialEnabled,
          trialDays: Number(trialDays),
          paymentMethods: { credit: creditEnabled, boleto: boletoEnabled, pix: pixEnabled },
          boletoEnabled,
          boletoInstallments: Number(boletoMaxInstallments),
        },
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      console.error('Save failed', e)
    } finally {
      setSaving(false)
    }
  }

  // Cosmos styling helpers
  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-center gap-3 py-1.5">
      <button type="button" onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
        style={{ backgroundColor: checked ? colors.accent.webb : colors.background.corona }}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
      <span className="text-sm" style={{ color: colors.text.starlight }}>{label}</span>
    </label>
  )

  const labelStyle: React.CSSProperties = { fontFamily: typography.fontFamily.display, fontSize: "11px", fontWeight: 600, color: colors.text.dust, letterSpacing: "0.08em", textTransform: "uppercase" as const }
  const cardStyle: React.CSSProperties = { background: colors.background.space, border: `1px solid ${colors.border.space}`, borderRadius: "12px" }
  const inputStyle: React.CSSProperties = { background: colors.background.nebula, border: `1px solid ${colors.border.space}`, color: colors.text.starlight, borderRadius: "8px" }
  const selectClass = "w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none"
  const sectionTitle = (t: string) => (
    <h3 className="mb-4 text-sm font-semibold uppercase" style={{ fontFamily: typography.fontFamily.display, color: colors.text.starlight, letterSpacing: "0.02em" }}>{t}</h3>
  )

  // Payment method card component
  const PaymentMethodCard = ({ enabled, onToggle, icon: Icon, title, desc, iconColor }: { enabled: boolean; onToggle: () => void; icon: typeof CreditCard; title: string; desc: string; iconColor?: string }) => (
    <button type="button" onClick={onToggle}
      className="relative flex items-center gap-4 rounded-xl p-5 text-left transition-all"
      style={{
        background: enabled ? `${colors.accent.webb}08` : colors.background.nebula,
        border: `2px solid ${enabled ? colors.accent.webb : colors.border.space}`,
        boxShadow: enabled ? shadows.glow.webb : "none",
      }}
    >
      {enabled && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: colors.accent.webb }}>
          <Check className="h-3 w-3 text-white" />
        </div>
      )}
      <Icon className="h-8 w-8 flex-shrink-0" style={{ color: enabled ? (iconColor || colors.accent.webb) : colors.text.dust }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: enabled ? colors.text.starlight : colors.text.moonlight }}>{title}</p>
        <p className="text-xs" style={{ color: colors.text.dust }}>{desc}</p>
      </div>
    </button>
  )

  return (
    <div className="space-y-8">
      {/* Payment Methods — selectable cards */}
      {sectionTitle("Formas de pagamento")}
      <div className="grid gap-4 md:grid-cols-3">
        <PaymentMethodCard enabled={creditEnabled} onToggle={() => setCreditEnabled(!creditEnabled)} icon={CreditCard} title="Cartão de crédito" desc="Parcelamento e pagamento à vista" iconColor="#4E7AE0" />
        <PaymentMethodCard enabled={boletoEnabled} onToggle={() => setBoletoEnabled(!boletoEnabled)} icon={FileText} title="Boleto bancário" desc="Compensação em 1-3 dias úteis" iconColor="#E0A84E" />
        <PaymentMethodCard enabled={pixEnabled} onToggle={() => setPixEnabled(!pixEnabled)} icon={QrCode} title="PIX" desc="Pagamento instantâneo, sem taxas" iconColor="#2DD4A0" />
      </div>

      {/* Billing Type */}
      {sectionTitle("Forma de cobrança")}
      <div className="rounded-xl p-5" style={cardStyle}>
        <select value={billingType} onChange={e => setBillingType(e.target.value)} className={`${selectClass} max-w-xs`} style={inputStyle}>
          <option value="ONE_TIME">Única</option>
          <option value="RECURRING">Recorrente</option>
          <option value="FREE">Grátis</option>
        </select>
        <p className="mt-2 text-xs flex items-center gap-1" style={{ color: colors.brand.amber }}>
          <AlertTriangle className="h-3 w-3" />Atenção! Não será possível alterar a forma de cobrança depois de publicar.
        </p>
      </div>

      {/* Installments — conditional: hidden when FREE */}
      {billingType !== "FREE" && (
        <>
          {sectionTitle("Parcelas")}
          <div className="rounded-xl p-5" style={cardStyle}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label style={labelStyle}>Máximo de parcelas no cartão *</label>
                <select value={maxInstallments} onChange={e => setMaxInstallments(e.target.value)} className={`${selectClass} mt-1.5`} style={inputStyle}>
                  {Array.from({length:12},(_, i)=>i+1).map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Máximo de parcelas sem juros *</label>
                <select value={maxNoInterest} onChange={e => setMaxNoInterest(e.target.value)} className={`${selectClass} mt-1.5`} style={inputStyle}>
                  {Array.from({length:12},(_, i)=>i+1).map(n => <option key={n} value={n}>{n}x</option>)}
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Discounts & Notices */}
      <div className="rounded-xl p-5" style={cardStyle}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Toggle checked={discountByPayment} onChange={setDiscountByPayment} label="Desconto por tipo de pagamento?" />
            {discountByPayment && (
              <p className="ml-14 text-xs flex items-center gap-1" style={{ color: colors.brand.amber }}>
                <AlertTriangle className="h-3 w-3" />Configure os descontos por tipo de pagamento no checkout.
              </p>
            )}
          </div>
          <Toggle checked={notifyBoleto} onChange={setNotifyBoleto} label="Avisar comprador sobre vencimento de boletos?" />
        </div>
      </div>

      {/* Recurring Config — shown when RECURRING */}
      {billingType === "RECURRING" && (
        <div className="space-y-6 rounded-xl p-5" style={{ ...cardStyle, border: `1px solid ${colors.accent.webb}30`, boxShadow: shadows.glow.webb }}>
          {sectionTitle("Configuração de assinatura")}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label style={labelStyle}>Período de assinatura</label>
              <select value={recurringInterval} onChange={e => setRecurringInterval(e.target.value)} className={`${selectClass} mt-1.5`} style={inputStyle}>
                <option value="WEEKLY">Semanal</option>
                <option value="BIWEEKLY">Quinzenal</option>
                <option value="MONTHLY">Mensal</option>
                <option value="QUARTERLY">Trimestral</option>
                <option value="SEMIANNUAL">Semestral</option>
                <option value="ANNUAL">Anual</option>
              </select>
            </div>
            <Toggle checked={affiliateRecurring} onChange={setAffiliateRecurring} label="Afiliado recebe comissão de cobranças recorrentes?" />
          </div>

          <Toggle checked={trialEnabled} onChange={setTrialEnabled} label="Período experimental na assinatura?" />
          {trialEnabled && (
            <div className="ml-14 grid gap-4 md:grid-cols-3">
              <div>
                <label style={labelStyle}>Dias de trial</label>
                <input type="number" value={trialDays} onChange={e => setTrialDays(e.target.value)} min={1} max={365} className={`${selectClass} mt-1.5`} style={inputStyle} />
              </div>
              <CurrencyInput value={trialPrice} onChange={setTrialPrice} label="Valor do período experimental" />
            </div>
          )}

          <Toggle checked={limitedBilling} onChange={setLimitedBilling} label="Cobrança limitada na assinatura?" />
        </div>
      )}

      {/* Boleto Section Toggle */}
      {boletoEnabled && (
        <>
          {sectionTitle("Boleto parcelado")}
          <div className="rounded-xl p-5" style={cardStyle}>
            <Toggle checked={boletoInstallment} onChange={setBoletoInstallment} label="Ativar boleto parcelado?" />
            {boletoInstallment && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label style={labelStyle}>Máximo de parcelas</label>
                  <select value={boletoMaxInstallments} onChange={e => setBoletoMaxInstallments(e.target.value)} className={`${selectClass} mt-1.5`} style={inputStyle}>
                    {[2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}x</option>)}
                  </select>
                </div>
                <Toggle checked={boletoInterest} onChange={setBoletoInterest} label="Juros no boleto parcelado?" />
              </div>
            )}
          </div>
        </>
      )}

      {/* Save Button */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: '#4E7AE0', boxShadow: '0 0 20px rgba(78,122,224,0.3)' }}
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {saved && <span className="text-sm font-medium" style={{ color: colors.state?.success || '#2DD4A0' }}>Salvo com sucesso!</span>}
      </div>
    </div>
  )
}
