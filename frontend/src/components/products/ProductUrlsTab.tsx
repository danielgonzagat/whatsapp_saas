'use client';
import { colors } from '@/lib/design-tokens';
import { apiFetch } from '@/lib/api';
import { LoaderCircle, X } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { mutate } from 'swr';
import {
  PRODUCT_URLS_COPY,
  toProductUrlErrorMessage,
} from './ProductUrlsTab.constants';
import { ProductUrlForm } from './ProductUrlForm';
import type { ProductUrlItem, ProductUrlFormData } from './ProductUrlForm';
import { ProductUrlList } from './ProductUrlList';
import { ProductUrlDeleteModal } from './ProductUrlDeleteModal';

type ProductUrlListEnvelope = {
  data?: unknown;
  urls?: unknown;
};

function normalizeProductUrlList(response: unknown): ProductUrlItem[] {
  const envelope =
    response && typeof response === 'object' ? (response as ProductUrlListEnvelope) : null;
  const list = Array.isArray(response)
    ? response
    : Array.isArray(envelope?.data)
      ? envelope.data
      : Array.isArray(envelope?.urls)
        ? envelope.urls
        : null;

  if (!list) {
    throw new Error('Payload de URLs invalido.');
  }

  return list as ProductUrlItem[];
}

export function ProductUrlsTab({ productId }: { productId: string }) {
  const fid = useId();
  const [items, setItems] = useState<ProductUrlItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [urlPendingDelete, setUrlPendingDelete] = useState<ProductUrlItem | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch<unknown>(`/products/${productId}/urls`);
      setItems(normalizeProductUrlList(response));
      setError(null);
    } catch (caughtError: unknown) {
      setError(toProductUrlErrorMessage(caughtError, PRODUCT_URLS_COPY.loadError));
    } finally {
      setLoading(false);
    }
  }, [productId]);
  useEffect(() => {
    queueMicrotask(fetch_);
  }, [fetch_]);

  const handleCreate = async (data: ProductUrlFormData) => {
    setCreating(true);
    setError(null);
    try {
      await apiFetch(`/products/${productId}/urls`, {
        method: 'POST',
        body: data,
      });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/products'));
      await fetch_();
    } catch (caughtError: unknown) {
      setError(toProductUrlErrorMessage(caughtError, PRODUCT_URLS_COPY.createError));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!urlPendingDelete) {
      return;
    }
    setDeletingId(urlPendingDelete.id);
    setError(null);
    try {
      await apiFetch(`/products/${productId}/urls/${urlPendingDelete.id}`, { method: 'DELETE' });
      setUrlPendingDelete(null);
      await fetch_();
    } catch (caughtError: unknown) {
      setError(toProductUrlErrorMessage(caughtError, PRODUCT_URLS_COPY.deleteError));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoaderCircle
          className="h-6 w-6 animate-pulse"
          style={{ color: colors.accent.webb }}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
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
            aria-label={PRODUCT_URLS_COPY.closeErrorAria}
            className="rounded-full p-1"
            style={{ color: colors.state.error }}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <ProductUrlForm productId={productId} creating={creating} fid={fid} onCreate={handleCreate} />
      {error && items.length === 0 ? null : (
        <ProductUrlList items={items} onDelete={setUrlPendingDelete} />
      )}
      <ProductUrlDeleteModal
        urlPendingDelete={urlPendingDelete}
        deletingId={deletingId}
        onConfirm={handleDelete}
        onCancel={() => setUrlPendingDelete(null)}
      />
    </div>
  );
}
