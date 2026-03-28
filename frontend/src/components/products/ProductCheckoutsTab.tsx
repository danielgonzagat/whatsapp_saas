"use client"
import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, X, ShoppingCart } from "lucide-react"
import { DataTable } from "@/components/kloel/FormExtras"
import { colors } from "@/lib/design-tokens"
import { apiFetch } from "@/lib/api"

interface Checkout { id: string; name: string; code: string; config: any; uniqueVisits: number; totalVisits: number; abandonRate: number; cancelRate: number; conversionRate: number; active: boolean }

function MetricBadge({ value, thresholds }: { value: number; thresholds: [number, number] }) {
  const bg = value < thresholds[0] ? 'rgba(224,221,216,0.12)' : value < thresholds[1] ? 'rgba(110,110,115,0.15)' : 'rgba(232,93,48,0.12)'
  const fg = value < thresholds[0] ? colors.text.silver : value < thresholds[1] ? colors.text.muted : colors.ember.primary
  return <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: bg, color: fg }}>{value.toFixed(1)}%</span>
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

  const inputStyle: React.CSSProperties = { width: '100%', borderRadius: 6, border: `1px solid ${colors.border.space}`, backgroundColor: colors.background.elevated, padding: '10px 16px', fontSize: 14, color: colors.text.silver, outline: 'none', fontFamily: "'Sora', sans-serif" }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: colors.ember.primary }} /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold" style={{ color: colors.text.silver }}>Checkouts disponiveis</h3>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold" style={{ backgroundColor: colors.ember.primary, color: '#fff' }}><Plus className="h-4 w-4" /> Novo checkout</button>
      </div>
      <DataTable columns={[
        { key: "code", label: "Codigo", width: "10%", render: v => <span className="font-mono text-xs" style={{ color: colors.text.dim }}>{String(v).slice(0,8)}</span> },
        { key: "name", label: "Descricao", width: "18%" },
        { key: "config", label: "Pagamento", width: "18%", render: v => <div className="flex flex-wrap gap-1">{(v?.paymentMethods || []).map((m: string) => <span key={m} className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}>{m}</span>)}</div> },
        { key: "uniqueVisits", label: "Unicas", width: "8%" },
        { key: "totalVisits", label: "Totais", width: "8%" },
        { key: "abandonRate", label: "Abandono", width: "10%", render: v => <MetricBadge value={Number(v)} thresholds={[30, 60]} /> },
        { key: "cancelRate", label: "Cancel.", width: "10%", render: v => <MetricBadge value={Number(v)} thresholds={[5, 15]} /> },
        { key: "conversionRate", label: "Conversao", width: "10%", render: v => { const n = Number(v); return <MetricBadge value={n} thresholds={[20, 50]} /> } },
        { key: "id", label: "Acoes", width: "8%", render: (_, row) => <div className="flex gap-1.5"><button className="rounded-full p-1.5" style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => handleDelete(row.id)} className="rounded-full p-1.5" style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}><Trash2 className="h-3.5 w-3.5" /></button></div> },
      ]} rows={items} emptyText="Nenhum checkout criado" />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md rounded-md p-6" style={{ backgroundColor: colors.background.surface, border: `1px solid ${colors.border.space}` }}>
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold" style={{ color: colors.text.silver }}>Novo checkout</h3><button onClick={() => setShowModal(false)}><X className="h-5 w-5" style={{ color: colors.text.dim }} /></button></div>
            <div className="space-y-4">
              <div><label className="mb-1 block text-xs font-semibold uppercase" style={{ color: colors.text.muted }}>Descricao *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={inputStyle} /></div>
              <div><label className="mb-1 block text-xs font-semibold uppercase" style={{ color: colors.text.muted }}>Formas de pagamento</label><div className="flex flex-wrap gap-2">{["BOLETO","CARTAO","PIX","RECEBA_E_PAGUE"].map(m => <label key={m} className="flex items-center gap-1.5 text-sm" style={{ color: colors.text.muted }}><input type="checkbox" checked={form.paymentMethods.includes(m)} onChange={e => setForm({...form, paymentMethods: e.target.checked ? [...form.paymentMethods, m] : form.paymentMethods.filter(x => x !== m)})} style={{ accentColor: colors.ember.primary }} />{m}</label>)}</div></div>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setShowModal(false)} className="rounded-md px-4 py-2 text-sm" style={{ border: `1px solid ${colors.border.space}`, color: colors.text.muted, backgroundColor: 'transparent' }}>Fechar</button><button onClick={handleCreate} disabled={creating || !form.name} className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: colors.ember.primary, color: '#fff' }}>{creating ? "Criando..." : "Criar checkout"}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
