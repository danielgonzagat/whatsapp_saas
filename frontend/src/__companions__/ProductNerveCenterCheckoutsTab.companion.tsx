function CheckoutConfigPanel({
  ckEdit,
  rawCheckouts,
  rawPlans,
  setCkEdit,
  syncCheckoutLinks,
  updatePlan,
}: {
  ckEdit: string;
  rawCheckouts: JsonRecord[];
  rawPlans: JsonRecord[];
  setCkEdit: (value: string | null) => void;
  syncCheckoutLinks: (checkoutId: string, planIds: string[]) => Promise<unknown>;
  updatePlan: (planId: string, payload: JsonRecord) => Promise<unknown>;
}) {
  const { isMobile } = useResponsiveViewport();
  const { COUPONS } = useNerveCenterContext();
  const { showToast } = useToast();
  const {
    config: ckCfg,
    updateConfig: saveCkCfg,
    isLoading: ckLoading,
  } = useCheckoutConfig(ckEdit);
  const [ckLocal, setCkLocal] = useState<JsonRecord>({});
  const [ckSaving, setCkSaving] = useState(false);
  const [ckSaved, setCkSaved] = useState(false);
  const [linkedPlanIds, setLinkedPlanIds] = useState<string[]>([]);
  const [originalLinkedPlanIds, setOriginalLinkedPlanIds] = useState<string[]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const checkoutForCk = rawCheckouts.find((checkout) => checkout.id === ckEdit);

  useEffect(() => {
    if (ckCfg) {
      setCkLocal(ckCfg as unknown as JsonRecord);
    }
  }, [ckCfg]);

  useEffect(() => {
    const nextPlanIds = Array.isArray(checkoutForCk?.checkoutLinks)
      ? (checkoutForCk.checkoutLinks as JsonRecord[])
          .map((link) => String(link?.planId || (link?.plan as JsonRecord)?.id || '').trim())
          .filter((value: string): value is string => Boolean(value))
      : [];
    const uniquePlanIds = Array.from(new Set(nextPlanIds)) as string[];
    setLinkedPlanIds(uniquePlanIds);
    setOriginalLinkedPlanIds(uniquePlanIds);
  }, [checkoutForCk]);

  const patch = (key: string, value: JsonValue) =>
    setCkLocal((current) => ({ ...current, [key]: value }));
  const selectedPlans = rawPlans.filter((planCandidate) =>
    linkedPlanIds.includes(String(planCandidate.id)),
  );
  const availablePlans = rawPlans.filter(
    (planCandidate) => !linkedPlanIds.includes(String(planCandidate.id)),
  );
  const currentConfigSignature = JSON.stringify({
    brandName: ckLocal.brandName || '',
    enableCreditCard: ckLocal.enableCreditCard !== false,
    enablePix: ckLocal.enablePix !== false,
    enableBoleto: Boolean(ckLocal.enableBoleto),
    enableCoupon: ckLocal.enableCoupon !== false,
    autoCouponCode: ckLocal.autoCouponCode || '',
    enableTimer: Boolean(ckLocal.enableTimer),
    timerMinutes: Number(ckLocal.timerMinutes || 15),
    timerMessage: ckLocal.timerMessage || '',
    accentColor: ckLocal.accentColor || 'colors.ember.primary',
  });
  const originalConfigSignature = JSON.stringify({
    brandName: ckCfg?.brandName || '',
    enableCreditCard: ckCfg?.enableCreditCard !== false,
    enablePix: ckCfg?.enablePix !== false,
    enableBoleto: Boolean(ckCfg?.enableBoleto),
    enableCoupon: ckCfg?.enableCoupon !== false,
    autoCouponCode: ckCfg?.autoCouponCode || '',
    enableTimer: Boolean(ckCfg?.enableTimer),
    timerMinutes: Number(ckCfg?.timerMinutes || 15),
    timerMessage: ckCfg?.timerMessage || '',
    accentColor: ckCfg?.accentColor || 'colors.ember.primary',
  });
  const hasUnsavedChanges =
    currentConfigSignature !== originalConfigSignature ||
    JSON.stringify(linkedPlanIds) !== JSON.stringify(originalLinkedPlanIds);

  const handleSave = async () => {
    setCkSaving(true);
    try {
      const { id, planId, plan, createdAt, updatedAt, pixels, ...rest } = ckLocal;
      await saveCkCfg(rest);
      await syncCheckoutLinks(ckEdit, linkedPlanIds);
      if (checkoutForCk && ckLocal.brandName !== checkoutForCk.name) {
        await updatePlan(ckEdit, { name: ckLocal.brandName || checkoutForCk.name });
      }
      setCkSaved(true);
      setTimeout(() => setCkSaved(false), 2000);
      showToast('Checkout salvo', 'success');
      return true;
    } catch (error) {
      console.error('Checkout config save error:', error);
      showToast(error instanceof Error ? error.message : 'Erro ao salvar checkout', 'error');
      return false;
    } finally {
      setCkSaving(false);
    }
  };

  const handleBack = async (saveBeforeExit: boolean) => {
    if (saveBeforeExit) {
      const didSave = await handleSave();
      if (!didSave) {
        return;
      }
    }
    setShowExitConfirm(false);
    setCkEdit(null);
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: isMobile ? 'stretch' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <Bt onClick={() => (hasUnsavedChanges ? setShowExitConfirm(true) : setCkEdit(null))}>
          {kloelT(`← Checkouts`)}
        </Bt>
        <span style={{ fontSize: 13, fontWeight: 600, color: V.t }}>
          {kloelT(`Configurações —`)} {String(checkoutForCk?.name || 'Checkout')}
        </span>
      </div>
      {ckLoading ? (
        <PanelLoadingState
          compact
          label={kloelT(`Sincronizando checkout`)}
          description={kloelT(
            `O shell do produto permanece montado enquanto a configuração comercial é carregada.`,
          )}
        />
      ) : (
        <div style={{ ...cs, padding: isMobile ? 16 : 24 }}>
          <div
            style={{
              padding: '12px 14px',
              marginBottom: 16,
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
            }}
          >
            <div style={{ fontSize: 12, color: V.t2, lineHeight: 1.7 }}>
              {kloelT(`Configure o checkout por preenchimento manual: nome comercial, meios de pagamento,
              cupom, urgência e planos vinculados. Ao voltar, o painel pergunta se deseja salvar as
              alterações desta edição.`)}
            </div>
          </div>
          <Fd
            label={kloelT(`Nome / Descrição *`)}
            value={String(ckLocal.brandName ?? '')}
            onChange={(value) => patch('brandName', value)}
            full
          />
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            {kloelT(`Pagamento`)}
          </h4>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: V.t2,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={ckLocal.enableCreditCard !== false}
                onChange={(event) => patch('enableCreditCard', event.target.checked)}
                style={{ accentColor: V.em, width: 16, height: 16 }}
              />

              {kloelT(`Cartão de crédito`)}
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: V.t2,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={ckLocal.enablePix !== false}
                onChange={(event) => patch('enablePix', event.target.checked)}
                style={{ accentColor: V.em, width: 16, height: 16 }}
              />

              {kloelT(`Pix`)}
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: V.t2,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(ckLocal.enableBoleto)}
                onChange={(event) => patch('enableBoleto', event.target.checked)}
                style={{ accentColor: V.em, width: 16, height: 16 }}
              />

              {kloelT(`Boleto`)}
            </label>
          </div>
          <Dv />
          <Tg
            label={kloelT(`Cupom de desconto?`)}
            checked={ckLocal.enableCoupon !== false}
            onChange={(value) => patch('enableCoupon', value)}
          />
          {ckLocal.enableCoupon !== false ? (
            <Fd label={kloelT(`Cupom automático`)}>
              <select
                style={is}
                value={String(ckLocal.autoCouponCode ?? '')}
                onChange={(event) => patch('autoCouponCode', event.target.value)}
              >
                <option value="">{kloelT(`Selecione um cupom...`)}</option>
                {COUPONS.map((coupon) => (
                  <option key={coupon.id} value={coupon.code}>
                    {coupon.code} ({coupon.type}
                    {coupon.type === '%'
                      ? `${coupon.val}% OFF`
                      : 'R$ ' +
                        Number(coupon.val || 0).toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }) +
                        ' OFF'}
                    )
                  </option>
                ))}
              </select>
            </Fd>
          ) : null}
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            {kloelT(`Contador`)}
          </h4>
          <Tg
            label={kloelT(`Usar contador?`)}
            checked={Boolean(ckLocal.enableTimer)}
            onChange={(value) => patch('enableTimer', value)}
          />
          {ckLocal.enableTimer ? (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
              <Fd
                label={kloelT(`Minutos`)}
                value={String(ckLocal.timerMinutes || 15)}
                onChange={(value) => patch('timerMinutes', Number.parseInt(value, 10) || 15)}
              />
              <Fd
                label={kloelT(`Mensagem`)}
                value={String(ckLocal.timerMessage ?? '')}
                onChange={(value) => patch('timerMessage', value)}
              />
            </div>
          ) : null}
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            {kloelT(`Personalizar`)}
          </h4>
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: V.t3,
                marginBottom: 4,
                display: 'block',
              }}
            >
              {kloelT(`Cor principal`)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={String(ckLocal.accentColor ?? 'colors.ember.primary')}
                onChange={(e) => patch('accentColor', e.target.value)}
                style={{
                  width: 36,
                  height: 36,
                  padding: 0,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                value={String(ckLocal.accentColor ?? 'colors.ember.primary')}
                onChange={(e) => patch('accentColor', e.target.value)}
                style={{
                  flex: 1,
                  background: V.e,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                  color: V.t,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
                placeholder={kloelT(`colors.ember.primary`)}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: V.t3,
                marginBottom: 4,
                display: 'block',
              }}
            >
              {kloelT(`Cor fundo`)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={String(
                  ckLocal.backgroundColor ||
                    (ckLocal.theme === 'NOIR' ? 'colors.background.void' : '#ffffff'),
                )}
                onChange={(e) => patch('backgroundColor', e.target.value)}
                style={{
                  width: 36,
                  height: 36,
                  padding: 0,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                value={String(
                  ckLocal.backgroundColor ||
                    (ckLocal.theme === 'NOIR' ? 'colors.background.void' : '#ffffff'),
                )}
                onChange={(e) => patch('backgroundColor', e.target.value)}
                style={{
                  flex: 1,
                  background: V.e,
                  border: `1px solid ${V.b}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                  color: V.t,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
                placeholder={ckLocal.theme === 'NOIR' ? 'colors.background.void' : '#ffffff'}
              />
            </div>
          </div>
          <Fd
            label={kloelT(`Texto do botão`)}
            value={String(ckLocal.btnFinalizeText ?? 'Finalizar compra')}
            onChange={(value) => patch('btnFinalizeText', value)}
            full
          />
          <Fd label={kloelT(`Layout`)}>
            <select
              style={is}
              value={String(ckLocal.theme ?? 'BLANC')}
              onChange={(event) => patch('theme', event.target.value)}
            >
              <option value="NOIR">{kloelT(`Noir (Escuro)`)}</option>
              <option value="BLANC">{kloelT(`Blanc (Claro)`)}</option>
            </select>
          </Fd>
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            {kloelT(`Planos vinculados`)}
          </h4>
          {selectedPlans.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {selectedPlans.map((planCandidate) => (
                <button
                  key={String(planCandidate.id)}
                  type="button"
                  onClick={() =>
                    setLinkedPlanIds((current) =>
                      current.filter((candidateId) => candidateId !== String(planCandidate.id)),
                    )
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 12px',
                    borderRadius: 999,
                    border: `1px solid ${V.em}35`,
                    background: `${V.em}12`,
                    color: V.t,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  <span>{String(planCandidate.name)}</span>
                  <span style={{ color: V.em, fontFamily: M }}>
                    {formatBrlCents(Number(planCandidate.priceInCents || 0))}
                  </span>
                  <span style={{ color: V.t3 }}>×</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ ...cs, padding: 14, marginBottom: 14, background: V.e }}>
              <span style={{ display: 'block', fontSize: 12, color: V.t, marginBottom: 6 }}>
                {kloelT(`Nenhum plano vinculado`)}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: V.t2, lineHeight: 1.6 }}>
                {kloelT(`Este checkout ainda não gera links públicos. Vincule pelo menos um plano para
                liberar URLs de compra em \`Planos → Ver links\`.`)}
              </span>
            </div>
          )}
          {rawPlans.length === 0 ? (
            <div
              style={{
                ...cs,
                padding: 14,
                background: `${V.y}10`,
                border: `1px solid ${V.y}25`,
                marginBottom: 14,
              }}
            >
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: V.t }}>
                {kloelT(`Nenhum plano criado`)}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: V.t2, lineHeight: 1.6 }}>
                {kloelT(`Crie ao menos um plano em`)}{' '}
                <strong style={{ color: V.t }}>{kloelT(`Planos`)}</strong>{' '}
                {kloelT(`antes de
                vincular este checkout.`)}
              </span>
            </div>
          ) : null}
          {availablePlans.length > 0 ? (
            <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
              {availablePlans.map((planCandidate) => (
                <button
                  key={String(planCandidate.id)}
                  type="button"
                  onClick={() =>
                    setLinkedPlanIds((current) => {
                      const pid = String(planCandidate.id);
                      return current.includes(pid) ? current : [...current, pid];
                    })
                  }
                  style={{
                    ...cs,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    background: V.e,
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: V.t }}>
                      {String(planCandidate.name)}
                    </span>
                    <span style={{ fontSize: 10, color: V.t3 }}>
                      {formatBrlCents(Number(planCandidate.priceInCents || 0))} ·{' '}
                      {Number(planCandidate.quantity || 1)} item
                      {Number(planCandidate.quantity || 1) === 1 ? '' : 's'}
                    </span>
                  </div>
                  <Bg color={V.g2}>{kloelT(`Adicionar`)}</Bg>
                </button>
              ))}
            </div>
          ) : null}
          <Dv />
          <h4 style={{ fontSize: 14, fontWeight: 600, color: V.t, margin: '0 0 12px' }}>
            {kloelT(`Social Proof`)}
          </h4>
          <Tg
            label={kloelT(`Depoimentos?`)}
            checked={ckLocal.enableTestimonials !== false}
            onChange={(value) => patch('enableTestimonials', value)}
          />
          <Tg
            label={kloelT(`Garantia?`)}
            checked={ckLocal.enableGuarantee !== false}
            onChange={(value) => patch('enableGuarantee', value)}
          />
          <Dv />
          <Tg
            label={kloelT(`Popup Exit Intent?`)}
            checked={Boolean(ckLocal.showCouponPopup)}
            onChange={(value) => patch('showCouponPopup', value)}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column-reverse' : 'row',
              gap: 12,
              marginTop: 20,
            }}
          >
            <Bt onClick={() => (hasUnsavedChanges ? setShowExitConfirm(true) : setCkEdit(null))}>
              {kloelT(`← Voltar`)}
            </Bt>
            <Bt
              primary
              onClick={() => void handleSave()}
              style={{ marginLeft: isMobile ? 0 : 'auto', justifyContent: 'center' }}
            >
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {ckSaved ? 'Salvo!' : ckSaving ? 'Salvando...' : 'Salvar'}
            </Bt>
          </div>
        </div>
      )}
      {showExitConfirm ? (
        <Modal title={kloelT(`Salvar alterações?`)} onClose={() => setShowExitConfirm(false)}>
          <div style={{ fontSize: 12, color: V.t2, lineHeight: 1.7 }}>
            {kloelT(`Se voce sair agora sem salvar, as alteracoes desta edicao serao descartadas.`)}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column-reverse' : 'row',
              gap: 10,
              marginTop: 18,
              justifyContent: 'flex-end',
            }}
          >
            <Bt onClick={() => void handleBack(false)}>{kloelT(`Nao`)}</Bt>
            <Bt primary onClick={() => void handleBack(true)}>
              {kloelT(`Sim`)}
            </Bt>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

