"use client"
import { useState } from "react"
import { CreditCard, FileText, AlertTriangle } from "lucide-react"
import { CurrencyInput } from "@/components/kloel/FormExtras"

export function PlanPaymentTab({ planId }: { planId: string }) {
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

  const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-center gap-3 py-1.5"><button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-teal-600" : "bg-gray-300"}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} /></button><span className="text-sm text-gray-700">{label}</span></label>
  )
  const selectClass = "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600"

  return (
    <div className="space-y-8">
      {/* Installments */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">Parcelas</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className={labelClass}>Máximo de parcelas no cartão *</label><select value={maxInstallments} onChange={e => setMaxInstallments(e.target.value)} className={selectClass}>{Array.from({length:12},(_, i)=>i+1).map(n=><option key={n} value={n}>{n}x</option>)}</select></div>
          <div><label className={labelClass}>Máximo de parcelas sem juros *</label><select value={maxNoInterest} onChange={e => setMaxNoInterest(e.target.value)} className={selectClass}>{Array.from({length:12},(_, i)=>i+1).map(n=><option key={n} value={n}>{n}x</option>)}</select></div>
        </div>
      </div>

      {/* Discounts & Notices */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Toggle checked={discountByPayment} onChange={setDiscountByPayment} label="Desconto por tipo de pagamento?" />
          {discountByPayment && <p className="ml-14 text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Configure os descontos por tipo de pagamento no checkout.</p>}
        </div>
        <Toggle checked={notifyBoleto} onChange={setNotifyBoleto} label="Avisar comprador sobre vencimento de boletos?" />
      </div>

      {/* Billing Type */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">Forma de cobrança</h3>
        <select value={billingType} onChange={e => setBillingType(e.target.value)} className={`${selectClass} max-w-xs`}>
          <option value="ONE_TIME">Única</option>
          <option value="RECURRING">Recorrente</option>
          <option value="FREE">Grátis</option>
        </select>
        <p className="mt-2 text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Atenção! Não será possível alterar a forma de cobrança depois de publicar.</p>
      </div>

      {/* Recurring Config */}
      {billingType === "RECURRING" && (
        <div className="space-y-6 rounded-xl border border-teal-200 bg-teal-50/30 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className={labelClass}>Período de assinatura</label><select value={recurringInterval} onChange={e => setRecurringInterval(e.target.value)} className={selectClass}><option value="WEEKLY">Semanal</option><option value="BIWEEKLY">Quinzenal</option><option value="MONTHLY">Mensal</option><option value="QUARTERLY">Trimestral</option><option value="SEMIANNUAL">Semestral</option><option value="ANNUAL">Anual</option></select></div>
            <Toggle checked={affiliateRecurring} onChange={setAffiliateRecurring} label="Afiliado recebe comissão de cobranças recorrentes?" />
          </div>

          <Toggle checked={trialEnabled} onChange={setTrialEnabled} label="Período experimental na assinatura?" />
          {trialEnabled && (
            <div className="ml-14 grid gap-4 md:grid-cols-3">
              <div><label className={labelClass}>Dias de trial</label><input type="number" value={trialDays} onChange={e => setTrialDays(e.target.value)} min={1} max={365} className={selectClass} /></div>
              <CurrencyInput value={trialPrice} onChange={setTrialPrice} label="Valor do período experimental" />
            </div>
          )}

          <Toggle checked={limitedBilling} onChange={setLimitedBilling} label="Cobrança limitada na assinatura?" />

          {/* Payment Method Cards */}
          <div>
            <label className={labelClass}>Habilitar forma de pagamento</label>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <button type="button" onClick={() => setCreditEnabled(!creditEnabled)} className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${creditEnabled ? "border-teal-500 bg-teal-50" : "border-gray-200"}`}>
                <CreditCard className={`h-8 w-8 ${creditEnabled ? "text-teal-600" : "text-gray-400"}`} />
                <div><p className="text-sm font-semibold text-gray-800">Cartão de crédito</p><p className="text-xs text-gray-500">Parcelamento e pagamento à vista</p></div>
              </button>
              <button type="button" onClick={() => setBoletoEnabled(!boletoEnabled)} className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${boletoEnabled ? "border-teal-500 bg-teal-50" : "border-gray-200"}`}>
                <FileText className={`h-8 w-8 ${boletoEnabled ? "text-teal-600" : "text-gray-400"}`} />
                <div><p className="text-sm font-semibold text-gray-800">Boleto bancário</p><p className="text-xs text-gray-500">Compensação em 1-3 dias úteis</p></div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Boleto Parcelado */}
      <div>
        <Toggle checked={boletoInstallment} onChange={setBoletoInstallment} label="Ativar boleto parcelado?" />
        {boletoInstallment && (
          <div className="ml-14 mt-2 grid gap-4 md:grid-cols-2">
            <div><label className={labelClass}>Máximo de parcelas</label><select value={boletoMaxInstallments} onChange={e => setBoletoMaxInstallments(e.target.value)} className={selectClass}>{[2,3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n}x</option>)}</select></div>
            <Toggle checked={boletoInterest} onChange={setBoletoInterest} label="Juros no boleto parcelado?" />
          </div>
        )}
      </div>
    </div>
  )
}
