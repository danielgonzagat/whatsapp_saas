/* ═══════════════════════════════════════════════
   INVITE MODAL
   ═══════════════════════════════════════════════ */

function InviteModal({ onClose }: { onClose: () => void }) {
  const fid = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('manager');
  const [sending, setSending] = useState(false);

  const inviteRoles = ROLES.filter((r) => r.value !== 'admin');

  const handleSubmit = async () => {
    if (!email.trim()) {
      return;
    }
    setSending(true);
    try {
      await inviteCollaborator({ email, role });
      onClose();
    } catch (e) {
      console.error('Failed to invite', e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label="Fechar modal"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: 28,
          animation: 'slideIn 200ms ease',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <span style={{ color: C.secondary }}>{IC.x(16)}</span>
        </button>
        <h2
          style={{
            fontFamily: FONT.sans,
            fontSize: 18,
            fontWeight: 700,
            color: C.text,
            margin: '0 0 4px',
          }}
        >
          {kloelT(`Convidar Colaborador`)}
        </h2>
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '0 0 24px' }}>
          {kloelT(`Envie um convite por email para adicionar um novo membro a equipe.`)}
        </p>

        {/* Email */}
        <label
          style={{
            fontFamily: FONT.sans,
            fontSize: 12,
            fontWeight: 500,
            color: C.secondary,
            display: 'block',
            marginBottom: 6,
          }}
          htmlFor={`${fid}-email`}
        >
          {kloelT(`Email`)}
        </label>
        <input
          aria-label="Email do colaborador"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={kloelT(`colaborador@email.com`)}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            color: C.text,
            fontFamily: FONT.sans,
            fontSize: 13,
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box' as const,
          }}
          id={`${fid}-email`}
        />

        {/* Role selector (4 roles, no admin) */}
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 12,
            fontWeight: 500,
            color: C.secondary,
            display: 'block',
            marginBottom: 6,
          }}
        >
          {kloelT(`Funcao`)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          {inviteRoles.map((r) => (
            <button
              type="button"
              key={r.value}
              onClick={() => setRole(r.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: role === r.value ? C.emberBg : C.bg,
                border: `1px solid ${role === r.value ? C.ember : C.border}`,
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'left' as const,
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
              <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 500, color: C.text }}>
                {r.label}
              </span>
              {role === r.value && (
                <span style={{ marginLeft: 'auto', color: C.ember }}>{IC.check(14)}</span>
              )}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              background: 'none',
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.secondary,
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Cancelar`)}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending || !email.trim()}
            style={{
              padding: '9px 22px',
              background: C.ember,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 600,
              cursor: sending ? 'wait' : 'pointer',
              opacity: !email.trim() ? 0.5 : 1,
            }}
          >
            {sending ? 'Enviando...' : 'Enviar Convite'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AffiliateInviteModal({ onClose }: { onClose: () => void }) {
  const fid = useId();
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [commissionRate, setCommissionRate] = useState('30');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!partnerName.trim() || !partnerEmail.trim()) {
      setError('Preencha nome e email do afiliado.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await createAffiliate({
        partnerName: partnerName.trim(),
        partnerEmail: partnerEmail.trim(),
        type: 'AFFILIATE',
        commissionRate: commissionRate.trim() ? Number(commissionRate) : undefined,
      });
      onClose();
    } catch (affiliateError: unknown) {
      setError(
        affiliateError instanceof Error
          ? affiliateError.message
          : 'Nao foi possivel enviar o convite agora.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label="Fechar modal"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: C.bgOverlay,
          backdropFilter: 'blur(4px)',
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 460,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: 28,
          animation: 'slideIn 200ms ease',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <span style={{ color: C.secondary }}>{IC.x(16)}</span>
        </button>
        <h2
          style={{
            fontFamily: FONT.sans,
            fontSize: 18,
            fontWeight: 700,
            color: C.text,
            margin: '0 0 4px',
          }}
        >
          {kloelT(`Convidar afiliado`)}
        </h2>
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.secondary, margin: '0 0 20px' }}>
          {kloelT(
            `A Kloel envia um convite por email. Quando o afiliado concluir o cadastro, a conta dele é provisionada automaticamente no seu programa.`,
          )}
        </p>

        <div
          style={{
            display: 'grid',
            gap: 14,
          }}
        >
          <div>
            <label
              htmlFor={`${fid}-affiliate-name`}
              style={{
                display: 'block',
                marginBottom: 6,
                fontFamily: FONT.sans,
                fontSize: 12,
                fontWeight: 500,
                color: C.secondary,
              }}
            >
              {kloelT(`Nome do afiliado`)}
            </label>
            <input
              id={`${fid}-affiliate-name`}
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder={kloelT(`Ex.: Ana Souza`)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT.sans,
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>

          <div>
            <label
              htmlFor={`${fid}-affiliate-email`}
              style={{
                display: 'block',
                marginBottom: 6,
                fontFamily: FONT.sans,
                fontSize: 12,
                fontWeight: 500,
                color: C.secondary,
              }}
            >
              {kloelT(`Email do afiliado`)}
            </label>
            <input
              id={`${fid}-affiliate-email`}
              type="email"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
              placeholder={kloelT(`afiliado@email.com`)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT.sans,
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>

          <div>
            <label
              htmlFor={`${fid}-affiliate-commission`}
              style={{
                display: 'block',
                marginBottom: 6,
                fontFamily: FONT.sans,
                fontSize: 12,
                fontWeight: 500,
                color: C.secondary,
              }}
            >
              {kloelT(`Comissão inicial (%)`)}
            </label>
            <input
              id={`${fid}-affiliate-commission`}
              type="number"
              min={0}
              max={100}
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT.sans,
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            background: C.infoBg,
            border: `1px solid color-mix(in srgb, ${C.info} 14%, transparent)`,
            borderRadius: 6,
            fontFamily: FONT.sans,
            fontSize: 12,
            color: C.secondary,
            lineHeight: 1.6,
          }}
        >
          {kloelT(
            `O afiliado entra como pendente até concluir o cadastro dele. Depois disso, a conta de afiliado é criada automaticamente e o status muda para ativo.`,
          )}
        </div>

        {error ? (
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              background: C.errorBg,
              border: `1px solid color-mix(in srgb, ${C.error} 14%, transparent)`,
              borderRadius: 6,
              fontFamily: FONT.sans,
              fontSize: 12,
              color: C.error,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              background: 'none',
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.secondary,
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {kloelT(`Cancelar`)}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending}
            style={{
              padding: '9px 22px',
              background: C.ember,
              border: 'none',
              borderRadius: 6,
              color: C.textOnAccent,
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 600,
              cursor: sending ? 'wait' : 'pointer',
              opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? 'Enviando...' : 'Enviar convite'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   AFFILIATE DETAIL MODAL
   ═══════════════════════════════════════════════ */

function AffiliateDetailModal({
  affiliate,
  onClose,
  onChat,
  onRevoke,
}: {
  affiliate: Affiliate;
  onClose: () => void;
  onChat: () => void;
  onRevoke: () => void;
}) {
  const router = useRouter();
  const a = affiliate || ({} as Affiliate);
  const [perfData, setPerfData] = useState<AffiliatePerformance | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    if (!a.id) {
      return;
    }
    setPerfLoading(true);
    partnershipsApi
      .affiliatePerformance(a.id)
      .then((res) => {
        if (!res.error && res.data) {
          setPerfData(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setPerfLoading(false));
  }, [a.id]);

  const totalSales = perfData?.totalSales ?? a.totalSales ?? 0;
  const totalRevenue = perfData?.totalRevenue ?? a.revenue ?? 0;
  const commission = perfData?.commission ?? a.commission ?? 0;

  const statCards = [
    { label: 'Vendas', value: totalSales, icon: IC.box, color: C.text },
    { label: 'Comissao', value: `${commission}%`, icon: IC.dollar, color: C.ember },
    {
      label: 'Receita',
      value: 'R$ ' + Number(totalRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 0 }),
      icon: IC.trend,
      color: C.text,
    },
    {
      label: 'Temperatura',
      value: `${a.temperature || 0}`,
      icon: IC.star,
      color: (a.temperature || 0) > 70 ? '#10B981' : '#F59E0B',
    },
  ];

  // Performance chart — use real data from performance endpoint or fall back to empty
  const rawChartData: number[] =
    perfData?.monthlyPerformance || a.monthlyPerformance || new Array(12).fill(0);
  const chartData = rawChartData.map((value, idx) => ({
    value,
    label: MONTH_LABELS[idx] ?? `m${idx}`,
  }));
  const chartMax = Math.max(...rawChartData, 1);

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(
        `${process.env.NEXT_PUBLIC_SITE_URL || 'https://kloel.com'}/ref/${a.id || 'unknown'}`,
      )
      .catch(() => {});
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        aria-label="Fechar modal"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: 28,
          maxHeight: '85vh',
          overflowY: 'auto' as const,
          animation: 'slideIn 200ms ease',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <span style={{ color: C.secondary }}>{IC.x(16)}</span>
        </button>

        {/* Profile header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: a.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.emberBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT.sans,
              fontSize: 22,
              fontWeight: 700,
              color: a.type === 'producer' ? '#8B5CF6' : C.ember,
            }}
          >
            {(a.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <h2
              style={{
                fontFamily: FONT.sans,
                fontSize: 18,
                fontWeight: 700,
                color: C.text,
                margin: 0,
              }}
            >
              {a.name}
            </h2>
            <p
              style={{
                fontFamily: FONT.sans,
                fontSize: 13,
                color: C.secondary,
                margin: '2px 0 6px',
              }}
            >
              {a.email}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: FONT.sans,
                  color: a.type === 'producer' ? '#8B5CF6' : C.ember,
                  background: a.type === 'producer' ? 'rgba(139,92,246,0.15)' : C.emberStrong,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {a.type === 'producer' ? 'Produtor' : 'Afiliado'}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: FONT.sans,
                  color: a.status === 'active' ? '#10B981' : '#F59E0B',
                  background:
                    a.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase' as const,
                }}
              >
                {a.status === 'active' ? 'Ativo' : 'Pendente'}
              </span>
            </div>
          </div>
        </div>

        {/* TempBar */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary }}>
              {kloelT(`Temperatura`)}
            </span>
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 11,
                color: (a.temperature || 0) > 70 ? '#10B981' : '#F59E0B',
                fontWeight: 600,
              }}
            >
              {a.temperature || 0}%
            </span>
          </div>
          <TempBar
            value={a.temperature || 0}
            max={100}
            color={(a.temperature || 0) > 70 ? '#10B981' : '#F59E0B'}
          />
        </div>

        {/* 4 stat cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            marginBottom: 20,
            opacity: perfLoading ? 0.5 : 1,
            transition: 'opacity 200ms ease',
          }}
        >
          {statCards.map((sc) => (
            <div
              key={sc.label}
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: '14px 12px',
                textAlign: 'center' as const,
              }}
            >
              <span style={{ color: C.muted }}>{sc.icon(14)}</span>
              <div
                style={{
                  fontFamily: FONT.mono,
                  fontSize: 18,
                  fontWeight: 700,
                  color: sc.color,
                  marginTop: 4,
                }}
              >
                {sc.value}
              </div>
              <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.muted, marginTop: 2 }}>
                {sc.label}
              </div>
            </div>
          ))}
        </div>

        {/* Performance chart (simple bar chart) */}
        <div style={{ marginBottom: 20 }}>
          <h4
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              marginBottom: 10,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.04em',
            }}
          >
            {kloelT(`Performance (12 meses)`)}
          </h4>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 4,
              height: 80,
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '12px 14px',
            }}
          >
            {chartData.map((point) => (
              <div
                key={`chart-bar-${point.label}`}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${(point.value / chartMax) * 56}px`,
                    background: C.ember,
                    borderRadius: 2,
                    opacity: 0.6 + (point.value / chartMax) * 0.4,
                    transition: 'height 300ms ease',
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 9, color: C.muted }}>
              {kloelT(`Jan`)}
            </span>
            <span style={{ fontFamily: FONT.sans, fontSize: 9, color: C.muted }}>
              {kloelT(`Jun`)}
            </span>
            <span style={{ fontFamily: FONT.sans, fontSize: 9, color: C.muted }}>
              {kloelT(`Dez`)}
            </span>
          </div>
        </div>

        {/* Products list */}
        <div style={{ marginBottom: 20 }}>
          <h4
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              marginBottom: 10,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.04em',
            }}
          >
            {kloelT(`Produtos`)}
          </h4>
          {a.products && a.products.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
              {a.products.map((p: string) => (
                <span
                  key={p}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    background: C.bg,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    fontFamily: FONT.sans,
                    fontSize: 12,
                    color: C.text,
                  }}
                >
                  <span style={{ color: C.muted }}>{IC.box(12)}</span>
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.muted }}>
              {kloelT(`Nenhum produto vinculado`)}
            </p>
          )}
        </div>

        {/* Details */}
        <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary }}>
              {kloelT(`Membro desde`)}
            </span>
            <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.text }}>
              {a.joined ? new Date(a.joined).toLocaleDateString('pt-BR') : '--'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary }}>
              {kloelT(`Comissao efetiva`)}
            </span>
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ember, fontWeight: 600 }}>
              {kloelT(`R$`)}{' '}
              {(((a.revenue || 0) * (a.commission || 0)) / 100).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <h4
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              marginBottom: 10,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.04em',
            }}
          >
            {kloelT(`Operacao`)}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              {
                label: 'Produtos',
                sub: 'Coproducoes e comissoes',
                action: () => router.push('/products?feature=coproducoes'),
              },
              {
                label: 'Vendas',
                sub: 'Estrategias e pipeline',
                action: () => router.push('/vendas?tab=estrategias'),
              },
              {
                label: 'Carteira',
                sub: 'Repasses e saque',
                action: () => router.push('/carteira/saldo'),
              },
            ].map((item) => (
              <button
                type="button"
                key={item.label}
                onClick={item.action}
                style={{
                  textAlign: 'left' as const,
                  padding: '12px 14px',
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: C.text }}
                >
                  {item.label}
                </div>
                <div
                  style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary, marginTop: 4 }}
                >
                  {item.sub}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onChat}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 16px',
              background: C.ember,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: '#fff' }}>{IC.chat(14)}</span>

            {kloelT(`Abrir chat`)}
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 16px',
              background: 'none',
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.text,
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: C.secondary }}>{IC.copy(14)}</span>

            {kloelT(`Copiar link`)}
          </button>
          <button
            type="button"
            onClick={onRevoke}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 16px',
              background: 'none',
              border: `1px solid rgba(239,68,68,0.3)`,
              borderRadius: 6,
              color: '#EF4444',
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <span style={{ color: '#EF4444' }}>{IC.ban(14)}</span>

            {kloelT(`Revogar`)}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB: COLABORADORES
   ═══════════════════════════════════════════════ */

