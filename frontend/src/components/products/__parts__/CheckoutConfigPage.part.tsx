function PixelsSection({ configId, planId }: { configId: string | null; planId: string }) {
  const fid = useId();
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<PixelFormState>({ type: 'META', pixelId: '', accessToken: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PixelFormState>({
    type: 'META',
    pixelId: '',
    accessToken: '',
  });

  const loadPixels = useCallback(async () => {
    if (!planId) {
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/checkout/plans/${planId}/config`);
      const data = res.data as { pixels?: Pixel[] } | undefined;
      setPixels(Array.isArray(data?.pixels) ? data.pixels : []);
    } catch {
      setPixels([]);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadPixels();
  }, [loadPixels]);

  const handleCreate = async () => {
    if (!configId || !form.pixelId.trim()) {
      setError('Informe o ID do pixel');
      return;
    }
    setSaving(true);
    setError('');
    const res = await apiFetch(`/checkout/config/${configId}/pixels`, {
      method: 'POST',
      body: form,
    });
    if (res.error) {
      setError(res.error);
    } else {
      setShowAdd(false);
      setForm({ type: 'META', pixelId: '', accessToken: '' });
      mutate((key: unknown) => typeof key === 'string' && key.startsWith('/checkout'));
      await loadPixels();
    }
    setSaving(false);
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    setError('');
    const res = await apiFetch(`/checkout/pixels/${id}`, { method: 'PUT', body: editForm });
    if (res.error) {
      setError(res.error);
    } else {
      setEditId(null);
      await loadPixels();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/checkout/pixels/${id}`, { method: 'DELETE' });
    await loadPixels();
  };

  const updateCreateForm = (patch: Partial<PixelFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateEditPixelForm = (patch: Partial<PixelFormState>) => {
    setEditForm((current) => ({ ...current, ...patch }));
  };

  const startEditingPixel = (pixel: Pixel) => {
    setEditId(pixel.id);
    setEditForm({
      type: pixel.type,
      pixelId: pixel.pixelId,
      accessToken: pixel.accessToken || '',
    });
  };

  const closeAddPanel = () => {
    setShowAdd(false);
    setError('');
  };

  if (!configId) {
    return (
      <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: SECONDARY }}>
        {kloelT(`Salve o plano primeiro para configurar pixels.`)}
      </p>
    );
  }

  return (
    <div>
      {loading && (
        <p style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: SECONDARY }}>
          {kloelT(`Carregando pixels...`)}
        </p>
      )}
      {pixels.map((pixel) => (
        <PixelRow
          key={pixel.id}
          pixel={pixel}
          isEditing={editId === pixel.id}
          editForm={editForm}
          saving={saving}
          onEditFormChange={updateEditPixelForm}
          onSaveEdit={() => void handleUpdate(pixel.id)}
          onCancelEdit={() => setEditId(null)}
          onStartEdit={() => startEditingPixel(pixel)}
          onDelete={() => void handleDelete(pixel.id)}
        />
      ))}
      {pixels.length === 0 && !loading && (
        <p
          style={{ fontFamily: "'Sora', sans-serif", fontSize: 12, color: FAINT, marginBottom: 12 }}
        >
          {kloelT(`Nenhum pixel configurado.`)}
        </p>
      )}
      {showAdd ? (
        <PixelAddPanel
          fid={fid}
          form={form}
          saving={saving}
          error={error}
          onFormChange={updateCreateForm}
          onCreate={() => void handleCreate()}
          onCancel={closeAddPanel}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          style={{
            padding: '8px 16px',
            background: 'none',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: EMBER,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {kloelT(`+ Adicionar pixel`)}
        </button>
      )}
    </div>
  );
}

/* ── Main Component ── */

export function CheckoutConfigPage({ planId, config, onSave }: Props) {
  const fid = useId();
  const [state, setState] = useState<CheckoutConfigState>({
    checkoutName: '',
    enableBoleto: false,
    enableCreditCard: false,
    enablePix: false,
    chatEnabled: false,
    chatWelcomeMessage: '',
    chatDelay: 5,
    chatPosition: 'bottom-right',
    chatColor: 'colors.ember.primary',
    chatOfferDiscount: false,
    chatDiscountCode: '',
    chatSupportPhone: '',
    enableCoupon: false,
    enableTimer: false,
    timerMinutes: 10,
    timerMessage: '',
    socialProofEnabled: false,
    socialProofCustomNames: '',
    enableSteps: false,
  });

  useEffect(() => {
    if (config) {
      setState((prev) => ({ ...prev, ...config }));
    }
  }, [config]);

  const set = (key: string, value: unknown) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div
      style={{
        backgroundColor: VOID,
        minHeight: '100vh',
        padding: '32px 0',
        fontFamily: "'Sora', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '0 24px',
        }}
      >
        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 20,
              fontWeight: 700,
              color: TEXT,
              margin: 0,
              marginBottom: 6,
            }}
          >
            {kloelT(`Configurar Checkout`)}
          </h1>
          <p
            style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: 13,
              color: SECONDARY,
              margin: 0,
            }}
          >
            {kloelT(`Plano ID:`)}{' '}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: FAINT }}>
              {planId}
            </span>
          </p>
        </div>

        {/* Content card */}
        <div
          style={{
            backgroundColor: ELEVATED,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: 28,
          }}
        >
          {/* ── Section 1: Descricao ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Descricao`)}</h3>
          <div>
            <label style={labelStyle} htmlFor={`${fid}-checkout-name`}>
              {kloelT(`Nome do checkout`)}
            </label>
            <input
              aria-label="Nome do checkout"
              type="text"
              value={state.checkoutName}
              onChange={(e) => set('checkoutName', e.target.value)}
              placeholder={kloelT(`Ex: Checkout principal`)}
              style={inputStyle}
              id={`${fid}-checkout-name`}
            />
          </div>

          <hr style={dividerStyle} />

          {/* ── Section 2: Pagamento ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Pagamento`)}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Checkbox
              checked={state.enableBoleto}
              onChange={(v) => set('enableBoleto', v)}
              label={kloelT(`Boleto`)}
            />
            <Checkbox
              checked={state.enableCreditCard}
              onChange={(v) => set('enableCreditCard', v)}
              label={kloelT(`Cartao`)}
            />
            <Checkbox
              checked={state.enablePix}
              onChange={(v) => set('enablePix', v)}
              label={kloelT(`Pix`)}
            />
          </div>

          <hr style={dividerStyle} />

          {/* ── Section 3: Chat Kloel ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Chat Kloel`)}</h3>
          <ToggleRow
            label={kloelT(`Ativar chat no checkout`)}
            checked={state.chatEnabled}
            onChange={(v) => set('chatEnabled', v)}
          />

          {state.chatEnabled && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle} htmlFor={`${fid}-welcome`}>
                  {kloelT(`Mensagem de boas-vindas`)}
                </label>
                <input
                  type="text"
                  value={state.chatWelcomeMessage}
                  onChange={(e) => set('chatWelcomeMessage', e.target.value)}
                  placeholder={kloelT(`Ola! Posso te ajudar?`)}
                  style={inputStyle}
                  id={`${fid}-welcome`}
                />
              </div>

              <div>
                <label style={labelStyle} htmlFor={`${fid}-delay`}>
                  {kloelT(`Delay (segundos)`)}
                </label>
                <input
                  aria-label="Delay em segundos"
                  type="number"
                  value={state.chatDelay}
                  onChange={(e) => set('chatDelay', Number(e.target.value))}
                  min={0}
                  style={{ ...inputStyle, maxWidth: 120 }}
                  id={`${fid}-delay`}
                />
              </div>

              <div>
                <span style={labelStyle}>{kloelT(`Posicao do chat`)}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                  <Radio
                    checked={state.chatPosition === 'bottom-right'}
                    onChange={() => set('chatPosition', 'bottom-right')}
                    label={kloelT(`Canto inferior direito`)}
                  />
                  <Radio
                    checked={state.chatPosition === 'bottom-left'}
                    onChange={() => set('chatPosition', 'bottom-left')}
                    label={kloelT(`Canto inferior esquerdo`)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`${fid}-chatcolor`} style={labelStyle}>
                  {kloelT(`Cor do chat`)}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    id={`${fid}-chatcolor`}
                    type="color"
                    value={state.chatColor}
                    onChange={(e) => set('chatColor', e.target.value)}
                    style={{
                      width: 36,
                      height: 36,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 6,
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                  />
                  <input
                    aria-label="Cor do chat"
                    type="text"
                    value={state.chatColor}
                    onChange={(e) => set('chatColor', e.target.value)}
                    style={{
                      ...inputStyle,
                      maxWidth: 120,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 12,
                    }}
                  />
                </div>
              </div>

              <ToggleRow
                label={kloelT(`Oferecer desconto via chat`)}
                checked={state.chatOfferDiscount}
                onChange={(v) => set('chatOfferDiscount', v)}
              />

              {state.chatOfferDiscount && (
                <div>
                  <label style={labelStyle} htmlFor={`${fid}-discount-code`}>
                    {kloelT(`Codigo do desconto`)}
                  </label>
                  <input
                    type="text"
                    value={state.chatDiscountCode}
                    onChange={(e) => set('chatDiscountCode', e.target.value)}
                    placeholder={kloelT(`Ex: BEMVINDO10`)}
                    style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
                    id={`${fid}-discount-code`}
                  />
                </div>
              )}

              <div>
                <label style={labelStyle} htmlFor={`${fid}-phone`}>
                  {kloelT(`Telefone de suporte`)}
                </label>
                <input
                  aria-label="Telefone de suporte"
                  type="text"
                  value={state.chatSupportPhone}
                  onChange={(e) => set('chatSupportPhone', e.target.value)}
                  placeholder={kloelT(`+55 11 99999-9999`)}
                  style={inputStyle}
                  id={`${fid}-phone`}
                />
              </div>
            </div>
          )}

          <hr style={dividerStyle} />

          {/* ── Section 4: Cupom ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Cupom`)}</h3>
          <ToggleRow
            label={kloelT(`Permitir cupom de desconto`)}
            checked={state.enableCoupon}
            onChange={(v) => set('enableCoupon', v)}
          />

          <hr style={dividerStyle} />

          {/* ── Section 5: Timer ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Timer`)}</h3>
          <ToggleRow
            label={kloelT(`Ativar timer de urgencia`)}
            checked={state.enableTimer}
            onChange={(v) => set('enableTimer', v)}
          />

          {state.enableTimer && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle} htmlFor={`${fid}-minutes`}>
                  {kloelT(`Minutos`)}
                </label>
                <input
                  type="number"
                  value={state.timerMinutes}
                  onChange={(e) => set('timerMinutes', Number(e.target.value))}
                  min={1}
                  style={{ ...inputStyle, maxWidth: 120 }}
                  id={`${fid}-minutes`}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor={`${fid}-timer-msg`}>
                  {kloelT(`Mensagem do timer`)}
                </label>
                <input
                  aria-label={kloelT(`Mensagem do timer`)}
                  type="text"
                  value={state.timerMessage}
                  onChange={(e) => set('timerMessage', e.target.value)}
                  placeholder={kloelT(`Oferta encerra em 15 minutos.`)}
                  style={inputStyle}
                  id={`${fid}-timer-msg`}
                />
              </div>
            </div>
          )}

          <hr style={dividerStyle} />

          {/* ── Section 6: Social Proof ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Social Proof`)}</h3>
          <ToggleRow
            label={kloelT(`Ativar prova social`)}
            checked={state.socialProofEnabled}
            onChange={(v) => set('socialProofEnabled', v)}
          />

          {state.socialProofEnabled && (
            <div style={{ marginTop: 20 }}>
              <label style={labelStyle} htmlFor={`${fid}-custom-names`}>
                {kloelT(`Nomes personalizados (um por linha)`)}
              </label>
              <textarea
                value={state.socialProofCustomNames}
                onChange={(e) => set('socialProofCustomNames', e.target.value)}
                placeholder={kloelT(`Maria S. de Sao Paulo\nJoao P. de Curitiba\nAna L. de Recife`)}
                style={textareaStyle}
                id={`${fid}-custom-names`}
              />
            </div>
          )}

          <hr style={dividerStyle} />

          {/* ── Section 7: Etapas ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Etapas`)}</h3>
          <ToggleRow
            label={kloelT(`Exibir etapas no checkout`)}
            checked={state.enableSteps}
            onChange={(v) => set('enableSteps', v)}
          />

          <hr style={dividerStyle} />

          {/* ── Section 8: Pixels ── */}
          <h3 style={sectionTitleStyle}>{kloelT(`Pixels de Rastreamento`)}</h3>
          <PixelsSection configId={config?.id || null} planId={planId} />

          <hr style={dividerStyle} />

          {/* ── Save Button ── */}
          <button
            type="button"
            onClick={() => onSave(state)}
            style={{
              width: '100%',
              backgroundColor: EMBER,
              color: TEXT_ON_ACCENT,
              border: 'none',
              borderRadius: 6,
              padding: '14px 24px',
              fontFamily: "'Sora', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            }}
          >
            <Save size={16} aria-hidden="true" />

            {kloelT(`Salvar configuracoes`)}
          </button>
        </div>
      </div>
    </div>
  );
}

