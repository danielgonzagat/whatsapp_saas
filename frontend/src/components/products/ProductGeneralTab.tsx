"use client"

import { useState, useEffect } from "react"
import { Save, Loader2 } from "lucide-react"
import { ImageUpload, ChipInput, CurrencyInput, RadioGroup } from "@/components/kloel/FormExtras"
import { colors } from "@/lib/design-tokens"
import { apiFetch } from "@/lib/api"

import { PRODUCT_CATEGORIES as CATEGORIES } from "@/lib/categories"

const SHIPPING_TYPES = [
  { value: "VARIABLE", label: "Variável/Grátis" },
  { value: "FIXED", label: "Fixo" },
  { value: "FREE", label: "Sem frete" },
]

interface ProductData {
  id: string
  name: string
  description: string
  price: number
  category: string
  tags: string[]
  format: string
  imageUrl: string
  active: boolean
  status: string
  salesPageUrl: string
  thankyouUrl: string
  thankyouBoletoUrl: string
  thankyouPixUrl: string
  reclameAquiUrl: string
  supportEmail: string
  warrantyDays: number | null
  isSample: boolean
  shippingType: string
  shippingValue: number | null
  originCep: string
}

export function ProductGeneralTab({ productId }: { productId: string }) {
  const [data, setData] = useState<ProductData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiFetch<any>(`/products/${productId}`)
      .then((res) => setData(res.data || (res as any)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [productId])

  const handleSave = async () => {
    if (!data) return
    setSaving(true)
    try {
      await apiFetch(`/products/${productId}`, { method: "PUT", body: data })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      alert("Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const update = (field: string, value: any) => {
    if (data) setData({ ...data, [field]: value })
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>
  if (!data) return <p className="py-8 text-center text-sm text-gray-500">Produto não encontrado.</p>

  const inputClass = "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600"

  return (
    <div className="space-y-8">
      {/* Info Box */}
      <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <span className="text-gray-500">Código: <strong className="text-gray-800">{data.id.slice(0, 8)}</strong></span>
        <span className="text-gray-300">|</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${data.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
          {data.status}
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">{data.format === "PHYSICAL" ? "Físico" : data.format === "DIGITAL" ? "Digital" : "Híbrido"}</span>
      </div>

      {/* 2-column layout */}
      <div className="grid gap-8 lg:grid-cols-5">
        {/* Left: Image */}
        <div className="lg:col-span-2">
          <ImageUpload
            value={data.imageUrl}
            onChange={(url) => update("imageUrl", url)}
            label="Foto do produto"
            hint="JPG, PNG ou WebP · 500x400px ideal · Máx 10MB"
          />
        </div>

        {/* Right: Fields */}
        <div className="space-y-5 lg:col-span-3">
          {/* Available toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => update("active", !data.active)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${data.active ? "bg-teal-600" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${data.active ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm font-medium text-gray-700">Disponível para venda</span>
          </div>

          <div>
            <label className={labelClass}>Nome *</label>
            <input value={data.name} onChange={(e) => update("name", e.target.value)} className={inputClass} maxLength={200} />
          </div>

          <div>
            <label className={labelClass}>Descrição</label>
            <textarea value={data.description || ""} onChange={(e) => update("description", e.target.value)} className={inputClass} rows={4} maxLength={5000} />
          </div>

          <div>
            <label className={labelClass}>Categoria</label>
            <select value={data.category || ""} onChange={(e) => update("category", e.target.value)} className={inputClass}>
              <option value="">Selecione</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <ChipInput value={data.tags || []} onChange={(v) => update("tags", v)} max={5} label="Tags (máx. 5)" />

          <RadioGroup
            value={data.format}
            onChange={(v) => update("format", v)}
            label="Formato"
            direction="horizontal"
            options={[
              { value: "PHYSICAL", label: "Físico" },
              { value: "DIGITAL", label: "Digital" },
              { value: "HYBRID", label: "Híbrido" },
            ]}
          />

          {(data.format === "PHYSICAL" || data.format === "HYBRID") && (
            <div>
              <label className={labelClass}>CEP de origem</label>
              <input value={data.originCep || ""} onChange={(e) => update("originCep", e.target.value)} placeholder="00000-000" className={inputClass} maxLength={9} />
            </div>
          )}
        </div>
      </div>

      {/* URLs */}
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">URLs</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { key: "salesPageUrl", label: "Página de vendas" },
            { key: "thankyouUrl", label: "Página de obrigado" },
            { key: "thankyouBoletoUrl", label: "Obrigado (boleto)" },
            { key: "thankyouPixUrl", label: "Obrigado (PIX)" },
            { key: "reclameAquiUrl", label: "Reclame Aqui" },
            { key: "supportEmail", label: "E-mail de suporte" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className={labelClass}>{label}</label>
              <input value={(data as any)[key] || ""} onChange={(e) => update(key, e.target.value)} className={inputClass} placeholder={key.includes("Email") ? "suporte@..." : "https://..."} />
            </div>
          ))}
        </div>
      </div>

      {/* Shipping */}
      {(data.format === "PHYSICAL" || data.format === "HYBRID") && (
        <div>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">Configuração de envio</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={labelClass}>Tempo de garantia (dias)</label>
              <input type="number" value={data.warrantyDays || ""} onChange={(e) => update("warrantyDays", parseInt(e.target.value) || null)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Tipo de frete</label>
              <select value={data.shippingType || ""} onChange={(e) => update("shippingType", e.target.value)} className={inputClass}>
                <option value="">Selecione</option>
                {SHIPPING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {data.shippingType === "FIXED" && (
              <CurrencyInput value={String(data.shippingValue || "")} onChange={(v) => update("shippingValue", parseFloat(v) || null)} label="Valor do frete" />
            )}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => update("isSample", !data.isSample)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${data.isSample ? "bg-teal-600" : "bg-gray-300"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${data.isSample ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm text-gray-700">É amostra grátis?</span>
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: colors.brand.primary }}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? "Salvo!" : saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  )
}