function TabColaboradores({
  search,
  setSearch,
  showInviteModal: _showInviteModal,
  setShowInviteModal,
}: {
  search: string;
  setSearch: (s: string) => void;
  showInviteModal: boolean;
  setShowInviteModal: (v: boolean) => void;
}) {
  const { agents, invites } = useCollaborators();
  const { stats } = useCollaboratorStats();
  const displayAgents = agents as Agent[];

  const total = stats?.total || displayAgents.length;
  const online = stats?.online || displayAgents.filter((a) => a.status === 'online').length;
  const pendingInvites = stats?.pendingInvites || (invites as Invite[]).length || 0;
  const rolesUsed = [...new Set(displayAgents.map((a) => a.role))].length;

  const filtered = displayAgents.filter((c) => {
    if (!search) {
      return true;
    }
    const term = search.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(term) || (c.email || '').toLowerCase().includes(term)
    );
  });

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      {/* 4 stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '20px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}
            >
              {kloelT(`Total Colaboradores`)}
            </span>
            <span style={{ color: C.muted }}>{IC.users(16)}</span>
          </div>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 24,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.02em',
            }}
          >
            {total}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '20px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}
            >
              {kloelT(`Online Agora`)}
            </span>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          </div>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 24,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.02em',
            }}
          >
            {online}
          </span>
          <span style={{ fontFamily: FONT.sans, fontSize: 11, color: C.muted }}>
            {kloelT(`ativos no momento`)}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '20px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}
            >
              {kloelT(`Convites Pendentes`)}
            </span>
            <span style={{ color: C.muted }}>{IC.mail(16)}</span>
          </div>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 24,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.02em',
            }}
          >
            {pendingInvites}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '20px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, fontWeight: 500 }}
            >
              {kloelT(`Funcoes Ativas`)}
            </span>
            <span style={{ color: C.muted }}>{IC.shield(16)}</span>
          </div>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 24,
              fontWeight: 700,
              color: C.text,
              letterSpacing: '-0.02em',
            }}
          >
            {rolesUsed}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 12,
        }}
      >
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <div
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: C.muted,
            }}
          >
            {IC.search(14)}
          </div>
          <input
            aria-label="Buscar colaborador"
            type="text"
            placeholder={kloelT(`Buscar colaborador...`)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 14px 9px 34px',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.text,
              fontFamily: FONT.sans,
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 18px',
            background: C.ember,
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontFamily: FONT.sans,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <span style={{ color: '#fff' }}>{IC.plus(14)}</span>

          {kloelT(`Convidar`)}
        </button>
      </div>

      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 160px 100px 100px 120px',
          gap: 14,
          padding: '10px 18px',
          marginBottom: 4,
        }}
      >
        <span />
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          {kloelT(`Nome`)}
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          {kloelT(`Email`)}
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          {kloelT(`Funcao`)}
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          {kloelT(`Status`)}
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          {kloelT(`Ultimo acesso`)}
        </span>
      </div>

      {/* Collaborators list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((c) => {
          const roleConf = ROLES.find((r) => r.value === c.role) || ROLES[ROLES.length - 1];
          return (
            <div
              key={c.id || c.email}
              style={{
                display: 'grid',
                gridTemplateColumns: '44px 1fr 160px 100px 100px 120px',
                gap: 14,
                alignItems: 'center',
                padding: '14px 18px',
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                transition: 'border-color 150ms ease',
              }}
            >
              {/* Avatar */}
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: C.elevated,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: FONT.sans,
                    fontSize: 15,
                    fontWeight: 600,
                    color: C.text,
                  }}
                >
                  {(c.name || c.email || '?')[0].toUpperCase()}
                </div>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: c.status === 'online' ? '#10B981' : C.muted,
                    border: `2px solid ${C.card}`,
                    position: 'absolute' as const,
                    bottom: 0,
                    right: 0,
                  }}
                />
              </div>

              {/* Name */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 14,
                    fontWeight: 600,
                    color: C.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  {c.name}
                </div>
              </div>

              {/* Email */}
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 12,
                  color: C.secondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {c.email}
              </div>

              {/* Role badge */}
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: FONT.sans,
                  color: roleConf.color,
                  background: `${roleConf.color}15`,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase' as const,
                  width: 'fit-content',
                }}
              >
                {roleConf.label}
              </span>

              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: c.status === 'online' ? '#10B981' : C.muted,
                  }}
                />
                <span
                  style={{
                    fontFamily: FONT.sans,
                    fontSize: 12,
                    color: c.status === 'online' ? '#10B981' : C.muted,
                  }}
                >
                  {c.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* Date */}
              <span
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 11,
                  color: C.muted,
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {c.lastActive || ''}
              </span>
            </div>
          );
        })}

        {filtered.length === 0 && displayAgents.length === 0 && (
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '60px 20px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: 'var(--app-text-tertiary)',
                display: 'block',
                marginBottom: 8,
              }}
            >
              {kloelT(`Nenhum colaborador cadastrado`)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Convide colaboradores para gerenciar seu workspace`)}
            </span>
          </div>
        )}
        {filtered.length === 0 && displayAgents.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}
          >
            <span style={{ color: C.muted }}>{IC.users(32)}</span>
            <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.secondary, marginTop: 12 }}>
              {kloelT(`Nenhum colaborador encontrado`)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB: AFILIADOS
   ═══════════════════════════════════════════════ */

function TabAfiliados({
  search,
  setSearch,
  filterType,
  setFilterType,
  detailId,
  setDetailId,
  setShowAffiliateInviteModal,
}: {
  search: string;
  setSearch: (s: string) => void;
  filterType: string;
  setFilterType: (s: string) => void;
  detailId: string | null;
  setDetailId: (id: string | null) => void;
  setShowAffiliateInviteModal: (value: boolean) => void;
}) {
  const router = useRouter();
  const { affiliates, mutate: mutateAffiliates } = useAffiliates({ type: filterType, search });
  const { stats: affStats } = useAffiliateStats();
  const displayAffiliates = affiliates as Affiliate[];

  const activeAffiliates =
    affStats?.activeAffiliates ||
    displayAffiliates.filter((a) => a.status === 'active' && a.type === 'affiliate').length;
  const producers =
    affStats?.producers || displayAffiliates.filter((a) => a.type === 'producer').length;
  const totalRevenue =
    affStats?.totalRevenue ||
    displayAffiliates.reduce((sum: number, a) => sum + (a.revenue || 0), 0);
  const totalCommissions =
    affStats?.totalCommissions ||
    displayAffiliates.reduce(
      (sum: number, a) => sum + ((a.revenue || 0) * (a.commission || 0)) / 100,
      0,
    );
  const topPartner =
    affStats?.topPartner ||
    displayAffiliates.reduce<Affiliate | null>(
      (top, a) => (!top || (a.revenue || 0) > (top.revenue || 0) ? a : top),
      null,
    )?.name ||
    null;

  const filtered = displayAffiliates.filter((a) => {
    if (filterType !== 'todos' && a.type !== filterType) {
      return false;
    }
    if (search) {
      const term = search.toLowerCase();
      return (
        (a.name || '').toLowerCase().includes(term) || (a.email || '').toLowerCase().includes(term)
      );
    }
    return true;
  });

  const _maxRevenue = Math.max(...filtered.map((a) => a.revenue || 0), 1);

  const FILTER_OPTIONS = [
    { value: 'todos', label: 'Todos' },
    { value: 'affiliate', label: 'Afiliados' },
    { value: 'producer', label: 'Produtores' },
  ];

  const detailAffiliate = detailId ? displayAffiliates.find((a) => a.id === detailId) : null;

  const handleRevoke = async (id: string) => {
    try {
      await revokeAffiliate(id);
      mutateAffiliates();
      setDetailId(null);
    } catch (e) {
      console.error('Failed to revoke', e);
    }
  };

  return (
    <div style={{ animation: 'fadeIn 300ms ease' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          {
            title: 'Ativar coproducoes',
            desc: 'Configure reparticao e alinhamento comercial no produto certo.',
            cta: 'Abrir Produtos',
            action: () => router.push('/products?feature=coproducoes'),
          },
          {
            title: 'Revisar estrategia',
            desc: 'Use Vendas para enxergar o impacto comercial das parcerias.',
            cta: 'Abrir Vendas',
            action: () => router.push('/vendas?tab=estrategias'),
          },
          {
            title: 'Acompanhar repasses',
            desc: 'Visualize saldo, saque e antecipacao do que entrou via parceiros.',
            cta: 'Abrir Carteira',
            action: () => router.push('/carteira/saldo'),
          },
          {
            title: 'Ajustar banco e billing',
            desc: 'Garanta conta destino e configuracao de repasse antes de escalar.',
            cta: 'Abrir Configuracoes',
            action: () => router.push('/settings?section=bank'),
          },
        ].map((card) => (
          <div
            key={card.title}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '16px 16px 14px',
            }}
          >
            <div
              style={{
                fontFamily: FONT.sans,
                fontSize: 13,
                fontWeight: 600,
                color: C.text,
                marginBottom: 6,
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                fontFamily: FONT.sans,
                fontSize: 11,
                color: C.secondary,
                lineHeight: 1.5,
                minHeight: 34,
              }}
            >
              {card.desc}
            </div>
            <button
              type="button"
              onClick={card.action}
              style={{
                marginTop: 12,
                padding: '8px 14px',
                background: 'none',
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT.sans,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {card.cta}
            </button>
          </div>
        ))}
      </div>

      {/* 5 stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '18px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}
            >
              {kloelT(`Afiliados Ativos`)}
            </span>
            <span style={{ color: C.muted }}>{IC.users(14)}</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text }}>
            {activeAffiliates}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '18px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}
            >
              {kloelT(`Produtores`)}
            </span>
            <span style={{ color: C.muted }}>{IC.shield(14)}</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text }}>
            {producers}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '18px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}
            >
              {kloelT(`Receita Total`)}
            </span>
            <span style={{ color: C.ember }}>{IC.trend(14)}</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text }}>
            {kloelT(`R$`)}{' '}
            {Number(totalRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '18px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}
            >
              {kloelT(`Comissoes Pagas`)}
            </span>
            <span style={{ color: C.ember }}>{IC.dollar(14)}</span>
          </div>
          <span style={{ fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, color: C.text }}>
            {kloelT(`R$`)}{' '}
            {Number(totalCommissions).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
          </span>
        </div>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '18px 16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, fontWeight: 500 }}
            >
              {kloelT(`Top Parceiro`)}
            </span>
            <span style={{ color: C.ember }}>{IC.star(14)}</span>
          </div>
          <span
            style={{
              fontFamily: FONT.sans,
              fontSize: 14,
              fontWeight: 600,
              color: C.ember,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {topPartner || '--'}
          </span>
        </div>
      </div>

      {/* Filters + search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 12,
          flexWrap: 'wrap' as const,
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTER_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => setFilterType(opt.value)}
              style={{
                padding: '7px 14px',
                background: filterType === opt.value ? C.ember : C.card,
                border: `1px solid ${filterType === opt.value ? C.ember : C.border}`,
                borderRadius: 6,
                color: filterType === opt.value ? '#fff' : C.secondary,
                fontFamily: FONT.sans,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
          <div style={{ position: 'relative', width: 280 }}>
            <div
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: C.muted,
              }}
            >
              {IC.search(14)}
            </div>
            <input
              aria-label="Buscar parceiro"
              type="text"
              placeholder={kloelT(`Buscar parceiro...`)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 14px 9px 34px',
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT.sans,
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowAffiliateInviteModal(true)}
            style={{
              padding: '9px 14px',
              background: C.ember,
              border: 'none',
              borderRadius: 6,
              color: C.textOnAccent,
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {kloelT(`Convidar afiliado`)}
          </button>
        </div>
      </div>

      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '46px 1fr 90px 70px 110px 90px 60px 100px',
          gap: 10,
          padding: '10px 18px',
          marginBottom: 4,
        }}
      >
        <span />
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          {kloelT(`Parceiro`)}
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          {kloelT(`Tipo`)}
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            textAlign: 'right' as const,
          }}
        >
          {kloelT(`Vendas`)}
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            textAlign: 'right' as const,
          }}
        >
          {kloelT(`Receita`)}
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            textAlign: 'right' as const,
          }}
        >
          {kloelT(`Comissao`)}
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
            textAlign: 'right' as const,
          }}
        >
          {kloelT(`Taxa`)}
        </span>
        <span
          style={{
            fontFamily: FONT.sans,
            fontSize: 11,
            color: C.muted,
            fontWeight: 500,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.05em',
          }}
        >
          {kloelT(`Temperatura`)}
        </span>
      </div>

      {/* Affiliates list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((a) => (
          <button
            type="button"
            key={a.id || a.email}
            onClick={() => setDetailId(a.id || null)}
            aria-label={`Abrir detalhes de ${a.name || a.email || 'afiliado'}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '46px 1fr 90px 70px 110px 90px 60px 100px',
              gap: 10,
              alignItems: 'center',
              padding: '14px 18px',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'border-color 150ms ease',
              textAlign: 'left',
              borderWidth: 1,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = `${C.ember}40`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = C.border;
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: a.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.emberBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT.sans,
                fontSize: 16,
                fontWeight: 600,
                color: a.type === 'producer' ? '#8B5CF6' : C.ember,
                flexShrink: 0,
              }}
            >
              {(a.name || '?')[0].toUpperCase()}
            </div>

            {/* Name + email */}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 14,
                  fontWeight: 600,
                  color: C.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {a.name}
              </div>
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 11,
                  color: C.secondary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {a.email}
              </div>
            </div>

            {/* Type badge */}
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: FONT.sans,
                width: 'fit-content',
                color: a.type === 'producer' ? '#8B5CF6' : C.ember,
                background: a.type === 'producer' ? 'rgba(139,92,246,0.15)' : C.emberStrong,
                letterSpacing: '0.02em',
                textTransform: 'uppercase' as const,
              }}
            >
              {a.type === 'producer' ? 'Produtor' : 'Afiliado'}
            </span>

            {/* Sales */}
            <div style={{ textAlign: 'right' as const }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 14, fontWeight: 600, color: C.text }}>
                {a.totalSales || 0}
              </span>
            </div>

            {/* Revenue */}
            <div style={{ textAlign: 'right' as const }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 600, color: C.text }}>
                {kloelT(`R$`)}{' '}
                {(a.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
              </span>
            </div>

            {/* Commission value */}
            <div style={{ textAlign: 'right' as const }}>
              <span
                style={{ fontFamily: FONT.mono, fontSize: 12, color: C.ember, fontWeight: 600 }}
              >
                {kloelT(`R$`)}{' '}
                {(((a.revenue || 0) * (a.commission || 0)) / 100).toLocaleString('pt-BR', {
                  minimumFractionDigits: 0,
                })}
              </span>
            </div>

            {/* Rate */}
            <div style={{ textAlign: 'right' as const }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 600, color: C.text }}>
                {a.commission || 0}%
              </span>
            </div>

            {/* Temperature */}
            <div style={{ width: 100 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 10,
                    fontWeight: 600,
                    color:
                      (a.temperature || 0) > 70
                        ? '#10B981'
                        : (a.temperature || 0) > 40
                          ? '#F59E0B'
                          : C.muted,
                  }}
                >
                  {a.temperature || 0}%
                </span>
              </div>
              <TempBar
                value={a.temperature || 0}
                max={100}
                color={
                  (a.temperature || 0) > 70
                    ? '#10B981'
                    : (a.temperature || 0) > 40
                      ? '#F59E0B'
                      : C.muted
                }
              />
            </div>
          </button>
        ))}

        {filtered.length === 0 && displayAffiliates.length === 0 && (
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: '60px 20px',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                fontSize: 14,
                color: 'var(--app-text-tertiary)',
                display: 'block',
                marginBottom: 8,
              }}
            >
              {kloelT(`Nenhum afiliado cadastrado`)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Convide afiliados para promover seus produtos`)}
            </span>
          </div>
        )}
        {filtered.length === 0 && displayAffiliates.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
            }}
          >
            <span style={{ color: C.muted }}>{IC.users(32)}</span>
            <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.secondary, marginTop: 12 }}>
              {kloelT(`Nenhum parceiro encontrado`)}
            </p>
          </div>
        )}
      </div>

      {/* ── Meus Links de Afiliado (produtos que este workspace promove) ── */}
      <MyAffiliateLinks />

      {/* Affiliate Detail Modal */}
      {detailId && detailAffiliate && (
        <AffiliateDetailModal
          affiliate={detailAffiliate}
          onClose={() => setDetailId(null)}
          onChat={() => {
            setDetailId(null);
          }}
          onRevoke={() => handleRevoke(detailId)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MY AFFILIATE LINKS PANEL
   — shows links from GET /affiliate/my-links
   — includes AI suggestions from POST /affiliate/suggest
   ═══════════════════════════════════════════════ */

function MyAffiliateLinks() {
  const { data: linksData, isLoading: linksLoading } = useSWR(
    '/affiliate/my-links',
    () => affiliateApi.myLinks().then((r) => r.data),
    { revalidateOnFocus: false },
  );

  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AffiliateSuggestion[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<AffiliateSuggestion[] | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const links: AffiliateLink[] = linksData?.links || [];
  const totals = linksData?.totals || { clicks: 0, sales: 0, revenue: 0, commission: 0 };

  const handleSuggest = async () => {
    setSuggestLoading(true);
    try {
      const res = await affiliateApi.suggest();
      setSuggestions(res.data?.products || []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }
    setSearchLoading(true);
    try {
      const res = await affiliateApi.aiSearch(searchQuery.trim());
      setSearchResults(res.data?.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSave = async (productId: string) => {
    setSaving((prev) => ({ ...prev, [productId]: true }));
    try {
      await affiliateApi.saveProduct(productId);
    } catch {
      // ignore
    } finally {
      setSaving((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const fmtMoney = (n: number) =>
    'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  return (
    <div style={{ marginTop: 32, borderTop: `1px solid ${C.divider}`, paddingTop: 28 }}>
      <h3
        style={{
          fontFamily: FONT.sans,
          fontSize: 15,
          fontWeight: 600,
          color: C.text,
          margin: '0 0 6px',
        }}
      >
        {kloelT(`Meus Links de Afiliado`)}
      </h3>
      <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.secondary, margin: '0 0 20px' }}>
        {kloelT(`Produtos de outros produtores que voce esta promovendo`)}
      </p>

      {/* Totals */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
        {[
          { label: 'Cliques', value: totals.clicks },
          { label: 'Vendas', value: totals.sales },
          { label: 'Receita', value: fmtMoney(totals.revenue) },
          { label: 'Comissao', value: fmtMoney(totals.commission) },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '14px 16px',
            }}
          >
            <div
              style={{ fontFamily: FONT.sans, fontSize: 11, color: C.secondary, marginBottom: 4 }}
            >
              {s.label}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: C.text }}>
              {typeof s.value === 'number' ? s.value : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Links list */}
      {linksLoading ? (
        <div style={{ color: C.secondary, fontFamily: FONT.sans, fontSize: 13, padding: '20px 0' }}>
          {kloelT(`Carregando links...`)}
        </div>
      ) : links.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          {links.map((link) => (
            <div
              key={link.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 110px 100px 160px',
                gap: 12,
                alignItems: 'center',
                padding: '12px 16px',
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
              }}
            >
              <div>
                <div
                  style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: C.text }}
                >
                  {link.affiliateProduct?.productId || link.id}
                </div>
                <div
                  style={{ fontFamily: FONT.mono, fontSize: 10, color: C.secondary, marginTop: 2 }}
                >
                  {link.code || link.id}
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>
                  {kloelT(`Cliques`)}
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 14, color: C.text }}>
                  {link.clicks || 0}
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>
                  {kloelT(`Vendas`)}
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 14, color: C.text }}>
                  {link.sales || 0}
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>
                  {kloelT(`Receita`)}
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text }}>
                  {fmtMoney(link.revenue || 0)}
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontFamily: FONT.sans, fontSize: 10, color: C.secondary }}>
                  {kloelT(`Comissao`)}
                </div>
                <div
                  style={{ fontFamily: FONT.mono, fontSize: 13, color: C.ember, fontWeight: 600 }}
                >
                  {fmtMoney(link.commissionEarned || 0)}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard
                    .writeText(buildPayUrl(`/${link.code || link.id}`, window.location.host))
                    .catch(() => {})
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  background: 'none',
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  color: C.secondary,
                  fontFamily: FONT.sans,
                  fontSize: 12,
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' as const,
                }}
              >
                {IC.copy(12)} {kloelT(`Copiar link`)}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '40px 20px',
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          <span style={{ color: C.muted }}>{IC.link(32)}</span>
          <p style={{ fontFamily: FONT.sans, fontSize: 14, color: C.secondary, marginTop: 12 }}>
            {kloelT(`Voce nao tem links de afiliado ainda`)}
          </p>
          <p style={{ fontFamily: FONT.sans, fontSize: 12, color: C.muted }}>
            {kloelT(`Use a busca abaixo para encontrar produtos para promover`)}
          </p>
        </div>
      )}

      {/* AI Suggest + Search */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* AI Suggestions */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: 16,
          }}
        >
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              marginBottom: 12,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
            }}
          >
            {kloelT(`Sugestoes por IA`)}
          </div>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggestLoading}
            style={{
              width: '100%',
              padding: '10px 0',
              background: C.ember,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 600,
              cursor: suggestLoading ? 'wait' : 'pointer',
              marginBottom: 12,
              opacity: suggestLoading ? 0.7 : 1,
            }}
          >
            {suggestLoading ? 'Buscando...' : 'Ver sugestoes para meu nicho'}
          </button>
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: C.elevated,
                    borderRadius: 6,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 12,
                        fontWeight: 600,
                        color: C.text,
                      }}
                    >
                      {p.productId}
                    </div>
                    <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.ember }}>
                      {p.commissionPct}
                      {kloelT(`% comissao`)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSave(p.id)}
                    disabled={saving[p.id]}
                    style={{
                      padding: '6px 12px',
                      background: 'none',
                      border: `1px solid ${C.ember}`,
                      borderRadius: 6,
                      color: C.ember,
                      fontFamily: FONT.sans,
                      fontSize: 11,
                      cursor: saving[p.id] ? 'wait' : 'pointer',
                    }}
                  >
                    {saving[p.id] ? '...' : 'Salvar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Search */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: 16,
          }}
        >
          <div
            style={{
              fontFamily: FONT.sans,
              fontSize: 12,
              fontWeight: 600,
              color: C.secondary,
              marginBottom: 12,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
            }}
          >
            {kloelT(`Buscar no Marketplace`)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              aria-label="Buscar no marketplace por categoria ou tag"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              placeholder={kloelT(`Buscar por categoria ou tag...`)}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: C.elevated,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT.sans,
                fontSize: 13,
                outline: 'none',
              }}
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor = C.ember;
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor = C.border;
              }}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={!searchQuery.trim() || searchLoading}
              style={{
                padding: '10px 14px',
                background: C.ember,
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontFamily: FONT.sans,
                fontSize: 13,
                fontWeight: 600,
                cursor: !searchQuery.trim() || searchLoading ? 'not-allowed' : 'pointer',
                opacity: !searchQuery.trim() || searchLoading ? 0.5 : 1,
              }}
            >
              {IC.search(14)}
            </button>
          </div>
          {searchResults !== null &&
            (searchResults.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {searchResults.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: C.elevated,
                      borderRadius: 6,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: FONT.sans,
                          fontSize: 12,
                          fontWeight: 600,
                          color: C.text,
                        }}
                      >
                        {p.productId}
                      </div>
                      <div style={{ fontFamily: FONT.mono, fontSize: 11, color: C.ember }}>
                        {p.commissionPct}
                        {kloelT(`% —`)} {p.category || 'Geral'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSave(p.id)}
                      disabled={saving[p.id]}
                      style={{
                        padding: '6px 12px',
                        background: 'none',
                        border: `1px solid ${C.ember}`,
                        borderRadius: 6,
                        color: C.ember,
                        fontFamily: FONT.sans,
                        fontSize: 11,
                        cursor: saving[p.id] ? 'wait' : 'pointer',
                      }}
                    >
                      {saving[p.id] ? '...' : 'Salvar'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  fontFamily: FONT.sans,
                  fontSize: 13,
                  color: C.muted,
                  textAlign: 'center',
                  padding: '16px 0',
                }}
              >
                {kloelT(`Nenhum produto encontrado para &quot;`)}
                {searchQuery}
                {kloelT(`&quot;`)}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB: CHAT
   ═══════════════════════════════════════════════ */

function TabChat({
  selectedChat,
  setSelectedChat,
  chatInput,
  setChatInput,
  messages,
  setMessages,
  search,
  setSearch,
}: {
  selectedChat: PartnerContact | null;
  setSelectedChat: (c: PartnerContact | null) => void;
  chatInput: string;
  setChatInput: (s: string) => void;
  messages: PartnerMessage[];
  setMessages: (m: PartnerMessage[]) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  const { contacts, mutate: mutateContacts } = usePartnerChatContacts();
  const { messages: realMsgs, mutate: mutateMsgs } = usePartnerMessages(selectedChat?.id || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const displayContacts = contacts as PartnerContact[];
  const displayMessages: PartnerMessage[] =
    (realMsgs as PartnerMessage[]).length > 0 ? (realMsgs as PartnerMessage[]) : messages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length]);

  const handleSelectContact = async (contact: PartnerContact) => {
    setSelectedChat(contact);
    if ((contact.unread || 0) > 0) {
      try {
        await markPartnerAsRead(contact.id);
        mutateContacts();
      } catch {
        // silent
      }
    }
  };

  const handleSend = async () => {
    if (!chatInput.trim() || !selectedChat) {
      return;
    }
    const content = chatInput.trim();
    setChatInput('');
    try {
      await sendPartnerMessage(selectedChat.id, content);
      mutateMsgs();
    } catch (e) {
      console.error('Failed to send message', e);
    }
    // Also append locally for immediate feedback
    const newMsg = {
      id: `local-${Date.now()}`,
      sender: 'Voce',
      content,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
    };
    setMessages([...messages, newMsg]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredContacts = displayContacts.filter((c) => {
    if (!search) {
      return true;
    }
    return (c.name || '').toLowerCase().includes(search.toLowerCase());
  });

  const totalUnread = displayContacts.reduce((sum: number, c) => sum + (c.unread || 0), 0);

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 180px)',
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        overflow: 'hidden',
        animation: 'fadeIn 300ms ease',
      }}
    >
      {/* Contact List - 280px */}
      <div
        style={{
          width: 280,
          borderRight: `1px solid ${C.divider}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${C.divider}` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.ember }}>{IC.chat(16)}</span>
              <span style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text }}>
                {kloelT(`Conversas`)}
              </span>
            </div>
            {totalUnread > 0 && (
              <span
                style={{
                  padding: '2px 8px',
                  background: C.ember,
                  borderRadius: 10,
                  fontFamily: FONT.mono,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#fff',
                }}
              >
                {totalUnread}
              </span>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: C.muted,
              }}
            >
              {IC.search(13)}
            </div>
            <input
              aria-label="Buscar conversa"
              type="text"
              placeholder={kloelT(`Buscar conversa...`)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 30px',
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                color: C.text,
                fontFamily: FONT.sans,
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>
        </div>

        {/* Contact List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredContacts.map((contact) => {
            const isSelected = selectedChat?.id === contact.id;
            return (
              <div
                key={contact.id}
                onClick={() => handleSelectContact(contact)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: isSelected ? C.emberBg : 'transparent',
                  borderLeft: isSelected ? `2px solid ${C.ember}` : '2px solid transparent',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background = C.elevated;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).click();
                  }
                }}
              >
                {/* Avatar */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background:
                        contact.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.elevated,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: FONT.sans,
                      fontSize: 14,
                      fontWeight: 600,
                      color: contact.type === 'producer' ? '#8B5CF6' : C.text,
                    }}
                  >
                    {(contact.name || '?')[0].toUpperCase()}
                  </div>
                  {contact.online && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#10B981',
                        border: `2px solid ${C.card}`,
                      }}
                    />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 13,
                        fontWeight: contact.unread ? 600 : 500,
                        color: C.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' as const,
                      }}
                    >
                      {contact.name}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 10,
                        color: C.muted,
                        flexShrink: 0,
                        marginLeft: 8,
                      }}
                    >
                      {contact.time}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 12,
                        color: contact.unread ? C.secondary : C.muted,
                        fontWeight: contact.unread ? 500 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' as const,
                        flex: 1,
                      }}
                    >
                      {contact.lastMessage}
                    </span>
                    {(contact.unread || 0) > 0 && (
                      <span
                        style={{
                          minWidth: 18,
                          height: 18,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 9,
                          background: C.ember,
                          fontFamily: FONT.mono,
                          fontSize: 10,
                          fontWeight: 600,
                          color: '#fff',
                          padding: '0 4px',
                          flexShrink: 0,
                        }}
                      >
                        {contact.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredContacts.length === 0 && displayContacts.length === 0 && (
            <div
              style={{
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: '60px 20px',
                textAlign: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--app-text-tertiary)',
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                {kloelT(`Nenhum contato`)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
                {kloelT(`Conversas com parceiros aparecerao aqui`)}
              </span>
            </div>
          )}
          {filteredContacts.length === 0 && displayContacts.length > 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: C.muted }}>
              <span style={{ color: C.muted }}>{IC.chat(24)}</span>
              <p style={{ fontFamily: FONT.sans, fontSize: 13, marginTop: 8 }}>
                {kloelT(`Nenhuma conversa encontrada`)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg }}>
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 20px',
                borderBottom: `1px solid ${C.divider}`,
                background: C.card,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background:
                    selectedChat.type === 'producer' ? 'rgba(139,92,246,0.12)' : C.elevated,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: FONT.sans,
                  fontSize: 14,
                  fontWeight: 600,
                  color: selectedChat.type === 'producer' ? '#8B5CF6' : C.text,
                }}
              >
                {(selectedChat.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <div
                  style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: C.text }}
                >
                  {selectedChat.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: FONT.sans,
                      color: selectedChat.type === 'producer' ? '#8B5CF6' : C.ember,
                      background:
                        selectedChat.type === 'producer' ? 'rgba(139,92,246,0.15)' : C.emberStrong,
                      letterSpacing: '0.02em',
                      textTransform: 'uppercase' as const,
                    }}
                  >
                    {selectedChat.type === 'producer' ? 'Produtor' : 'Afiliado'}
                  </span>
                  {selectedChat.online && (
                    <span style={{ fontFamily: FONT.sans, fontSize: 11, color: '#10B981' }}>
                      online
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {displayMessages.length === 0 && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ color: C.muted }}>{IC.chat(24)}</span>
                  <p style={{ fontFamily: FONT.sans, fontSize: 13, color: C.muted, margin: 0 }}>
                    {kloelT(`Nenhuma mensagem ainda`)}
                  </p>
                </div>
              )}
              {displayMessages.map((msg) => (
                <div
                  key={msg.id}
                  style={{ display: 'flex', justifyContent: msg.isMe ? 'flex-end' : 'flex-start' }}
                >
                  <div
                    style={{
                      maxWidth: '70%',
                      padding: '10px 14px',
                      borderRadius: 6,
                      background: msg.isMe ? C.ember : C.card,
                      border: msg.isMe ? 'none' : `1px solid ${C.border}`,
                    }}
                  >
                    {!msg.isMe && (
                      <div
                        style={{
                          fontFamily: FONT.sans,
                          fontSize: 11,
                          fontWeight: 600,
                          color: C.ember,
                          marginBottom: 4,
                        }}
                      >
                        {msg.sender}
                      </div>
                    )}
                    <div
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 13,
                        color: msg.isMe ? '#fff' : C.text,
                        lineHeight: 1.5,
                      }}
                    >
                      {msg.content}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT.sans,
                        fontSize: 10,
                        color: msg.isMe ? 'rgba(255,255,255,0.6)' : C.muted,
                        textAlign: 'right' as const,
                        marginTop: 4,
                      }}
                    >
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 20px',
                borderTop: `1px solid ${C.divider}`,
                background: C.card,
              }}
            >
              <input
                aria-label="Mensagem"
                type="text"
                placeholder={kloelT(`Digite sua mensagem...`)}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  color: C.text,
                  fontFamily: FONT.sans,
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!chatInput.trim()}
                style={{
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: chatInput.trim() ? C.ember : C.elevated,
                  border: 'none',
                  borderRadius: 6,
                  cursor: chatInput.trim() ? 'pointer' : 'default',
                  transition: 'background 150ms ease',
                  flexShrink: 0,
                }}
              >
                <span style={{ color: chatInput.trim() ? '#fff' : C.muted }}>{IC.send(16)}</span>
              </button>
            </div>
          </>
        ) : (
          /* Empty State */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: C.card,
                border: `1px solid ${C.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ color: C.muted }}>{IC.chat(28)}</span>
            </div>
            <h3
              style={{
                fontFamily: FONT.sans,
                fontSize: 16,
                fontWeight: 600,
                color: C.secondary,
                margin: 0,
              }}
            >
              {kloelT(`Selecione uma conversa`)}
            </h3>
            <p
              style={{
                fontFamily: FONT.sans,
                fontSize: 13,
                color: C.muted,
                margin: 0,
                maxWidth: 300,
                textAlign: 'center' as const,
              }}
            >
              {kloelT(
                `Escolha um parceiro na lista ao lado para iniciar ou continuar uma conversa`,
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

