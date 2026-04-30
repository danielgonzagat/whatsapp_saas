/* ── Component ── */
export function ContactDetailDrawer({ phone, onClose }: ContactDetailDrawerProps) {
  const { contact: raw, isLoading, mutate } = useContact(phone);
  const { addTag, removeTag } = useCRMMutations();
  const [tagInput, setTagInput] = useState('');
  const [neuroLoading, setNeuroLoading] = useState(false);
  const [neuroResult, setNeuroResult] = useState<{
    action?: string;
    reason?: string;
    suggestedMessage?: string;
  } | null>(null);
  const [neuroError, setNeuroError] = useState<string | null>(null);

  const contact = raw as Contact | undefined;

  const handleAddTag = useCallback(async () => {
    const value = tagInput.trim();
    if (!value || !phone) {
      return;
    }
    setTagInput('');
    await addTag(phone, value);
    mutate();
  }, [tagInput, phone, addTag, mutate]);

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!phone) {
        return;
      }
      await removeTag(phone, tag);
      mutate();
    },
    [phone, removeTag, mutate],
  );

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleNeuroAnalyze = useCallback(async () => {
    const contactId = contact?.id;
    if (!contactId) {
      return;
    }
    setNeuroLoading(true);
    setNeuroError(null);
    setNeuroResult(null);
    try {
      const [_analysisRes, nbaRes] = await Promise.all([
        neuroCrmApi.analyze(contactId),
        neuroCrmApi.nextBestAction(contactId),
      ]);
      const nba = nbaRes.data as
        | { action?: string; reason?: string; suggestedMessage?: string }
        | undefined;
      setNeuroResult(nba ?? null);
      mutate();
    } catch (err) {
      setNeuroError(err instanceof Error ? err.message : 'Falha na análise');
    } finally {
      setNeuroLoading(false);
    }
  }, [contact, mutate]);

  if (!phone) {
    return null;
  }

  /* ── Derived data ── */
  const name = contact?.name || phone;
  const score = contact?.leadScore ?? 0;
  const sentiment = contact?.sentiment ?? 'neutral';
  const tags = contact?.tags ?? [];
  const deals: Deal[] = contact?.deals ?? [];
  const sentimentStyle = sentimentColors[sentiment] ?? sentimentColors.neutral;

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar detalhes do contato"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      />

      {/* Drawer */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 100,
          width: 380,
          maxWidth: '100vw',
          background: C.surface,
          borderLeft: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: C.sora,
          color: C.text,
          animation: 'slideInRight .2s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {name}
            </h2>
            <span style={{ fontSize: 12, color: C.muted, fontFamily: C.mono }}>{phone}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: C.muted,
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = C.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = C.muted;
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px', background: C.bg }}>
          {isLoading ? (
            <ContactDetailLoadingBody />
          ) : (
            <>
              {/* ── Contact Info ── */}
              <Section title={kloelT(`Informacoes`)}>
                <InfoRow icon={<Phone size={14} aria-hidden="true" />} label={phone} />
                {contact?.email && (
                  <InfoRow icon={<Mail size={14} aria-hidden="true" />} label={contact.email} />
                )}
              </Section>

              {/* ── Tags ── */}
              <Section title={kloelT(`Tags`)}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginBottom: tags.length ? 10 : 0,
                  }}
                >
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: C.elevated,
                        border: `1px solid ${C.border}`,
                        borderRadius: 20,
                        padding: '3px 10px',
                        fontSize: 12,
                        color: C.text,
                      }}
                    >
                      <Tag size={10} style={{ color: C.accent }} aria-hidden="true" />
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: C.muted,
                          padding: 0,
                          lineHeight: 1,
                          display: 'flex',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#FF453A'; // PULSE_VISUAL_OK: delete hover red
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = C.muted;
                        }}
                      >
                        <X size={10} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder={kloelT(`Nova tag...`)}
                    style={{
                      flex: 1,
                      background: C.elevated,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      padding: '6px 10px',
                      fontSize: 12,
                      color: C.text,
                      outline: 'none',
                      fontFamily: C.sora,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    style={{
                      background: C.accent,
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <Plus size={12} aria-hidden="true" /> {kloelT(`Adicionar`)}
                  </button>
                </div>
              </Section>

              {/* ── Score & Sentiment ── */}
              <Section title={kloelT(`Score & Sentimento`)}>
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: C.muted }}>{kloelT(`Lead Score`)}</span>
                    <span style={{ fontFamily: C.mono, color: C.text }}>{score}</span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: C.elevated,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(score, 100)}%`,
                        height: '100%',
                        borderRadius: 3,
                        background: C.accent,
                        transition: 'width .3s ease',
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={14} style={{ color: C.muted }} aria-hidden="true" />
                  <span style={{ fontSize: 12, color: C.muted }}>{kloelT(`Sentimento:`)}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '2px 10px',
                      borderRadius: 20,
                      background: sentimentStyle.bg,
                      color: sentimentStyle.text,
                    }}
                  >
                    {sentiment}
                  </span>
                </div>
              </Section>

              {/* ── Neuro CRM ── */}
              <Section title={kloelT(`Neuro IA`)}>
                <button
                  type="button"
                  onClick={handleNeuroAnalyze}
                  disabled={neuroLoading || !contact?.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: C.accent,
                    border: 'none',
                    borderRadius: 6,
                    padding: '7px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: neuroLoading || !contact?.id ? 'not-allowed' : 'pointer',
                    color: '#fff',
                    opacity: neuroLoading || !contact?.id ? 0.6 : 1,
                    fontFamily: C.sora,
                    marginBottom: 10,
                  }}
                >
                  <Brain size={13} aria-hidden="true" />
                  {neuroLoading ? 'Analisando...' : 'Analisar com IA'}
                </button>
                {neuroError && (
                  <p style={{ fontSize: 12, color: '#FF453A', margin: '0 0 8px' }}>{neuroError}</p> // PULSE_VISUAL_OK: error text red
                )}
                {neuroResult && (
                  <div
                    style={{
                      background: C.elevated,
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      padding: '10px 12px',
                    }}
                  >
                    {neuroResult.action && (
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}
                      >
                        <Zap
                          size={12}
                          style={{ color: C.accent, flexShrink: 0 }}
                          aria-hidden="true"
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                          {neuroResult.action}
                        </span>
                      </div>
                    )}
                    {neuroResult.reason && (
                      <p
                        style={{ fontSize: 11, color: C.muted, margin: '0 0 6px', lineHeight: 1.5 }}
                      >
                        {neuroResult.reason}
                      </p>
                    )}
                    {neuroResult.suggestedMessage && (
                      <div
                        style={{
                          background: C.bg,
                          borderRadius: 4,
                          padding: '6px 8px',
                          fontSize: 11,
                          color: C.text,
                          lineHeight: 1.5,
                        }}
                      >
                        {neuroResult.suggestedMessage}
                      </div>
                    )}
                  </div>
                )}
                {!neuroResult && !neuroError && !neuroLoading && (
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                    {kloelT(`Clique em &quot;Analisar&quot; para obter a proxima melhor acao para este
                    contato.`)}
                  </p>
                )}
              </Section>

              {/* ── Deals ── */}
              <Section title={kloelT(`Deals`)}>
                {deals.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                    {kloelT(`Nenhum deal associado.`)}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {deals.map((deal) => (
                      <div
                        key={deal._id ?? deal.id ?? deal.title}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: C.elevated,
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          padding: '10px 12px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {deal.title ?? 'Sem titulo'}
                          </div>
                          {deal.stage && (
                            <div style={{ fontSize: 11, color: C.muted }}>{deal.stage}</div>
                          )}
                        </div>
                        {deal.value != null && (
                          <span
                            style={{
                              fontFamily: C.mono,
                              fontSize: 13,
                              color: C.accent,
                              fontWeight: 600,
                            }}
                          >
                            {deal.currency ?? 'R$'} {deal.value.toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            gap: 8,
            background: C.surface,
          }}
        >
          <ActionButton
            icon={<MessageCircle size={14} aria-hidden="true" />}
            label={kloelT(`Enviar mensagem`)}
            primary
          />
          <ActionButton
            icon={<Briefcase size={14} aria-hidden="true" />}
            label={kloelT(`Criar deal`)}
          />
        </div>
      </aside>

      {/* Keyframe (injected once) */}
      <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
    </>
  );
}

/* ── Sub-components ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: C.muted,
          margin: '0 0 10px',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: C.text,
        marginBottom: 6,
      }}
    >
      <span style={{ color: C.muted, display: 'flex' }}>{icon}</span>
      <span style={{ fontFamily: C.mono }}>{label}</span>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '10px 0',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        border: primary ? 'none' : `1px solid ${C.border}`,
        background: primary ? C.accent : 'transparent',
        color: primary ? '#fff' : C.text,
        fontFamily: C.sora,
        transition: 'opacity .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '0.85';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1';
      }}
    >
      {icon} {label}
    </button>
  );
}

