"use client"
import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, Loader2, X, Sparkles, MessageCircle, Info } from "lucide-react"
import { DataTable, CodeSnippet } from "@/components/kloel/FormExtras"
import { colors } from "@/lib/design-tokens"
import { apiFetch } from "@/lib/api"

interface ProductUrlItem { id: string; description: string; url: string; isPrivate: boolean; active: boolean; aiLearning: boolean; aiLearnStatus: string | null; chatEnabled: boolean; salesFromUrl: number }

const AI_LEARN_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-gray-100", text: "text-gray-600", label: "Aguardando" },
  learning: { bg: "bg-blue-100", text: "text-blue-700", label: "Aprendendo..." },
  learned: { bg: "bg-green-100", text: "text-green-700", label: "Aprendido ✓" },
  error: { bg: "bg-red-100", text: "text-red-700", label: "Erro" },
}

export function ProductUrlsTab({ productId }: { productId: string }) {
  const [items, setItems] = useState<ProductUrlItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ description: "", url: "", isPrivate: false, aiLearning: false, chatEnabled: false })
  const [creating, setCreating] = useState(false)

  const fetch_ = () => { apiFetch<any>(`/products/${productId}/urls`).then(r => setItems(Array.isArray(r) ? r : [])).catch(() => setItems([])).finally(() => setLoading(false)) }
  useEffect(() => { fetch_() }, [productId])

  const handleCreate = async () => { setCreating(true); try { await apiFetch(`/products/${productId}/urls`, { method: "POST", body: form }); setShowForm(false); setForm({ description: "", url: "", isPrivate: false, aiLearning: false, chatEnabled: false }); fetch_() } catch {} finally { setCreating(false) } }
  const handleDelete = async (id: string) => { if (!confirm("Excluir URL?")) return; await apiFetch(`/products/${productId}/urls/${id}`, { method: "DELETE" }); fetch_() }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>

  const widgetCode = `<script src="https://widget.kloel.com/chat.js"\n  data-product-id="${productId}"\n  data-position="bottom-right"\n  data-color="#0D9488"\n  data-delay="5000"\n  async>\n</script>`

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
        <Info className="mt-0.5 h-5 w-5 text-teal-600 flex-shrink-0" />
        <div>
          <p className="text-sm"><strong className="text-teal-800">Novidade!</strong> <span className="text-teal-700">Cadastre as URLs do seu produto e ative a IA do Kloel para aprender o conteúdo e atender visitantes direto na sua página de vendas!</span></p>
          <button className="mt-2 text-xs font-semibold text-teal-700 hover:underline">Saiba mais</button>
        </div>
      </div>

      {/* Add Form */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600">Adicionar URL</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="mb-1 block text-xs font-medium text-gray-600">Descrição *</label><input value={form.description} onChange={e => setForm({...form, description: e.target.value})} maxLength={255} placeholder="Página de vendas principal" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none" /><p className="mt-1 text-right text-xs text-gray-400">{form.description.length}/255</p></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-600">URL *</label><input value={form.url} onChange={e => setForm({...form, url: e.target.value})} maxLength={255} placeholder="https://..." className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none" /><p className="mt-1 text-right text-xs text-gray-400">{form.url.length}/255</p></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPrivate} onChange={e => setForm({...form, isPrivate: e.target.checked})} className="accent-teal-600" />URL privada</label>
          <label className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4 text-teal-600" /><input type="checkbox" checked={form.aiLearning} onChange={e => setForm({...form, aiLearning: e.target.checked})} className="accent-teal-600" />Kloel pode aprender com essa URL?</label>
          <label className="flex items-center gap-2 text-sm"><MessageCircle className="h-4 w-4 text-teal-600" /><input type="checkbox" checked={form.chatEnabled} onChange={e => setForm({...form, chatEnabled: e.target.checked})} className="accent-teal-600" />Integrar chat Kloel nessa URL?</label>
        </div>

        {form.chatEnabled && (
          <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/50 p-4">
            <p className="mb-3 text-xs font-medium text-teal-800">Código do widget para integrar no seu site:</p>
            <CodeSnippet code={widgetCode} />
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={handleCreate} disabled={creating || !form.description || !form.url} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: colors.brand.primary }}><Plus className="h-4 w-4" />{creating ? "Adicionando..." : "Adicionar"}</button>
        </div>
      </div>

      {/* Table */}
      <DataTable columns={[
        { key: "description", label: "Descrição", width: "18%" },
        { key: "url", label: "URL Destino", width: "22%", render: v => <a href={v} target="_blank" rel="noopener" className="text-teal-600 hover:underline text-xs truncate block max-w-[200px]">{v}</a> },
        { key: "isPrivate", label: "Privado", width: "8%", render: v => v ? <span className="text-xs font-medium text-gray-700">SIM</span> : <span className="text-xs text-gray-400">NÃO</span> },
        { key: "active", label: "Status", width: "8%", render: v => v ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">ATIVO</span> : <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">INATIVO</span> },
        { key: "salesFromUrl", label: "Vendas", width: "8%", render: v => <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">{v || 0}</span> },
        { key: "aiLearnStatus", label: "IA Aprende", width: "12%", render: (v, row) => { if (!row.aiLearning) return <span className="text-xs text-gray-400">OFF</span>; const b = AI_LEARN_BADGES[v || "pending"] || AI_LEARN_BADGES.pending; return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${b.bg} ${b.text}`}>{b.label}</span> } },
        { key: "chatEnabled", label: "Chat", width: "8%", render: v => v ? <span className="text-xs font-medium text-teal-600">ON</span> : <span className="text-xs text-gray-400">OFF</span> },
        { key: "id", label: "Ações", width: "10%", render: (_, row) => <div className="flex gap-1.5"><button className="rounded-full bg-teal-100 p-1.5 text-teal-700"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => handleDelete(row.id)} className="rounded-full bg-red-100 p-1.5 text-red-700"><Trash2 className="h-3.5 w-3.5" /></button></div> },
      ]} rows={items} emptyText="Nenhuma URL cadastrada" />
    </div>
  )
}
