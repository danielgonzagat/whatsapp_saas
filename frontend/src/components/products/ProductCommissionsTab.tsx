"use client"
import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react"
import { DataTable } from "@/components/kloel/FormExtras"
import { colors } from "@/lib/design-tokens"
import { apiFetch } from "@/lib/api"

interface Commission { id: string; role: string; percentage: number; agentName: string | null; agentEmail: string | null }

const ROLES = [
  { value: "COPRODUCER", label: "Coprodutor" },
  { value: "MANAGER", label: "Gerente" },
  { value: "AFFILIATE", label: "Afiliado" },
]

export function ProductCommissionsTab({ productId }: { productId: string }) {
  const [items, setItems] = useState<Commission[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ role: "AFFILIATE", percentage: "", agentName: "", agentEmail: "" })
  const [creating, setCreating] = useState(false)

  const fetch_ = () => { apiFetch<any>(`/products/${productId}/commissions`).then(r => setItems(Array.isArray(r) ? r : [])).catch(() => setItems([])).finally(() => setLoading(false)) }
  useEffect(() => { fetch_() }, [productId])
  const handleCreate = async () => { setCreating(true); try { await apiFetch(`/products/${productId}/commissions`, { method: "POST", body: { ...form, percentage: parseFloat(form.percentage) || 0 } }); setShowModal(false); fetch_() } catch {} finally { setCreating(false) } }
  const handleDelete = async (id: string) => { if (!confirm("Excluir comissão?")) return; await apiFetch(`/products/${productId}/commissions/${id}`, { method: "DELETE" }); fetch_() }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h3 className="text-base font-semibold text-gray-900">Comissionamento</h3><button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: colors.brand.primary }}><Plus className="h-4 w-4" /> Nova comissão</button></div>
      <DataTable columns={[
        { key: "role", label: "Papel", width: "20%", render: v => <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">{ROLES.find(r => r.value === v)?.label || v}</span> },
        { key: "percentage", label: "Comissão", width: "15%", render: v => <span className="text-sm font-bold text-green-700">{Number(v).toFixed(1)}%</span> },
        { key: "agentName", label: "Nome", width: "25%" },
        { key: "agentEmail", label: "E-mail", width: "25%" },
        { key: "id", label: "Ações", width: "15%", render: (_, row) => <div className="flex gap-1.5"><button className="rounded-full bg-teal-100 p-1.5 text-teal-700"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => handleDelete(row.id)} className="rounded-full bg-red-100 p-1.5 text-red-700"><Trash2 className="h-3.5 w-3.5" /></button></div> },
      ]} rows={items} emptyText="Nenhuma comissão cadastrada" />
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold">Nova comissão</h3><button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
          <div className="space-y-4">
            <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Papel</label><select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm">{ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Comissão (%)</label><input type="number" step="0.1" value={form.percentage} onChange={e => setForm({...form, percentage: e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm" /></div>
            <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Nome</label><input value={form.agentName} onChange={e => setForm({...form, agentName: e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm" /></div>
            <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">E-mail</label><input value={form.agentEmail} onChange={e => setForm({...form, agentEmail: e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm" /></div>
          </div>
          <div className="mt-6 flex justify-end gap-3"><button onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-sm">Fechar</button><button onClick={handleCreate} disabled={creating} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: colors.brand.primary }}>{creating ? "Criando..." : "Adicionar"}</button></div>
        </div></div>
      )}
    </div>
  )
}
