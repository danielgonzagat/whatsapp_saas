"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Upload, Loader2 } from "lucide-react"
import { colors } from "@/lib/design-tokens"
import { apiFetch } from "@/lib/api"
import { useWorkspaceId } from "@/hooks/useWorkspaceId"

// ============================================
// STEPS
// ============================================

const STEPS = [
  { id: 1, label: "Detalhes" },
  { id: 2, label: "Vendas" },
  { id: 3, label: "Comissões" },
  { id: 4, label: "IA" },
  { id: 5, label: "Revisão" },
]

// Categories imported from shared file
import { PRODUCT_CATEGORIES as CATEGORIES } from "@/lib/categories"
// const CATEGORIES_REMOVED = [
  "Saúde e Bem-estar",
  "Beleza e Cosméticos",
  "Suplementos",
  "Emagrecimento",
  "Fitness",
  "Educação e Cursos",
  "Marketing Digital",
  "Finanças",
  "Relacionamentos",
  "Desenvolvimento Pessoal",
  "Tecnologia",
  "Alimentação",
  "Moda",
  "Casa e Decoração",
  "Esportes",
  "Pet",
  "Infantil",
  "Outros",
]

// ============================================
// STEPPER COMPONENT
// ============================================

function Stepper({ currentStep, steps }: { currentStep: number; steps: typeof STEPS }) {
  return (
    <div className="mb-8">
      {/* Progress bar */}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(currentStep / steps.length) * 100}%`,
            backgroundColor: colors.brand.primary,
          }}
        />
      </div>
      {/* Step labels */}
      <div className="flex justify-between">
        {steps.map((step) => (
          <div key={step.id} className="flex flex-col items-center gap-1">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all"
              style={{
                backgroundColor:
                  step.id < currentStep
                    ? colors.brand.primary
                    : step.id === currentStep
                    ? colors.brand.primary
                    : "#E5E7EB",
                color: step.id <= currentStep ? "#fff" : "#9CA3AF",
              }}
            >
              {step.id < currentStep ? <Check className="h-4 w-4" /> : step.id}
            </div>
            <span
              className="text-[11px] font-medium"
              style={{
                color: step.id <= currentStep ? colors.brand.primary : "#9CA3AF",
              }}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
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

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [format, setFormat] = useState("PHYSICAL")
  const [price, setPrice] = useState("")
  const [salesPageUrl, setSalesPageUrl] = useState("")
  const [thankyouUrl, setThankyouUrl] = useState("")
  const [supportEmail, setSupportEmail] = useState("")
  const [warrantyDays, setWarrantyDays] = useState("")

  const handleTagAdd = () => {
    const t = tagInput.trim()
    if (t && tags.length < 5 && !tags.includes(t)) {
      setTags([...tags, t])
      setTagInput("")
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await apiFetch<{ data: { id: string } }>("/products", {
        method: "POST",
        body: {
          workspaceId,
          name,
          description,
          category,
          tags,
          format,
          price: parseFloat(price) || 0,
          salesPageUrl,
          thankyouUrl,
          supportEmail,
          warrantyDays: parseInt(warrantyDays) || null,
          status: "DRAFT",
        },
      })
      if (res.data?.id) {
        router.push(`/products/${res.data.id}`)
      } else {
        router.push("/products")
      }
    } catch {
      alert("Erro ao salvar produto")
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
  const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600"

  return (
    <div className="min-h-screen px-6 py-8" style={{ backgroundColor: colors.background.base }}>
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <p className="mb-1 text-sm text-gray-500">Home → Produtos → Cadastrar produto</p>
          <h1 className="text-2xl font-bold text-gray-900">Cadastrar produto</h1>
        </div>

        <Stepper currentStep={step} steps={STEPS} />

        {/* Step 1: Detalhes */}
        {step === 1 && (
          <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Detalhes do produto</h2>

            <div>
              <label className={labelClass}>Nome *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do produto"
                maxLength={200}
                className={inputClass}
              />
              <p className="mt-1 text-right text-xs text-gray-400">{name.length}/200</p>
            </div>

            <div>
              <label className={labelClass}>Descrição *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva seu produto..."
                maxLength={5000}
                rows={4}
                className={inputClass}
              />
              <p className="mt-1 text-right text-xs text-gray-400">{description.length}/5000</p>
            </div>

            <div>
              <label className={labelClass}>Categoria *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecione uma categoria</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Tags (máx. 5)</label>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleTagAdd())}
                  placeholder="Adicionar tag..."
                  className={inputClass}
                />
              </div>
              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
                      style={{ backgroundColor: `${colors.brand.primary}15`, color: colors.brand.primary }}
                    >
                      {tag}
                      <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="ml-1 text-xs">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Formato do produto *</label>
              <div className="flex gap-3">
                {[
                  { value: "PHYSICAL", label: "Físico" },
                  { value: "DIGITAL", label: "Digital" },
                  { value: "HYBRID", label: "Híbrido" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFormat(opt.value)}
                    className="flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-all"
                    style={{
                      borderColor: format === opt.value ? colors.brand.primary : "#D1D5DB",
                      backgroundColor: format === opt.value ? `${colors.brand.primary}08` : "#fff",
                      color: format === opt.value ? colors.brand.primary : "#6B7280",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>Foto do produto</label>
              <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 py-10 transition-colors hover:border-teal-400">
                <div className="text-center">
                  <Upload className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                  <p className="text-sm text-gray-500">Arraste ou clique para enviar</p>
                  <p className="mt-1 text-xs text-gray-400">JPG, PNG ou WebP · Máx 10MB</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Vendas */}
        {step === 2 && (
          <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Configuração de vendas</h2>

            <div>
              <label className={labelClass}>Preço (R$) *</label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0,00"
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Tempo de garantia (dias)</label>
              <input
                value={warrantyDays}
                onChange={(e) => setWarrantyDays(e.target.value)}
                placeholder="30"
                type="number"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>URL da página de vendas</label>
              <input
                value={salesPageUrl}
                onChange={(e) => setSalesPageUrl(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>URL da página de obrigado</label>
              <input
                value={thankyouUrl}
                onChange={(e) => setThankyouUrl(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>E-mail de suporte</label>
              <input
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="suporte@exemplo.com"
                type="email"
                className={inputClass}
              />
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-800">
                Você poderá cadastrar planos de venda detalhados após salvar o produto.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Comissões */}
        {step === 3 && (
          <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Comissionamento</h2>
            <p className="text-sm text-gray-500">
              Configure comissões para coprodutores, gerentes e afiliados após salvar o produto.
              Você poderá definir percentuais personalizados para cada papel.
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm text-gray-500">Disponível após o cadastro do produto.</p>
            </div>
          </div>
        )}

        {/* Step 4: IA */}
        {step === 4 && (
          <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
            <div
              className="rounded-xl p-5"
              style={{ background: `linear-gradient(135deg, ${colors.brand.primary}08, ${colors.brand.accent}08)` }}
            >
              <h2 className="mb-2 text-lg font-semibold text-gray-900">
                Configure a inteligência do Kloel
              </h2>
              <p className="text-sm text-gray-600">
                Após salvar o produto, você poderá configurar em detalhes como a IA do Kloel vende
                este produto: perfil do cliente ideal, objeções, argumentos de venda, upsell/downsell,
                tom de voz e muito mais.
              </p>
            </div>
          </div>
        )}

        {/* Step 5: Revisão */}
        {step === 5 && (
          <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Revisão do produto</h2>

            <div className="space-y-3">
              <div className="flex justify-between border-b border-gray-100 py-2">
                <span className="text-sm text-gray-500">Nome</span>
                <span className="text-sm font-medium text-gray-900">{name || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-2">
                <span className="text-sm text-gray-500">Categoria</span>
                <span className="text-sm font-medium text-gray-900">{category || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-2">
                <span className="text-sm text-gray-500">Formato</span>
                <span className="text-sm font-medium text-gray-900">
                  {format === "PHYSICAL" ? "Físico" : format === "DIGITAL" ? "Digital" : "Híbrido"}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-2">
                <span className="text-sm text-gray-500">Preço</span>
                <span className="text-sm font-bold" style={{ color: colors.brand.primary }}>
                  R$ {parseFloat(price || "0").toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-100 py-2">
                <span className="text-sm text-gray-500">Tags</span>
                <span className="text-sm text-gray-900">{tags.join(", ") || "—"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => (step === 1 ? router.push("/products") : setStep(step - 1))}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 1 ? "Voltar" : "Anterior"}
          </button>

          {step < 5 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: colors.brand.amber }}
            >
              Continuar
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || !name}
              className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: colors.brand.primary }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Salvando..." : "Publicar Produto"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
