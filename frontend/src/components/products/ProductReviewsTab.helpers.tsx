import { kloelFormatNumber, kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
import { Star, X } from 'lucide-react';

/** Review shape. */
export interface Review {
  /** Id property. */
  id: string;
  /** Rating property. */
  rating: number;
  /** Comment property. */
  comment: string | null;
  /** Author name property. */
  authorName: string | null;
  /** Verified property. */
  verified: boolean;
  /** Created at property. */
  createdAt: string;
}

/** Product_reviews_copy. */
export const PRODUCT_REVIEWS_COPY = {
  loadError: kloelT(`Falha ao carregar avaliações`),
  deleteError: kloelT(`Falha ao excluir avaliação`),
  closeErrorAria: kloelT(`Fechar erro`),
  deleteReviewAria: kloelT(`Excluir avaliação`),
  deleteTitle: kloelT(`Excluir avaliação`),
  deleteDescription: kloelT(`Tem certeza que deseja excluir esta avaliação?`),
  cancel: kloelT(`Cancelar`),
  confirmDelete: kloelT(`Excluir`),
  deleting: kloelT(`Excluindo...`),
} as const;

/** To review error message. */
export function toReviewErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Format average rating. */
export function formatAverageRating(items: Review[]): string {
  if (items.length === 0) {
    return '0';
  }

  return kloelFormatNumber(items.reduce((sum, review) => sum + review.rating, 0) / items.length, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Stars. */
export function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className="h-4 w-4"
          style={{
            color: star <= rating ? colors.ember.primary : colors.border.space,
            fill: star <= rating ? colors.ember.primary : 'none',
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/** Empty reviews state. */
export function EmptyReviewsState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-md py-16"
      style={{ border: `2px dashed ${colors.border.space}` }}
    >
      <Star className="mb-3 h-12 w-12" style={{ color: colors.border.space }} aria-hidden="true" />
      <p className="text-sm" style={{ color: colors.text.muted }}>
        {kloelT(`Nenhuma avaliação recebida.`)}
      </p>
    </div>
  );
}

/** Delete review modal. */
export function DeleteReviewModal({
  review,
  deleting,
  onCancel,
  onConfirm,
}: {
  review: Review;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'var(--cookie-overlay, rgba(0,0,0,0.6))' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-md p-6"
        style={{
          backgroundColor: colors.background.surface,
          border: `1px solid ${colors.border.space}`,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold" style={{ color: colors.text.silver }}>
            {PRODUCT_REVIEWS_COPY.deleteTitle}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label={PRODUCT_REVIEWS_COPY.closeErrorAria}
            className="rounded-full p-1"
            style={{ color: colors.text.dim }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-2">
          <p className="text-sm" style={{ color: colors.text.muted }}>
            {PRODUCT_REVIEWS_COPY.deleteDescription}
          </p>
          <p className="text-xs font-medium" style={{ color: colors.text.silver }}>
            {review.authorName || kloelT(`Autor anônimo`)}
          </p>
          {review.comment && (
            <p className="text-xs" style={{ color: colors.text.dim }}>
              {review.comment}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm"
            style={{
              border: `1px solid ${colors.border.space}`,
              color: colors.text.muted,
              backgroundColor: 'transparent',
            }}
          >
            {PRODUCT_REVIEWS_COPY.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{
              backgroundColor: colors.ember.primary,
              color: 'var(--app-text-on-accent)',
            }}
          >
            {deleting ? PRODUCT_REVIEWS_COPY.deleting : PRODUCT_REVIEWS_COPY.confirmDelete}
          </button>
        </div>
      </div>
    </div>
  );
}
