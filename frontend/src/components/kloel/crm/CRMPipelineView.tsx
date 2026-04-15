'use client';

import { useCRMMutations, useDeals, usePipelines } from '@/hooks/useCRM';
import { type DragEvent, type FormEvent, useCallback, useState } from 'react';

const SORA = "var(--font-sora), 'Sora', sans-serif";
const MONO = "var(--font-jetbrains), 'JetBrains Mono', monospace";

/* ── helpers ── */
function fmtBRL(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  high: { label: 'Alta', color: '#EF4444' },
  medium: { label: 'Média', color: '#F59E0B' },
  low: { label: 'Baixa', color: 'var(--app-text-secondary)' },
};

/* ── tiny icons ── */
const IC = {
  chevron: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  plus: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  x: (s: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  deal: (s: number) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  ),
};

function LoadingStrip({
  width = '100%',
  height = 12,
}: {
  width?: string | number;
  height?: string | number;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background:
          'linear-gradient(90deg, rgba(25,25,28,0.98) 0%, rgba(41,41,46,1) 50%, rgba(25,25,28,0.98) 100%)',
      }}
    />
  );
}

function DealCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--app-bg-secondary)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        padding: '10px 12px',
      }}
    >
      <LoadingStrip width="72%" height={12} />
      <div style={{ height: 8 }} />
      <LoadingStrip width="36%" height={10} />
      <div style={{ height: 8 }} />
      <LoadingStrip width="46%" height={9} />
    </div>
  );
}

function PipelineColumnSkeleton() {
  return (
    <div
      style={{
        minWidth: 280,
        width: 280,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 8,
        flexShrink: 0,
        maxHeight: '100%',
      }}
    >
      <div
        style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--app-border-subtle)' }}
      >
        <LoadingStrip width="58%" height={11} />
        <div style={{ height: 10 }} />
        <LoadingStrip width="38%" height={10} />
      </div>
      <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <DealCardSkeleton />
        <DealCardSkeleton />
        <LoadingStrip width="100%" height={34} />
      </div>
    </div>
  );
}

