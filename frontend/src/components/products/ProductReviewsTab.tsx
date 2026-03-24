"use client"
import { useState, useEffect } from "react"
import { Star, Trash2, Loader2 } from "lucide-react"
import { colors } from "@/lib/design-tokens"
import { apiFetch } from "@/lib/api"

interface Review { id: string; rating: number; comment: string | null; authorName: string | null; verified: boolean; createdAt: string }

function Stars({ rating }: { rating: number }) {
  return <div className="flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} className={`h-4 w-4 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />)}</div>
}

export function ProductReviewsTab({ productId }: { productId: string }) {
  const [items, setItems] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  const fetch_ = () => { apiFetch<Review[]>(`/products/${productId}/reviews`).then(r => setItems(Array.isArray(r) ? r : [])).catch(() => setItems([])).finally(() => setLoading(false)) }
  useEffect(() => { fetch_() }, [productId])
  const handleDelete = async (id: string) => { if (!confirm("Excluir avaliação?")) return; await apiFetch(`/products/${productId}/reviews/${id}`, { method: "DELETE" }); fetch_() }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>

  const avgRating = items.length ? (items.reduce((s, r) => s + r.rating, 0) / items.length).toFixed(1) : "0"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Avaliações</h3>
          {items.length > 0 && <p className="mt-1 text-sm text-gray-500">{items.length} avaliações · Média {avgRating}/5</p>}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
          <Star className="mb-3 h-12 w-12 text-gray-300" />
          <p className="text-sm text-gray-500">Nenhuma avaliação recebida.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((review) => (
            <div key={review.id} className="flex items-start gap-4 rounded-lg border border-gray-200 p-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Stars rating={review.rating} />
                  <span className="text-xs text-gray-500">{new Date(review.createdAt).toLocaleDateString("pt-BR")}</span>
                  {review.verified && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Verificada</span>}
                </div>
                {review.authorName && <p className="mt-1 text-sm font-medium text-gray-800">{review.authorName}</p>}
                {review.comment && <p className="mt-1 text-sm text-gray-600">{review.comment}</p>}
              </div>
              <button onClick={() => handleDelete(review.id)} className="rounded-full bg-red-50 p-1.5 text-red-400 hover:bg-red-100 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
