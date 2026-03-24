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
    apiFetch<Plan[]>(`/api/products/${productId}/plans`)
      .then((res) => setPlans(Array.isArray(res) ? res : []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPlans() }, [productId])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await apiFetch(`/api/products/${productId}/plans`, {
        method: "POST",
        body: { ...newPlan, price: parseFloat(newPlan.price) || 0 },
      })
      setShowModal(false)
      setNewPlan({ name: "", price: "", billingType: "ONE_TIME", itemsPerPlan: 1 })
      fetchPlans()
    } catch { alert("Erro ao criar plano") }
    finally { setCreating(false) }
  }

  const inputClass = "w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Planos cadastrados</h3>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: colors.brand.primary }}>
          <Plus className="h-4 w-4" /> Novo plano
        </button>
      </div>

      <DataTable
        columns={[
          { key: "id", label: "Código", width: "12%", render: (v) => <span className="font-mono text-xs text-gray-500">{String(v).slice(0, 8)}</span> },
          { key: "name", label: "Nome", width: "20%" },
          { key: "itemsPerPlan", label: "Itens", width: "8%" },
          { key: "price", label: "Valor", width: "12%", render: (v) => <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">R$ {Number(v).toFixed(2).replace(".", ",")}</span> },
          { key: "visibleToAffiliates", label: "Afiliados", width: "12%", render: (v) => v ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">VISÍVEL</span> : <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">OCULTO</span> },
          { key: "active", label: "Status", width: "10%", render: (v) => v ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">ATIVO</span> : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">INATIVO</span> },
          { key: "salesCount", label: "Vendas", width: "10%", render: (v) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${Number(v) > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{v}</span> },
          { key: "id", label: "Ações", width: "16%", render: (_, row) => (
            <div className="flex gap-1.5">
              <button onClick={() => router.push(`/products/${productId}/plans/${row.id}`)} className="rounded-full bg-teal-100 p-1.5 text-teal-700 hover:bg-teal-200"><Pencil className="h-3.5 w-3.5" /></button>
              <button className="rounded-full bg-blue-100 p-1.5 text-blue-700 hover:bg-blue-200"><Eye className="h-3.5 w-3.5" /></button>
              <button className="rounded-full bg-green-100 p-1.5 text-green-700 hover:bg-green-200"><Link2 className="h-3.5 w-3.5" /></button>
            </div>
          )},
        ]}
        rows={plans}
        emptyText="Nenhum plano cadastrado"
      />

      {/* Modal Novo Plano */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Novo plano</h3>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Nome *</label>
                <input value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Valor (R$) *</label>
                <input type="number" step="0.01" value={newPlan.price} onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Forma de cobrança</label>
                <select value={newPlan.billingType} onChange={(e) => setNewPlan({ ...newPlan, billingType: e.target.value })} className={inputClass}>
                  <option value="ONE_TIME">Única</option>
                  <option value="RECURRING">Recorrente</option>
                  <option value="FREE">Grátis</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Itens por plano</label>
                <input type="number" min={1} value={newPlan.itemsPerPlan} onChange={(e) => setNewPlan({ ...newPlan, itemsPerPlan: parseInt(e.target.value) || 1 })} className={inputClass} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">Fechar</button>
              <button onClick={handleCreate} disabled={creating || !newPlan.name} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: colors.brand.primary }}>
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