/* ── component ── */
export default function CRMPipelineView() {
  const { pipelines, isLoading: plLoading } = usePipelines();
  const { createDeal, moveDeal, updateDeal, deleteDeal } = useCRMMutations();

  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [addingStage, setAddingStage] = useState<string | null>(null);
  const [detailDeal, setDetailDeal] = useState<any>(null);
  const [dragDealId, setDragDealId] = useState<string | null>(null);

  // deal detail modal state
  const [_detailEditing, setDetailEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailDeleting, setDetailDeleting] = useState(false);
  const [_confirmDelete, setConfirmDelete] = useState(false);

  // form state for inline "new deal"
  const [formTitle, setFormTitle] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formContact, setFormContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // resolve selected pipeline
  const pipeArr: any[] = Array.isArray(pipelines) ? pipelines : [];
  const pipeId = selectedPipeline || (pipeArr[0] as any)?._id || (pipeArr[0] as any)?.id || '';

  const {
    deals,
    isLoading: dlLoading,
    mutate: mutateDeals,
  } = useDeals(pipeId ? { pipeline: pipeId } : undefined);
  const dealArr: any[] = Array.isArray(deals) ? deals : [];

  const currentPipeline: any = pipeArr.find((p: any) => (p._id || p.id) === pipeId);
  const stages: any[] = currentPipeline?.stages || [];
  const showPipelineLoading = plLoading;
  const showDealLoading = dlLoading && !dealArr.length;

  /* ── drag & drop ── */
  const onDragStart = useCallback((e: DragEvent, dealId: string) => {
    setDragDealId(dealId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    async (e: DragEvent, stageId: string) => {
      e.preventDefault();
      if (!dragDealId) return;
      try {
        await moveDeal(dragDealId, stageId);
        await mutateDeals();
      } catch {
        /* silent */
      }
      setDragDealId(null);
    },
    [dragDealId, moveDeal, mutateDeals],
  );

  /* ── create deal ── */
  /* eslint-disable react-hooks/preserve-manual-memoization -- pipeId is a stable derived value per render; memoization is correct */
  const handleCreate = useCallback(
    async (e: FormEvent, stageId: string) => {
      e.preventDefault();
      if (!formTitle.trim() || submitting) return;
      setSubmitting(true);
      try {
        await createDeal({
          title: formTitle.trim(),
          value: Number.parseFloat(formValue) || 0,
          contact: formContact.trim() || undefined,
          pipeline: pipeId,
          stage: stageId,
        });
        await mutateDeals();
        setFormTitle('');
        setFormValue('');
        setFormContact('');
        setAddingStage(null);
      } catch {
        /* silent */
      }
      setSubmitting(false);
    },
    [formTitle, formValue, formContact, pipeId, submitting, createDeal, mutateDeals],
  );
  /* eslint-enable react-hooks/preserve-manual-memoization */

  /* ── deal detail handlers ── */
  const openDetail = useCallback((deal: any) => {
    setDetailDeal(deal);
    setDetailEditing(false);
    setConfirmDelete(false);
  }, []);

  const _startEditing = useCallback(() => {
    if (!detailDeal) return;
    setEditTitle(detailDeal.title || '');
    setEditValue(String(detailDeal.value || 0));
    setEditNotes(detailDeal.notes || '');
    setDetailEditing(true);
    setConfirmDelete(false);
  }, [detailDeal]);

  const _cancelEditing = useCallback(() => {
    setDetailEditing(false);
  }, []);

  const _handleSaveEdit = useCallback(async () => {
    if (!detailDeal || detailSaving) return;
    const did = detailDeal._id || detailDeal.id;
    setDetailSaving(true);
    try {
      await updateDeal(did, {
        title: editTitle.trim(),
        value: Number.parseFloat(editValue) || 0,
        notes: editNotes.trim(),
      });
      await mutateDeals();
      setDetailEditing(false);
      // Update local detail state to reflect changes
      setDetailDeal((prev: any) =>
        prev
          ? {
              ...prev,
              title: editTitle.trim(),
              value: Number.parseFloat(editValue) || 0,
              notes: editNotes.trim(),
            }
          : null,
      );
    } catch {
      /* silent */
    }
    setDetailSaving(false);
  }, [detailDeal, editTitle, editValue, editNotes, detailSaving, updateDeal, mutateDeals]);

  const _handleDeleteDeal = useCallback(async () => {
    if (!detailDeal || detailDeleting) return;
    const did = detailDeal._id || detailDeal.id;
    setDetailDeleting(true);
    try {
      await deleteDeal(did);
      await mutateDeals();
      setDetailDeal(null);
    } catch {
      /* silent */
    }
    setDetailDeleting(false);
    setConfirmDelete(false);
  }, [detailDeal, detailDeleting, deleteDeal, mutateDeals]);

  /* ── stage helpers ── */
  function dealsForStage(stageId: string) {
    return dealArr.filter((d: any) => (d.stage?._id || d.stage?.id || d.stage) === stageId);
  }

  function stageTotal(stageId: string) {
    return dealsForStage(stageId).reduce((sum: number, d: any) => sum + (d.value || 0), 0);
  }

  /* ── empty: no pipelines ── */
  if (!showPipelineLoading && !pipeArr.length) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 12,
          color: 'var(--app-text-secondary)',
          fontFamily: SORA,
        }}
      >
        <span style={{ color: 'var(--app-text-tertiary)' }}>{IC.deal(40)}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--app-text-primary)' }}>
          Nenhum pipeline encontrado
        </span>
        <span style={{ fontSize: 12 }}>Crie seu primeiro pipeline para gerenciar deals.</span>
      </div>
    );
  }

  /* ── main render ── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: SORA }}>
      {/* ── toolbar ── */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', flexShrink: 0 }}
      >
        {showPipelineLoading ? (
          <>
            <LoadingStrip width={170} height={34} />
            <LoadingStrip width={120} height={12} />
          </>
        ) : (
          <>
            <div style={{ position: 'relative' }}>
              <select
                value={pipeId}
                onChange={(e) => setSelectedPipeline(e.target.value)}
                style={{
                  appearance: 'none',
                  background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  color: 'var(--app-text-primary)',
                  fontFamily: SORA,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '8px 32px 8px 12px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {pipeArr.map((p: any) => (
                  <option key={p._id || p.id} value={p._id || p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--app-text-secondary)',
                  pointerEvents: 'none',
                }}
              >
                {IC.chevron(14)}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>
              {stages.length} etapas &middot; {dealArr.length} deal{dealArr.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>

      {/* ── board ── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: 8,
        }}
      >
        {showPipelineLoading ? (
          <>
            <PipelineColumnSkeleton />
            <PipelineColumnSkeleton />
            <PipelineColumnSkeleton />
          </>
        ) : stages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              color: 'var(--app-text-secondary)',
              fontSize: 13,
            }}
          >
            Este pipeline nao possui etapas.
          </div>
        ) : (
          stages.map((stage: any) => {
            const sid = stage._id || stage.id;
            const sDeals = dealsForStage(sid);
            const total = stageTotal(sid);

            return (
              <div
                key={sid}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, sid)}
                style={{
                  minWidth: 280,
                  width: 280,
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 8,
                  flexShrink: 0,
                  maxHeight: '100%',
                }}
              >
                {/* column header */}
                <div
                  style={{
                    padding: '14px 14px 10px',
                    borderBottom: '1px solid var(--app-border-subtle)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--app-text-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '.04em',
                      }}
                    >
                      {stage.name}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'var(--app-text-secondary)',
                        background: 'var(--app-bg-secondary)',
                        borderRadius: 4,
                        padding: '2px 7px',
                      }}
                    >
                      {sDeals.length}
                    </span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#E85D30' }}>
                    {fmtBRL(total)}
                  </span>
                </div>

                {/* cards area */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {showDealLoading ? (
                    <>
                      <DealCardSkeleton />
                      <DealCardSkeleton />
                      <DealCardSkeleton />
                    </>
                  ) : (
                    sDeals.map((deal: any) => {
                      const did = deal._id || deal.id;
                      const pr = PRIORITY_CFG[deal.priority] || PRIORITY_CFG.medium;
                      return (
                        <div
                          key={did}
                          draggable
                          onDragStart={(e) => onDragStart(e, did)}
                          onClick={() => openDetail(deal)}
                          style={{
                            background: 'var(--app-bg-secondary)',
                            border: '1px solid var(--app-border-primary)',
                            borderRadius: 6,
                            padding: '10px 12px',
                            cursor: 'grab',
                            transition: 'border-color 150ms',
                            opacity: dragDealId === did ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLDivElement).style.borderColor = '#333338')
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLDivElement).style.borderColor = '#222226')
                          }
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'var(--app-text-primary)',
                              marginBottom: 6,
                              lineHeight: 1.3,
                            }}
                          >
                            {deal.title}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 11,
                                color: '#E85D30',
                                fontWeight: 600,
                              }}
                            >
                              {fmtBRL(deal.value || 0)}
                            </span>
                            {deal.priority && (
                              <span
                                style={{
                                  fontFamily: MONO,
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: pr.color,
                                  background: `${pr.color}14`,
                                  padding: '2px 6px',
                                  borderRadius: 3,
                                  textTransform: 'uppercase',
                                  letterSpacing: '.04em',
                                }}
                              >
                                {pr.label}
                              </span>
                            )}
                          </div>
                          {(deal.contact?.name || deal.contactName) && (
                            <div
                              style={{
                                fontSize: 10,
                                color: 'var(--app-text-secondary)',
                                marginTop: 6,
                              }}
                            >
                              {deal.contact?.name || deal.contactName}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* inline form */}
                  {addingStage === sid ? (
                    <form
                      onSubmit={(e) => handleCreate(e, sid)}
                      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                    >
                      <input
                        autoFocus
                        placeholder="Titulo do deal"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        placeholder="Valor (ex: 5000)"
                        value={formValue}
                        type="number"
                        step="0.01"
                        onChange={(e) => setFormValue(e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        placeholder="Contato (telefone)"
                        value={formContact}
                        onChange={(e) => setFormContact(e.target.value)}
                        style={inputStyle}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="submit"
                          disabled={submitting}
                          style={{
                            ...btnStyle,
                            background: '#E85D30',
                            color: '#fff',
                            flex: 1,
                            opacity: submitting ? 0.6 : 1,
                          }}
                        >
                          {submitting ? '...' : 'Criar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingStage(null);
                            setFormTitle('');
                            setFormValue('');
                            setFormContact('');
                          }}
                          style={{
                            ...btnStyle,
                            background: 'var(--app-bg-secondary)',
                            color: 'var(--app-text-secondary)',
                          }}
                        >
                          {IC.x(12)}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingStage(sid);
                        setFormTitle('');
                        setFormValue('');
                        setFormContact('');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        background: 'transparent',
                        border: '1px dashed #222226',
                        borderRadius: 6,
                        color: 'var(--app-text-secondary)',
                        fontSize: 11,
                        fontFamily: SORA,
                        padding: '8px 0',
                        cursor: 'pointer',
                        transition: 'border-color 150ms',
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLButtonElement).style.borderColor = '#E85D30')
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLButtonElement).style.borderColor = '#222226')
                      }
                    >
                      {IC.plus(12)} Novo deal
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── deal detail panel ── */}
      {detailDeal && (
        <div
          onClick={() => setDetailDeal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 10,
              width: 420,
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: 24,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 18,
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--app-text-primary)' }}>
                {detailDeal.title}
              </span>
              <button
                type="button"
                onClick={() => setDetailDeal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--app-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {IC.x(18)}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <DetailRow label="Valor" value={fmtBRL(detailDeal.value || 0)} mono />
              <DetailRow
                label="Prioridade"
                value={(PRIORITY_CFG[detailDeal.priority] || PRIORITY_CFG.medium).label}
                color={(PRIORITY_CFG[detailDeal.priority] || PRIORITY_CFG.medium).color}
              />
              <DetailRow
                label="Etapa"
                value={
                  detailDeal.stage?.name ||
                  stages.find((s: any) => (s._id || s.id) === detailDeal.stage)?.name ||
                  '-'
                }
              />
              <DetailRow
                label="Contato"
                value={detailDeal.contact?.name || detailDeal.contactName || '-'}
              />
              {detailDeal.contact?.phone && (
                <DetailRow label="Telefone" value={detailDeal.contact.phone} mono />
              )}
              {detailDeal.description && (
                <DetailRow label="Descricao" value={detailDeal.description} />
              )}
              {detailDeal.expectedCloseDate && (
                <DetailRow
                  label="Previsao de fechamento"
                  value={new Date(detailDeal.expectedCloseDate).toLocaleDateString('pt-BR')}
                />
              )}
              {detailDeal.createdAt && (
                <DetailRow
                  label="Criado em"
                  value={new Date(detailDeal.createdAt).toLocaleDateString('pt-BR')}
                />
              )}
              {detailDeal.notes && <DetailRow label="Notas" value={detailDeal.notes} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── detail row ── */
function DetailRow({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--app-text-tertiary)',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          fontFamily: "var(--font-sora), 'Sora', sans-serif",
          display: 'block',
          marginBottom: 3,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: color || '#E0DDD8',
          fontFamily: mono
            ? "var(--font-jetbrains), 'JetBrains Mono', monospace"
            : "var(--font-sora), 'Sora', sans-serif",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ── shared styles ── */
const inputStyle: React.CSSProperties = {
  background: 'var(--app-bg-primary)',
  border: '1px solid var(--app-border-primary)',
  borderRadius: 5,
  color: 'var(--app-text-primary)',
  fontFamily: "var(--font-sora), 'Sora', sans-serif",
  fontSize: 11,
  padding: '7px 10px',
  outline: 'none',
  width: '100%',
};

const btnStyle: React.CSSProperties = {
  border: '1px solid var(--app-border-primary)',
  borderRadius: 5,
  fontFamily: "var(--font-sora), 'Sora', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  padding: '7px 12px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
};
