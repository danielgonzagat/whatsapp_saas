'use client';

import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { useState, useEffect } from 'react';
import { unwrapApiPayload } from './product-nerve-center.shared';

export function useProductReviews(productId: string) {
  const { showToast } = useToast();

  const [reviews, setReviews] = useState<Record<string, unknown>[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  useEffect(() => {
    if (productId) {
      setReviewsLoading(true);
      apiFetch(`/products/${productId}/reviews`)
        .then((res: unknown) => {
          const d = unwrapApiPayload<Record<string, unknown>[]>(res);
          setReviews(Array.isArray(d) ? d : []);
        })
        .catch(() => setReviews([]))
        .finally(() => setReviewsLoading(false));
    }
  }, [productId]);

  const [newRevName, setNewRevName] = useState('');
  const [newRevRating, setNewRevRating] = useState(5);
  const [newRevText, setNewRevText] = useState('');
  const [newRevVer, setNewRevVer] = useState(false);
  const [showRevForm, setShowRevForm] = useState(false);

  const handleCreateReview = async () => {
    if (!newRevName.trim()) {
      return;
    }
    try {
      const res = await apiFetch(`/products/${productId}/reviews`, {
        method: 'POST',
        body: {
          authorName: newRevName.trim(),
          rating: newRevRating,
          comment: newRevText.trim(),
          verified: newRevVer,
        },
      });
      const created = unwrapApiPayload<Record<string, unknown>>(res);
      setReviews((prev) => [created, ...prev]);
      setShowRevForm(false);
      setNewRevName('');
      setNewRevText('');
      setNewRevRating(5);
      setNewRevVer(false);
      showToast('Avaliação criada', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao criar avaliação', 'error');
    }
  };

  const handleDeleteReview = async (id: string) => {
    try {
      await apiFetch(`/products/${productId}/reviews/${id}`, { method: 'DELETE' });
      setReviews((prev) => prev.filter((r) => r.id !== id));
      showToast('Avaliação removida', 'success');
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Erro ao remover avaliação', 'error');
    }
  };

  return {
    reviews,
    reviewsLoading,
    newRevName,
    setNewRevName,
    newRevRating,
    setNewRevRating,
    newRevText,
    setNewRevText,
    newRevVer,
    setNewRevVer,
    showRevForm,
    setShowRevForm,
    handleCreateReview,
    handleDeleteReview,
  };
}
