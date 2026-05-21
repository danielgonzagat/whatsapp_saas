'use client';
import { colors } from '@/lib/design-tokens';
import { PRODUCT_URLS_COPY } from './ProductUrlsTab.constants';
import type { ProductUrlItem } from './ProductUrlForm';

export function ProductUrlDeleteModal({
  urlPendingDelete,
  deletingId,
  onConfirm,
  onCancel,
}: {
  urlPendingDelete: ProductUrlItem | null;
  deletingId: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!urlPendingDelete) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'var(--cookie-overlay, rgba(0,0,0,0.6))' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg p-6"
        style={{
          backgroundColor: colors.background.surface,
          border: `1px solid ${colors.border.space}`,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-2">
          <h3 className="text-lg font-semibold" style={{ color: colors.text.starlight }}>
            {PRODUCT_URLS_COPY.deleteTitle}
          </h3>
          <p className="text-sm" style={{ color: colors.text.moonlight }}>
            {PRODUCT_URLS_COPY.deleteDescription}
          </p>
          <p className="font-mono text-xs" style={{ color: colors.text.dust }}>
            {urlPendingDelete.url}
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm"
            style={{
              border: `1px solid ${colors.border.space}`,
              color: colors.text.moonlight,
              backgroundColor: 'transparent',
            }}
          >
            {PRODUCT_URLS_COPY.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deletingId === urlPendingDelete.id}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: colors.state.error }}
          >
            {deletingId === urlPendingDelete.id
              ? PRODUCT_URLS_COPY.deleting
              : PRODUCT_URLS_COPY.confirmDelete}
          </button>
        </div>
      </div>
    </div>
  );
}
