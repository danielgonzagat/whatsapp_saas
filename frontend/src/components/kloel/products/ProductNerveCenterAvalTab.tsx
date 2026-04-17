'use client';

import { useToast } from '@/components/kloel/ToastProvider';
import { apiFetch } from '@/lib/api';
import { useState, useEffect } from 'react';
import { useNerveCenterContext } from './product-nerve-center.context';
import {
  Bg,
  Bt,
  Fd,
  M,
  PanelLoadingState,
  Tg,
  V,
  cs,
  is,
  unwrapApiPayload,
} from './product-nerve-center.shared';

export function ProductNerveCenterAvalTab() {
  const { productId } = useNerveCenterContext();
  const { showToast } = useToast();

  /* ── Reviews state (owned by this tab) ── */
  const [reviews, setReviews] = useState<Record<string, unknown>[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  /* ── Fetch Reviews on mount ── */
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

  /* ── Mapped reviews ── */
  const REVIEWS = reviews.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    rating: (r.rating as number) || 5,
    text: (r.text as string) || (r.comment as string) || '',
    name: (r.name as string) || (r.authorName as string) || 'Anônimo',
    ver: r.verified === true,
  }));

  /* ── New review form state ── */
  const [newRevName, setNewRevName] = useState('');
  const [newRevRating, setNewRevRating] = useState(5);
  const [newRevText, setNewRevText] = useState('');
  const [newRevVer, setNewRevVer] = useState(false);
  const [showRevForm, setShowRevForm] = useState(false);

  const handleCreateReview = async () => {
    if (!newRevName.trim()) return;
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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: V.t, margin: 0 }}>Avaliações</h2>
        <Bt primary onClick={() => setShowRevForm(!showRevForm)}>
          + Criar avaliação
        </Bt>
      </div>
      {showRevForm && (
        <div style={{ ...cs, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Fd label="Nome do autor" value={newRevName} onChange={setNewRevName} />
            <Fd label="Nota">
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    onClick={() => setNewRevRating(star)}
                    style={{
                      cursor: 'pointer',
                      fontSize: 18,
                      color: star <= newRevRating ? V.y : V.t3,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).click();
                      }
                    }}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="none"
                      aria-hidden="true"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
                    </svg>
                  </span>
                ))}
              </div>
            </Fd>
          </div>
          <Fd label="Texto" full>
            <textarea
              style={{ ...is, height: 60 }}
              value={newRevText}
              onChange={(e) => setNewRevText(e.target.value)}
              placeholder="Texto da avaliação..."
            />
          </Fd>
          <Tg label="Verificado?" checked={newRevVer} onChange={setNewRevVer} />
          <Bt primary onClick={handleCreateReview} style={{ marginTop: 8 }}>
            Criar
          </Bt>
        </div>
      )}
      {reviewsLoading ? (
        <PanelLoadingState
          compact
          label="Carregando avaliações"
          description="A aba permanece montada enquanto reputação, notas e provas sociais do produto sincronizam."
        />
      ) : REVIEWS.length === 0 ? (
        <div style={{ ...cs, padding: 40, textAlign: 'center' }}>
          <span style={{ color: V.t3, fontSize: 13 }}>Nenhuma avaliação ainda</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontFamily: M, fontSize: 48, fontWeight: 700, color: V.y }}>
                {(
                  REVIEWS.reduce((s: number, r: { rating: number }) => s + r.rating, 0) /
                  REVIEWS.length
                ).toFixed(1)}
              </span>
              <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    style={{
                      color:
                        star <=
                        Math.round(
                          REVIEWS.reduce((s: number, r: { rating: number }) => s + r.rating, 0) /
                            REVIEWS.length,
                        )
                          ? V.y
                          : V.t3,
                    }}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="none"
                      aria-hidden="true"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
                    </svg>
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 10, color: V.t3 }}>{REVIEWS.length} avaliações</span>
            </div>
            <div style={{ flex: 1 }}>
              {[5, 4, 3, 2, 1].map((n) => {
                const ct = REVIEWS.filter((r: { rating: number }) => r.rating === n).length;
                return (
                  <div
                    key={n}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                  >
                    <span style={{ fontFamily: M, fontSize: 10, color: V.t2, width: 16 }}>
                      {n}
                      <svg
                        width={10}
                        height={10}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="none"
                        style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 1 }}
                        aria-hidden="true"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
                      </svg>
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        background: V.e,
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(ct / REVIEWS.length) * 100}%`,
                          height: '100%',
                          background: V.y,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <span style={{ fontFamily: M, fontSize: 10, color: V.t3, width: 20 }}>
                      {ct}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {REVIEWS.map((r) => (
            <div key={r.id} style={{ ...cs, padding: 16, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: V.e,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: M,
                    fontSize: 10,
                    fontWeight: 700,
                    color: V.t2,
                  }}
                >
                  {r.name
                    .split(' ')
                    .map((w: string) => w[0])
                    .join('')}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: V.t }}>{r.name}</span>
                {r.ver && <Bg color={V.g}>VERIFICADO</Bg>}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} style={{ color: star <= r.rating ? V.y : V.t3, fontSize: 12 }}>
                      <svg
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        stroke="none"
                        aria-hidden="true"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
                      </svg>
                    </span>
                  ))}
                  <Bt
                    onClick={() => handleDeleteReview(r.id)}
                    style={{ padding: '2px 6px', color: V.r, fontSize: 10 }}
                  >
                    x
                  </Bt>
                </div>
              </div>
              <p style={{ fontSize: 12, color: V.t2, margin: 0 }}>{r.text}</p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
