"use client"
import { useState, useEffect } from "react"
import { Plus, Trash2, Loader2, X, Tag } from "lucide-react"
import { DataTable } from "@/components/kloel/FormExtras"
import { colors } from "@/lib/design-tokens"
import { apiFetch } from "@/lib/api"

interface Coupon { id: string; code: string; discountType: string; discountValue: number; maxUses: number | null; usedCount: number; expiresAt: string | null; active: boolean }

export function ProductCouponsTab({ productId }: { productId: string }) {
  const [items, setItems] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ code: "", discountType: "PERCENT", discountValue: "", maxUses: "", expiresAt: "" })
  const [creating, setCreating] = useState(false)

  const fetch_ = () => { apiFetch<any>(`/products/${productId}/coupons`).then(r => setItems(Array.isArray(r) ? r : [])).catch(() => setItems([])).finally(() => setLoading(false)) }
  useEffect(() => { fetch_() }, [productId])
  const handleCreate = async () => { setCreating(true); try { await apiFetch(`/products/${productId}/coupons`, { method: "POST", body: { code: form.code.toUpperCase(), discountType: form.discountType, discountValue: parseFloat(form.discountValue) || 0, maxUses: parseInt(form.maxUses) || null, expiresAt: form.expiresAt || null } }); setShowModal(false); fetch_() } catch {} finally { setCreating(false) } }
  const handleDelete = async (id: string) => { if (!confirm("Excluir cupom?")) return; await apiFetch(`/products/${productId}/coupons/${id}`, { method: "DELETE" }); fetch_() }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h3 className="text-base font-semibold text-gray-900">Cupons de desconto</h3><button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: colors.brand.primary }}><Plus className="h-4 w-4" /> Novo cupom</button></div>
      <DataTable columns={[
        { key: "code", label: "Código", width: "15%", render: v => <span className="font-mono text-sm font-bold text-gray-800">{v}</span> },
        { key: "discountType", label: "Tipo", width: "10%", render: v => <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-700">{v === "PERCENT" ? "%" : "R$"}</span> },
        { key: "discountValue", label: "Valor", width: "10%", render: (v, row) => <span className="text-sm font-bold text-green-700">{row.discountType === "PERCENT" ? `${v}%` : `R$ ${Number(v).toFixed(2)}`}</span> },
        { key: "maxUses", label: "Máx Usos", width: "10%", render: v => v ? String(v) : "∞" },
        { key: "usedCount", label: "Usados", width: "10%" },
        { key: "expiresAt", label: "Expira", width: "15%", render: v => v ? new Date(v).toLocaleDateString("pt-BR") : "Sem expiração" },
        { key: "active", label: "Status", width: "10%", render: v => v ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">ATIVO</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">INATIVO</span> },
        { key: "id", label: "Ações", width: "10%", render: (_, row) => <button onClick={() => handleDelete(row.id)} className="rounded-full bg-red-100 p-1.5 text-red-700"><Trash2 className="h-3.5 w-3.5" /></button> },
      ]} rows={items} emptyText="Nenhum cupom cadastrado" />
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold">Novo cupom</h3><button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-gray-400" /></button></div>
          <div className="space-y-4">
            <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Código *</label><input value={form.code} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})} placeholder="DESCONTO10" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-mono uppercase" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Tipo</label><select value={form.discountType} onChange={e => setForm({...form, discountType: e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"><option value="PERCENT">Percentual (%)</option><option value="FIXED">Valor fixo (R$)</option></select></div>
              <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Valor</label><input type="number" step="0.01" value={form.discountValue} onChange={e => setForm({...form, discountValue: e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Máx usos</label><input type="number" value={form.maxUses} onChange={e => setForm({...form, maxUses: e.target.value})} placeholder="Ilimitado" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm" /></div>
              <div><label className="mb-1 block text-xs font-semibold uppercase text-gray-600">Expira em</label><input type="date" value={form.expiresAt} onChange={e => setForm({...form, expiresAt: e.target.value})} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm" /></div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3"><button onClick={() => setShowModal(false)} className="rounded-lg border px-4 py-2 text-sm">Fechar</button><button onClick={handleCreate} disabled={creating || !form.code} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: colors.brand.primary }}>{creating ? "Criando..." : "Criar cupom"}</button></div>
        </div></div>
      )}
    </div>
  )
}
