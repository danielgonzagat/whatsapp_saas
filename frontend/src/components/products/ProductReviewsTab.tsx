'use client';
import { kloelT } from '@/lib/i18n/t';
import { apiFetch } from '@/lib/api';
import { colors } from '@/lib/design-tokens';
import {
  DeleteReviewModal,
  EmptyReviewsState,
  formatAverageRating,
  PRODUCT_REVIEWS_COPY,
  Review,
  Stars,
  toReviewErrorMessage,
} from '@/components/products/ProductReviewsTab.helpers';
import { Loader2, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { mutate } from 'swr';

/** Product reviews tab. */
export function ProductReviewsTab({ productId }: { productId: string }) {
  const [items, setItems] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewPendingDelete, setReviewPendingDelete] = useState<Review | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch<Review[] | { data?: Review[] }>(
        `/products/${productId}/reviews`,
      );
      setItems(Array.isArray(response) ? response : []);
      setError(null);
    } catch (caughtError: unknown) {
      setItems([]);
      setError(toReviewErrorMessage(caughtError, PRODUCT_REVIEWS_COPY.loadError));
    } finally {
      setLoading(false);
    }
  }, [productId]);
  useEffect(() => {
    void fetch_();
  }, [fetch_]);
  const handleDelete = async () => {
    if (!reviewPendingDelete) {
      return;
    }
    setDeletingId(reviewPendingDelete.id);
    setError(null);
    try {
      await apiFetch(`/products/${productId}/reviews/${reviewPendingDelete.id}`, {
        method: 'DELETE',
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      setReviewPendingDelete(null);
      await fetch_();
    } catch (caughtError: unknown) {
      setError(toReviewErrorMessage(caughtError, PRODUCT_REVIEWS_COPY.deleteError));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2
          className="h-6 w-6 animate-spin"
          style={{ color: colors.ember.primary }}
          aria-hidden="true"
        />
      </div>
    );
  }

  const avgRating = formatAverageRating(items);

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="flex items-center justify-between rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: colors.state.error,
            backgroundColor: colors.background.elevated,
            color: colors.state.error,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label={PRODUCT_REVIEWS_COPY.closeErrorAria}
            className="rounded-full p-1"
            style={{ color: colors.state.error }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold" style={{ color: colors.text.silver }}>
            {kloelT(`Avaliacoes`)}
          </h3>
          {items.length > 0 && (
            <p className="mt-1 text-sm" style={{ color: colors.text.muted }}>
              {items.length} {kloelT(`avaliacoes - Media`)} {avgRating}/5
            </p>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyReviewsState />
      ) : (
        <div className="space-y-3">
          {items.map((review) => (
            <div
              key={review.id}
              className="flex items-start gap-4 rounded-md p-4"
              style={{
                border: `1px solid ${colors.border.space}`,
                backgroundColor: colors.background.elevated,
              }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Stars rating={review.rating} />
                  <span className="text-xs" style={{ color: colors.text.dim }}>
                    {new Date(review.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                  {review.verified && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: 'rgba(224,221,216,0.12)',
                        color: colors.text.silver,
                      }}
                    >
                      {kloelT(`Verificada`)}
                    </span>
                  )}
                </div>
                {review.authorName && (
                  <p className="mt-1 text-sm font-medium" style={{ color: colors.text.silver }}>
                    {review.authorName}
                  </p>
                )}
                {review.comment && (
                  <p className="mt-1 text-sm" style={{ color: colors.text.muted }}>
                    {review.comment}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setReviewPendingDelete(review)}
                aria-label={PRODUCT_REVIEWS_COPY.deleteReviewAria}
                className="rounded-full p-1.5"
                style={{ backgroundColor: 'rgba(232,93,48,0.12)', color: colors.ember.primary }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {reviewPendingDelete && (
        <DeleteReviewModal
          review={reviewPendingDelete}
          deleting={deletingId === reviewPendingDelete.id}
          onCancel={() => setReviewPendingDelete(null)}
          onConfirm={() => {
            void handleDelete();
          }}
        />
      )}
    </div>
  );
}
