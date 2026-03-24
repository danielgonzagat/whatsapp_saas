"use client"
import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, X, ShoppingCart } from "lucide-react"
import { DataTable } from "@/components/kloel/FormExtras"
import { colors } from "@/lib/design-tokens"
import { apiFetch } from "@/lib/api"

interface Checkout { id: string; name: string; code: string; config: any; uniqueVisits: number; totalVisits: number; abandonRate: number; cancelRate: number; conversionRate: number; active: boolean }

function MetricBadge({ value, thresholds }: { value: number; thresholds: [number, number] }) {
  const color = value < thresholds[0] ? "text-green-700 bg-green-100" : value < thresholds[1] ? "text-amber-700 bg-amber-100" : "text-red-700 bg-red-100"
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{value.toFixed(1)}%</span>
}

export function ProductCheckoutsTab({ productId }: { productId: string }) {
  const [items, setItems] = useState<Checkout[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: "", paymentMethods: ["PIX", "CARTAO"] })
  const [creating, setCreating] = useState(false)

  const fetch_ = () => { apiFetch<any>(`/products/${productId}/checkouts`).then(r => setItems(Array.isArray(r) ? r : [])).catch(() => setItems([])).finally(() => setLoading(false)) }
  useEffect(() => { fetch_() }, [productId])

  const handleCreate = async () => { setCreating(true); try { await apiFetch(`/products/${productId}/checkouts`, { method: "POST", body: { name: form.name, config: { paymentMethods: form.paymentMethods } } }); setShowModal(false); fetch_() } catch {} finally { setCreating(false) } }
  const handleDelete = async (id: string) => { if (!confirm("Excluir checkout?")) return; await apiFetch(`/products/${productId}/checkouts/${id}`, { method: "DELETE" }); fetch_() }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Checkouts disponíveis</h3>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: colors.brand.primary }}><Plus className="h-4 w-4" /> Novo checkout</button>
      </div>
      <DataTable columns={[
        { key: "code", label: "Código", width: "10%", render: v => <span className="font-mono text-xs text-gray-500">{String(v).slice(0,8)}</span> },
        { key: "name", label: "Descrição", width: "18%" },
        { key: "config", label: "Pagamento", width: "18%", render: v => <div className="flex flex-wrap gap-1">{(v?.paymentMethods || []).map((m: string) => <span key={m} className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 uppercase">{m}</span>)}</div> },
        { key: "uniqueVisits", label: "Únicas", width: "8%" },
        { key: "totalVisits", label: "Totais", width: "8%" },
        { key: "abandonRate", label: "Abandono", width: "10%", render: v => <MetricBadge value={Number(v)} thresholds={[30, 60]} /> },
        { key: "cancelRate", label: "Cancel.", width: "10%", render: v => <MetricBadge value={Number(v)} thresholds={[5, 15]} /> },
        { key: "conversionRate", label: "Conversão", width: "10%", render: v => { const n = Number(v); const c = n > 50 ? "text-green-700 bg-green-100" : n > 20 ? "text-amber-700 bg-amber-100" : "text-red-700 bg-red-100"; return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{n.toFixed(1)}%</span> } },
        { key: "id", label: "Ações", width: "8%", render: (_, row) => <div className="flex gap-1.5"><button className="rounded-full bg-teal-100 p-1.5 text-teal-700"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => handleDelete(row.id)} className="rounded-full bg-red-100 p-1.5 text-red-700"><Trash2 className="h-3.5 w-3.5" /></button></div> },
      ]} rows={items} emptyText="Nenhum checkout criado" />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold">Novo checkout</h3><button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
            <div className="space-y-4">
              <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Descrição *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none" /></div>
              <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Formas de pagamento</label><div className="flex flex-wrap gap-2">{["BOLETO","CARTAO","PIX","RECEBA_E_PAGUE"].map(m => <label key={m} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.paymentMethods.includes(m)} onChange={e => setForm({...form, paymentMethods: e.target.checked ? [...form.paymentMethods, m] : form.paymentMethods.filter(x => x !== m)})} className="accent-teal-600" />{m}</label>)}</div></div>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-sm">Fechar</button><button onClick={handleCreate} disabled={creating || !form.name} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: colors.brand.primary }}>{creating ? "Criando..." : "Criar checkout"}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
