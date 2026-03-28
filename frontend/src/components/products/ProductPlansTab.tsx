"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Eye, Link2, Loader2, X } from "lucide-react"
import { DataTable } from "@/components/kloel/FormExtras"
import { colors } from "@/lib/design-tokens"
import { apiFetch } from "@/lib/api"

interface Plan {
  id: string
  name: string
  price: number
  billingType: string
  itemsPerPlan: number
  visibleToAffiliates: boolean
  active: boolean
  salesCount: number
}

export function ProductPlansTab({ productId }: { productId: string }) {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newPlan, setNewPlan] = useState({ name: "", price: "", billingType: "ONE_TIME", itemsPerPlan: 1 })
  const [creating, setCreating] = useState(false)

  const fetchPlans = () => {
    apiFetch<any>(`/products/${productId}/plans`)
      .then((res) => setPlans(Array.isArray(res) ? res : []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPlans() }, [productId])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await apiFetch(`/products/${productId}/plans`, {
        method: "POST",
        body: { ...newPlan, price: parseFloat(newPlan.price) || 0 },
      })
      setShowModal(false)
      setNewPlan({ name: "", price: "", billingType: "ONE_TIME", itemsPerPlan: 1 })
      fetchPlans()
    } catch { alert("Erro ao criar plano") }
    finally { setCreating(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', borderRadius: 6, border: `1px solid ${colors.border.space}`, backgroundColor: colors.background.elevated, padding: '10px 16px', fontSize: 14, color: colors.text.silver, outline: 'none', fontFamily: "'Sora', sans-serif" }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: colors.ember.primary }} /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold" style={{ color: colors.text.silver }}>Planos cadastrados</h3>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold" style={{ backgroundColor: colors.ember.primary, color: '#fff' }}>
          <Plus className="h-4 w-4" /> Novo plano
        </button>
      </div>

      <DataTable
        columns={[
          { key: "id", label: "Codigo", width: "12%", render: (v) => <span className="font-mono text-xs" style={{ color: colors.text.dim }}>{String(v).slice(0, 8)}</span> },
          { key: "name", label: "Nome", width: "20%" },
          { key: "itemsPerPlan", label: "Itens", width: "8%" },
          { key: "price", label: "Valor", width: "12%", render: (v) => <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}>R$ {Number(v).toFixed(2).replace(".", ",")}</span> },
          { key: "visibleToAffiliates", label: "Afiliados", width: "12%", render: (v) => v ? <span className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}>VISIVEL</span> : <span className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: colors.background.elevated, color: colors.text.muted }}>OCULTO</span> },
          { key: "active", label: "Status", width: "10%", render: (v) => v ? <span className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}>ATIVO</span> : <span className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}>INATIVO</span> },
          { key: "salesCount", label: "Vendas", width: "10%", render: (v) => <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: Number(v) > 0 ? 'rgba(224,221,216,0.12)' : colors.background.elevated, color: Number(v) > 0 ? colors.text.silver : colors.text.dim }}>{v}</span> },
          { key: "id", label: "Acoes", width: "16%", render: (_, row) => (
            <div className="flex gap-1.5">
              <button onClick={() => router.push(`/products/${productId}/plans/${row.id}`)} className="rounded-full p-1.5" style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}><Pencil className="h-3.5 w-3.5" /></button>
              <button className="rounded-full p-1.5" style={{ backgroundColor: colors.background.elevated, color: colors.text.muted }}><Eye className="h-3.5 w-3.5" /></button>
              <button className="rounded-full p-1.5" style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}><Link2 className="h-3.5 w-3.5" /></button>
            </div>
          )},
        ]}
        rows={plans}
        emptyText="Nenhum plano cadastrado"
      />

      {/* Modal Novo Plano */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-md p-6" style={{ backgroundColor: colors.background.surface, border: `1px solid ${colors.border.space}` }}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold" style={{ color: colors.text.silver }}>Novo plano</h3>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5" style={{ color: colors.text.dim }} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase" style={{ color: colors.text.muted }}>Nome *</label>
                <input value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase" style={{ color: colors.text.muted }}>Valor (R$) *</label>
                <input type="number" step="0.01" value={newPlan.price} onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase" style={{ color: colors.text.muted }}>Forma de cobranca</label>
                <select value={newPlan.billingType} onChange={(e) => setNewPlan({ ...newPlan, billingType: e.target.value })} style={inputStyle}>
                  <option value="ONE_TIME">Unica</option>
                  <option value="RECURRING">Recorrente</option>
                  <option value="FREE">Gratis</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase" style={{ color: colors.text.muted }}>Itens por plano</label>
                <input type="number" min={1} value={newPlan.itemsPerPlan} onChange={(e) => setNewPlan({ ...newPlan, itemsPerPlan: parseInt(e.target.value) || 1 })} style={inputStyle} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="rounded-md px-4 py-2 text-sm font-medium" style={{ border: `1px solid ${colors.border.space}`, color: colors.text.muted, backgroundColor: 'transparent' }}>Fechar</button>
              <button onClick={handleCreate} disabled={creating || !newPlan.name} className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: colors.ember.primary, color: '#fff' }}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Adicionar plano
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
