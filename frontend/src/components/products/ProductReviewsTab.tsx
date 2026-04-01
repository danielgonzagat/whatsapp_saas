"use client"
import { useState, useEffect } from "react"
import { mutate } from "swr"
import { Star, Trash2, Loader2 } from "lucide-react"
import { colors } from "@/lib/design-tokens"
import { apiFetch } from "@/lib/api"

interface Review { id: string; rating: number; comment: string | null; authorName: string | null; verified: boolean; createdAt: string }

function Stars({ rating }: { rating: number }) {
  return <div className="flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4" style={{ color: i <= rating ? colors.ember.primary : colors.border.space, fill: i <= rating ? colors.ember.primary : 'none' }} />)}</div>
}

export function ProductReviewsTab({ productId }: { productId: string }) {
  const [items, setItems] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  const fetch_ = () => { apiFetch<any>(`/products/${productId}/reviews`).then(r => setItems(Array.isArray(r) ? r : [])).catch(() => setItems([])).finally(() => setLoading(false)) }
  useEffect(() => { fetch_() }, [productId])
  const handleDelete = async (id: string) => { if (!confirm("Excluir avaliacao?")) return; await apiFetch(`/products/${productId}/reviews/${id}`, { method: "DELETE" }); mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products')); fetch_() }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: colors.ember.primary }} /></div>

  const avgRating = items.length ? (items.reduce((s, r) => s + r.rating, 0) / items.length).toFixed(1) : "0"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold" style={{ color: colors.text.silver }}>Avaliacoes</h3>
          {items.length > 0 && <p className="mt-1 text-sm" style={{ color: colors.text.muted }}>{items.length} avaliacoes - Media {avgRating}/5</p>}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md py-16" style={{ border: `2px dashed ${colors.border.space}` }}>
          <Star className="mb-3 h-12 w-12" style={{ color: colors.border.space }} />
          <p className="text-sm" style={{ color: colors.text.muted }}>Nenhuma avaliacao recebida.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((review) => (
            <div key={review.id} className="flex items-start gap-4 rounded-md p-4" style={{ border: `1px solid ${colors.border.space}`, backgroundColor: colors.background.elevated }}>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Stars rating={review.rating} />
                  <span className="text-xs" style={{ color: colors.text.dim }}>{new Date(review.createdAt).toLocaleDateString("pt-BR")}</span>
                  {review.verified && <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'rgba(224,221,216,0.12)', color: colors.text.silver }}>Verificada</span>}
                </div>
                {review.authorName && <p className="mt-1 text-sm font-medium" style={{ color: colors.text.silver }}>{review.authorName}</p>}
                {review.comment && <p className="mt-1 text-sm" style={{ color: colors.text.muted }}>{review.comment}</p>}
              </div>
              <button onClick={() => handleDelete(review.id)} className="rounded-full p-1.5" style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
