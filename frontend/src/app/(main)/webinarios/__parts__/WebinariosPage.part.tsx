export default function WebinariosPage() {
  const fid = useId();
  const _router = useRouter();
  const { isAuthenticated, isLoading, workspace, openAuthModal } = useAuth();
  const workspaceId = workspace?.id;

  const [webinars, setWebinars] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Viewer state
  const [viewing, setViewing] = useState<Webinar | null>(null);

  // Edit state
  const [editingWebinar, setEditingWebinar] = useState<Webinar | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchWebinars = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<WebinarListResponse>('/webinars');
      if (res.error) {
        throw new Error(res.error);
      }
      setWebinars(Array.isArray(res.data?.webinars) ? res.data.webinars : []);
    } catch (error: unknown) {
      setError(readErrorMessage(error, 'Falha ao carregar webinarios'));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (isAuthenticated && workspaceId) {
      void fetchWebinars();
    }
  }, [fetchWebinars, isAuthenticated, workspaceId]);

  const handleCreate = async () => {
    if (!formTitle.trim() || !formUrl.trim() || !formDate) {
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ id: string }>('/webinars', {
        method: 'POST',
        body: {
          title: formTitle.trim(),
          url: formUrl.trim(),
          date: formDate,
          description: formDescription.trim() || undefined,
        },
      });
      if (res.error) {
        throw new Error(res.error);
      }
      setShowModal(false);
      setFormTitle('');
      setFormUrl('');
      setFormDate('');
      setFormDescription('');
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/webinar'));
      fetchWebinars();
    } catch (error: unknown) {
      setError(readErrorMessage(error, 'Falha ao criar webinario'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (w: Webinar, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWebinar(w);
    setEditTitle(w.title);
    setEditUrl(w.url);
    // convert ISO date to datetime-local format
    const d = new Date(w.date);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditDate(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
    setEditDescription(w.description ?? '');
  };

  const handleEdit = async () => {
    if (!editingWebinar || !editTitle.trim() || !editUrl.trim() || !editDate) {
      return;
    }
    setEditSaving(true);
    try {
      const res = await webinarApi.update(editingWebinar.id, {
        title: editTitle.trim(),
        url: editUrl.trim(),
        date: editDate,
        description: editDescription.trim() || undefined,
      });
      if (res.error) {
        throw new Error(res.error);
      }
      setEditingWebinar(null);
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/webinar'));
      fetchWebinars();
    } catch (error: unknown) {
      setError(readErrorMessage(error, 'Falha ao editar webinario'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await webinarApi.remove(id);
      if (res.error) {
        throw new Error(res.error);
      }
      setConfirmDeleteId(null);
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/webinar'));
      fetchWebinars();
    } catch (error: unknown) {
      setError(readErrorMessage(error, 'Falha ao deletar webinario'));
    } finally {
      setDeletingId(null);
    }
  };

  // Viewer: embed or external link
  if (viewing) {
    const embedUrl = toEmbedUrl(viewing.url);
    return (
      <div
        style={{
          background: 'var(--app-bg-primary)',
          minHeight: '100vh',
          padding: '24px 32px',
          fontFamily: 'Sora, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => setViewing(null)}
            style={{
              background: 'rgba(232, 93, 48, 0.1)',
              border: '1px solid rgba(232, 93, 48, 0.3)',
              color: colors.ember.primary,
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'Sora, sans-serif',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <X size={14} aria-hidden="true" /> {kloelT(`Voltar`)}
          </button>
          <h2
            style={{ color: 'var(--app-text-primary)', fontSize: 18, fontWeight: 600, margin: 0 }}
          >
            {viewing.title}
          </h2>
          <a
            href={viewing.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: colors.ember.primary,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              marginLeft: 'auto',
            }}
          >
            <ExternalLink size={12} aria-hidden="true" /> {kloelT(`Abrir original`)}
          </a>
        </div>
        {embedUrl ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              paddingBottom: '56.25%',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#111',
            }}
          >
            <iframe
              src={embedUrl}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              sandbox={kloelT(`allow-scripts allow-same-origin allow-presentation`)}
              allow={kloelT(
                `accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture`,
              )}
              allowFullScreen
            />
          </div>
        ) : (
          <div
            style={{
              background: 'rgba(232, 93, 48, 0.06)',
              border: '1px solid rgba(232, 93, 48, 0.15)',
              borderRadius: 8,
              padding: 40,
              textAlign: 'center',
            }}
          >
            <Video
              size={48}
              style={{ color: colors.ember.primary, marginBottom: 16 }}
              aria-hidden="true"
            />
            <p style={{ color: 'var(--app-text-primary)', fontSize: 14, marginBottom: 16 }}>
              {kloelT(`Este link nao pode ser incorporado diretamente.`)}
            </p>
            <a
              href={viewing.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: colors.ember.primary,
                color:
                  '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
                padding: '10px 24px',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'Sora, sans-serif',
              }}
            >
              {kloelT(`Abrir Webinario`)}
            </a>
          </div>
        )}
        {viewing.description && (
          <p
            style={{
              color:
                '#999' /* PULSE_VISUAL_OK: universal gray placeholder */ /* PULSE_VISUAL_OK: universal gray placeholder */,
              fontSize: 13,
              marginTop: 16,
              lineHeight: 1.6,
            }}
          >
            {viewing.description}
          </p>
        )}
      </div>
    );
  }

  if (!isLoading && !isAuthenticated) {
    return (
      <div
        style={{
          background: 'var(--app-bg-primary)',
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              color: 'var(--app-text-primary)',
              fontSize: 14,
              marginBottom: 16,
              fontFamily: 'Sora, sans-serif',
            }}
          >
            {kloelT(`Faca login para acessar seus webinarios.`)}
          </p>
          <button
            type="button"
            onClick={() => openAuthModal()}
            style={{
              background: colors.ember.primary,
              color:
                '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
              border: 'none',
              borderRadius: 6,
              padding: '10px 24px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'Sora, sans-serif',
            }}
          >
            {kloelT(`Entrar`)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--app-bg-primary)',
        minHeight: '100vh',
        padding: '24px 32px',
        fontFamily: 'Sora, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Video size={20} style={{ color: colors.ember.primary }} aria-hidden="true" />
          <h1
            style={{ color: 'var(--app-text-primary)', fontSize: 20, fontWeight: 700, margin: 0 }}
          >
            {kloelT(`Webinarios`)}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={{
            background: colors.ember.primary,
            color:
              '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
            border: 'none',
            borderRadius: 6,
            padding: '8px 18px',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'Sora, sans-serif',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Plus size={14} aria-hidden="true" /> {kloelT(`Novo Webinario`)}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            background: 'rgba(232, 93, 48, 0.08)',
            border: '1px solid rgba(232, 93, 48, 0.2)',
            borderRadius: 6,
            padding: '10px 16px',
            marginBottom: 16,
            color: colors.ember.primary,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Loader2
            size={20}
            style={{ color: colors.ember.primary, animation: 'spin 1s linear infinite' }}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Empty state */}
      {!loading && webinars.length === 0 && (
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            padding: 48,
            textAlign: 'center',
          }}
        >
          <Video size={40} style={{ color: '#444', marginBottom: 12 }} aria-hidden="true" />
          <p
            style={{
              color:
                '#666' /* PULSE_VISUAL_OK: universal gray disabled */ /* PULSE_VISUAL_OK: universal gray disabled */,
              fontSize: 14,
            }}
          >
            {kloelT(`Nenhum webinario criado ainda.`)}
          </p>
          <p style={{ color: '#555', fontSize: 12 }}>
            {kloelT(`Clique em &quot;Novo Webinario&quot; para comecar.`)}
          </p>
        </div>
      )}

      {/* Webinar list */}
      {!loading && webinars.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 12,
          }}
        >
          {webinars.map((w) => (
            <div
              key={w.id}
              onClick={() => setViewing(w)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                padding: 20,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(232, 93, 48, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
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
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <h3
                  style={{
                    color: 'var(--app-text-primary)',
                    fontSize: 15,
                    fontWeight: 600,
                    margin: 0,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {w.title}
                </h3>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: `${statusColor(w.status)}18`,
                      color: statusColor(w.status),
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 4,
                    }}
                  >
                    <StatusIcon status={w.status} />
                    {statusLabel(w.status)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => openEdit(w, e)}
                    title={kloelT(`Editar`)}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 4,
                      padding: '4px 6px',
                      cursor: 'pointer',
                      color: '#888',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Pencil size={12} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(w.id);
                    }}
                    title={kloelT(`Deletar`)}
                    style={{
                      background: 'none',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 4,
                      padding: '4px 6px',
                      cursor: 'pointer',
                      color: colors.ember.primary,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#777',
                  fontSize: 12,
                  marginBottom: 6,
                }}
              >
                <Calendar size={12} aria-hidden="true" />
                {formatDate(w.date)}
              </div>
              {w.description && (
                <p
                  style={{ color: '#888', fontSize: 12, margin: 0, lineHeight: 1.5, marginTop: 4 }}
                >
                  {w.description.length > 100 ? `${w.description.slice(0, 100)}...` : w.description}
                </p>
              )}
              <div
                style={{
                  color: '#555',
                  fontSize: 11,
                  marginTop: 8,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {w.url}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowModal(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              background: '#141416',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 28,
              width: 440,
              maxWidth: '90vw',
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
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  color: 'var(--app-text-primary)',
                  fontSize: 16,
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                {kloelT(`Novo Webinario`)}
              </h2>
              <button
                type="button"
                aria-label="Fechar modal"
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color:
                    '#666' /* PULSE_VISUAL_OK: universal gray disabled */ /* PULSE_VISUAL_OK: universal gray disabled */,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label
                  style={{
                    color:
                      '#999' /* PULSE_VISUAL_OK: universal gray placeholder */ /* PULSE_VISUAL_OK: universal gray placeholder */,
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-titulo-create`}
                >
                  {kloelT(`Titulo *`)}
                </label>
                <input
                  aria-label="Titulo do webinario"
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={kloelT(`Ex: Lancamento do produto X`)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  id={`${fid}-titulo-create`}
                />
              </div>

              <div>
                <label
                  style={{
                    color:
                      '#999' /* PULSE_VISUAL_OK: universal gray placeholder */ /* PULSE_VISUAL_OK: universal gray placeholder */,
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-url-create`}
                >
                  {kloelT(`URL do Webinario *`)}
                </label>
                <input
                  aria-label="URL do webinario"
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://youtube.com/live/..."
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  id={`${fid}-url-create`}
                />
              </div>

              <div>
                <label
                  style={{
                    color:
                      '#999' /* PULSE_VISUAL_OK: universal gray placeholder */ /* PULSE_VISUAL_OK: universal gray placeholder */,
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-data-create`}
                >
                  {kloelT(`Data e Hora *`)}
                </label>
                <input
                  aria-label="Data e hora do webinario"
                  type="datetime-local"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                  }}
                  id={`${fid}-data-create`}
                />
              </div>

              <div>
                <label
                  style={{
                    color:
                      '#999' /* PULSE_VISUAL_OK: universal gray placeholder */ /* PULSE_VISUAL_OK: universal gray placeholder */,
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-desc-create`}
                >
                  {kloelT(`Descricao (opcional)`)}
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={kloelT(`Descreva o webinario...`)}
                  rows={3}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                  id={`${fid}-desc-create`}
                />
              </div>

              <button
                type="button"
                onClick={handleCreate}
                disabled={saving || !formTitle.trim() || !formUrl.trim() || !formDate}
                style={{
                  background: saving
                    ? '#666' /* PULSE_VISUAL_OK: universal gray disabled */
                    : colors.ember.primary,
                  color:
                    '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 20px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'Sora, sans-serif',
                  marginTop: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {saving ? (
                  <Loader2
                    size={14}
                    style={{ animation: 'spin 1s linear infinite' }}
                    aria-hidden="true"
                  />
                ) : (
                  <Plus size={14} aria-hidden="true" />
                )}
                {saving ? 'Criando...' : 'Criar Webinario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingWebinar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
          }}
          onClick={() => setEditingWebinar(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              background: '#141416',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 28,
              width: 440,
              maxWidth: '90vw',
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
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  color: 'var(--app-text-primary)',
                  fontSize: 16,
                  fontWeight: 700,
                  margin: 0,
                }}
              >
                {kloelT(`Editar Webinario`)}
              </h2>
              <button
                type="button"
                aria-label="Fechar modal de edicao"
                onClick={() => setEditingWebinar(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color:
                    '#666' /* PULSE_VISUAL_OK: universal gray disabled */ /* PULSE_VISUAL_OK: universal gray disabled */,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label
                  style={{
                    color:
                      '#999' /* PULSE_VISUAL_OK: universal gray placeholder */ /* PULSE_VISUAL_OK: universal gray placeholder */,
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-titulo-edit`}
                >
                  {kloelT(`Titulo *`)}
                </label>
                <input
                  aria-label="Titulo do webinario"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  id={`${fid}-titulo-edit`}
                />
              </div>

              <div>
                <label
                  style={{
                    color:
                      '#999' /* PULSE_VISUAL_OK: universal gray placeholder */ /* PULSE_VISUAL_OK: universal gray placeholder */,
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-url-edit`}
                >
                  {kloelT(`URL do Webinario *`)}
                </label>
                <input
                  aria-label="URL do webinario"
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  id={`${fid}-url-edit`}
                />
              </div>

              <div>
                <label
                  style={{
                    color:
                      '#999' /* PULSE_VISUAL_OK: universal gray placeholder */ /* PULSE_VISUAL_OK: universal gray placeholder */,
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-data-edit`}
                >
                  {kloelT(`Data e Hora *`)}
                </label>
                <input
                  aria-label="Data e hora do webinario"
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                  }}
                  id={`${fid}-data-edit`}
                />
              </div>

              <div>
                <label
                  style={{
                    color:
                      '#999' /* PULSE_VISUAL_OK: universal gray placeholder */ /* PULSE_VISUAL_OK: universal gray placeholder */,
                    fontSize: 12,
                    display: 'block',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-desc-edit`}
                >
                  {kloelT(`Descricao (opcional)`)}
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 13,
                    fontFamily: 'Sora, sans-serif',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                  id={`${fid}-desc-edit`}
                />
              </div>

              <button
                type="button"
                onClick={handleEdit}
                disabled={editSaving || !editTitle.trim() || !editUrl.trim() || !editDate}
                style={{
                  background: editSaving
                    ? '#666' /* PULSE_VISUAL_OK: universal gray disabled */
                    : colors.ember.primary,
                  color:
                    '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 20px',
                  cursor: editSaving ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'Sora, sans-serif',
                  marginTop: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {editSaving ? (
                  <Loader2
                    size={14}
                    style={{ animation: 'spin 1s linear infinite' }}
                    aria-hidden="true"
                  />
                ) : null}
                {editSaving ? 'Salvando...' : 'Salvar alteracoes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete dialog */}
      {confirmDeleteId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
          }}
          onClick={() => setConfirmDeleteId(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }
          }}
        >
          <button
            type="button"
            aria-label="Fechar confirmacao"
            onClick={() => setConfirmDeleteId(null)}
            className="absolute inset-0"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#141416',
              border: '1px solid rgba(232,93,48,0.2)',
              borderRadius: 10,
              padding: 28,
              width: 360,
              maxWidth: '90vw',
              textAlign: 'center',
              position: 'relative',
              zIndex: 1,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
            }}
          >
            <Trash2
              size={32}
              style={{ color: colors.ember.primary, marginBottom: 12 }}
              aria-hidden="true"
            />
            <p
              style={{
                color: 'var(--app-text-primary)',
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              {kloelT(`Deletar webinario?`)}
            </p>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
              {kloelT(`Esta acao nao pode ser desfeita.`)}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'var(--app-text-primary)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'Sora, sans-serif',
                }}
              >
                {kloelT(`Cancelar`)}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                style={{
                  background: colors.ember.primary,
                  color:
                    '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 20px',
                  cursor: deletingId === confirmDeleteId ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'Sora, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {deletingId === confirmDeleteId ? (
                  <Loader2
                    size={14}
                    style={{ animation: 'spin 1s linear infinite' }}
                    aria-hidden="true"
                  />
                ) : null}
                {deletingId === confirmDeleteId ? 'Deletando...' : 'Deletar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}


