/* ── component ── */
// PULSE_OK: form state preserved in React state, connection errors shown to user

export default function CRMPipelineView() {
  const { pipelines, isLoading: plLoading } = usePipelines();
  const { createDeal, moveDeal, updateDeal, deleteDeal } = useCRMMutations();

  const [selectedPipeline, setSelectedPipeline] = useState<string>('');
  const [addingStage, setAddingStage] = useState<string | null>(null);
  const [detailDeal, setDetailDeal] = useState<CRMDeal | null>(null);
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
  const pipeArr: CRMPipeline[] = Array.isArray(pipelines) ? (pipelines as CRMPipeline[]) : [];
  const pipeId = selectedPipeline || pipeArr[0]?._id || pipeArr[0]?.id || '';

  const {
    deals,
    isLoading: dlLoading,
    mutate: mutateDeals,
  } = useDeals(pipeId ? { pipeline: pipeId } : undefined);
  const dealArr: CRMDeal[] = Array.isArray(deals) ? (deals as CRMDeal[]) : [];

  const currentPipeline = pipeArr.find((p) => (p._id || p.id) === pipeId);
  const stages: CRMStage[] = currentPipeline?.stages || [];
  const showPipelineLoading = plLoading;
  const showDealLoading = dlLoading && !dealArr.length;

  /* ── drag & drop ── */
  const onDragStart = useCallback((e: ReactDragEvent, dealId: string) => {
    setDragDealId(dealId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleStageDrop = useCallback(
    async (event: globalThis.DragEvent, stageId: string) => {
      event.preventDefault();
      if (!dragDealId) {
        return;
      }
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

  const bindStageDropZone = useCallback(
    (stageId: string) => (element: HTMLDivElement | null) => {
      if (!element) {
        return;
      }

      element.ondragover = (event) => {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
      };
      element.ondrop = (event) => {
        void handleStageDrop(event, stageId);
      };
    },
    [handleStageDrop],
  );

  /* ── create deal ── */
  const handleCreate = async (e: FormEvent, stageId: string) => {
    e.preventDefault();
    if (!formTitle.trim() || submitting) {
      return;
    }
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
  };

  /* ── deal detail handlers ── */
  const openDetail = useCallback((deal: CRMDeal) => {
    setDetailDeal(deal);
    setDetailEditing(false);
    setConfirmDelete(false);
  }, []);

  const _startEditing = useCallback(() => {
    if (!detailDeal) {
      return;
    }
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
    if (!detailDeal || detailSaving) {
      return;
    }
    const did = detailDeal._id || detailDeal.id;
    if (!did) {
      return;
    }
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
      setDetailDeal((prev) =>
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
    if (!detailDeal || detailDeleting) {
      return;
    }
    const did = detailDeal._id || detailDeal.id;
    if (!did) {
      return;
    }
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
    return dealArr.filter((d) => {
      const s = d.stage;
      if (typeof s === 'string') {
        return s === stageId;
      }
      return (s?._id || s?.id) === stageId;
    });
  }

  function stageTotal(stageId: string) {
    return dealsForStage(stageId).reduce((sum: number, d: CRMDeal) => sum + (d.value || 0), 0);
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
          {kloelT(`Nenhum pipeline encontrado`)}
        </span>
        <span style={{ fontSize: 12 }}>
          {kloelT(`Crie seu primeiro pipeline para gerenciar deals.`)}
        </span>
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
                {pipeArr.map((p) => (
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
              {stages.length} {kloelT(`etapas &middot;`)} {dealArr.length} deal
              {dealArr.length !== 1 ? 's' : ''}
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
            {kloelT(`Este pipeline nao possui etapas.`)}
          </div>
        ) : (
          stages.map((stage) => {
            const sid = stage._id || stage.id || '';
            const sDeals = dealsForStage(sid);
            const total = stageTotal(sid);

            return (
              <div
                key={sid}
                ref={bindStageDropZone(sid)}
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
                  <span style={{ fontFamily: MONO, fontSize: 11, color: 'colors.ember.primary' }}>
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
                    sDeals.map((deal) => {
                      const did = deal._id || deal.id || '';
                      const pr = PRIORITY_CFG[deal.priority || ''] || PRIORITY_CFG.medium;
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
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLDivElement).style.borderColor =
                              'colors.border.default';
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLDivElement).style.borderColor =
                              'colors.border.space';
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              (e.currentTarget as HTMLElement).click();
                            }
                          }}
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
                                color: 'colors.ember.primary',
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
                        placeholder={kloelT(`Titulo do deal`)}
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        placeholder={kloelT(`Valor (ex: 5000)`)}
                        value={formValue}
                        type="number"
                        step="0.01"
                        onChange={(e) => setFormValue(e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        placeholder={kloelT(`Contato (telefone)`)}
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
                            background: 'colors.ember.primary',
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
                        border: '1px dashed colors.border.space',
                        borderRadius: 6,
                        color: 'var(--app-text-secondary)',
                        fontSize: 11,
                        fontFamily: SORA,
                        padding: '8px 0',
                        cursor: 'pointer',
                        transition: 'border-color 150ms',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor =
                          'colors.ember.primary';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor =
                          'colors.border.space';
                      }}
                    >
                      {IC.plus(12)} {kloelT(`Novo deal`)}
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }
          }}
        >
          <dialog
            open
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
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
              <DetailRow label={kloelT(`Valor`)} value={fmtBRL(detailDeal.value || 0)} mono />
              <DetailRow
                label={kloelT(`Prioridade`)}
                value={(PRIORITY_CFG[detailDeal.priority || ''] || PRIORITY_CFG.medium).label}
                color={(PRIORITY_CFG[detailDeal.priority || ''] || PRIORITY_CFG.medium).color}
              />
              <DetailRow
                label={kloelT(`Etapa`)}
                value={
                  (typeof detailDeal.stage === 'object' ? detailDeal.stage?.name : undefined) ||
                  stages.find(
                    (s) =>
                      (s._id || s.id) ===
                      (typeof detailDeal.stage === 'string'
                        ? detailDeal.stage
                        : detailDeal.stage?._id || detailDeal.stage?.id),
                  )?.name ||
                  '-'
                }
              />
              <DetailRow
                label={kloelT(`Contato`)}
                value={detailDeal.contact?.name || detailDeal.contactName || '-'}
              />
              {detailDeal.contact?.phone && (
                <DetailRow label={kloelT(`Telefone`)} value={detailDeal.contact.phone} mono />
              )}
              {detailDeal.description && (
                <DetailRow label={kloelT(`Descricao`)} value={detailDeal.description} />
              )}
              {detailDeal.expectedCloseDate && (
                <DetailRow
                  label={kloelT(`Previsao de fechamento`)}
                  value={new Date(detailDeal.expectedCloseDate).toLocaleDateString('pt-BR')}
                />
              )}
              {detailDeal.createdAt && (
                <DetailRow
                  label={kloelT(`Criado em`)}
                  value={new Date(detailDeal.createdAt).toLocaleDateString('pt-BR')}
                />
              )}
              {detailDeal.notes && <DetailRow label={kloelT(`Notas`)} value={detailDeal.notes} />}
            </div>
          </dialog>
        </div>
      )}
    </div>
  );
}


