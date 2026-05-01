// ═══════════════════════════════════════════════════════════
// REUSABLE COMPONENTS
// ═══════════════════════════════════════════════════════════
function NP({ color = V.em, w = 120, h = 24 }: { color?: string; w?: number; h?: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current;
    if (!c) {
      return;
    }
    const ctx = c.getContext('2d');
    if (!ctx) {
      return;
    }
    c.width = w * 2;
    c.height = h * 2;
    ctx.scale(2, 2);
    let f = 0,
      raf: number;
    let visible = true;
    const obs = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        if (visible) {
          raf = requestAnimationFrame(draw);
        }
      },
      { threshold: 0 },
    );
    obs.observe(c);
    const draw = () => {
      if (!visible) {
        return;
      }
      ctx.clearRect(0, 0, w, h);
      for (let layer = 0; layer < 2; layer++) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.2 + layer * 0.2;
        for (let x = 0; x < w; x += 2) {
          const spike = secureRandomFloat() > 0.97 ? (secureRandomFloat() - 0.5) * h * 0.5 : 0;
          const y =
            h / 2 + Math.sin(x * 0.04 + f * 0.03 + layer * 1.5) * (h * 0.25 + layer * 2) + spike;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      f++;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [color, w, h]);
  return <canvas ref={cv} style={{ width: w, height: h, display: 'block', opacity: 0.6 }} />;
}

const cs: React.CSSProperties = { background: V.s, border: `1px solid ${V.b}`, borderRadius: 8 };
const is: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: V.e,
  border: `1px solid ${V.b}`,
  borderRadius: 6,
  color: V.t,
  fontSize: 13,
  fontFamily: S,
  outline: 'none',
};
const ls: React.CSSProperties = {
  display: 'block',
  fontSize: 9,
  fontWeight: 600,
  color: V.t3,
  letterSpacing: '.1em',
  textTransform: 'uppercase' as const,
  marginBottom: 6,
  fontFamily: S,
};

function StatusDot({ color }: { color: string }) {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: 8,
        background: color,
        flexShrink: 0,
        boxShadow: `0 0 6px ${color}40`,
      }}
    />
  );
}

function Bt({
  primary,
  accent,
  children,
  onClick,
  style: sx,
}: {
  primary?: boolean;
  accent?: string;
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        background: primary ? V.em : accent || 'transparent',
        border: primary || accent ? 'none' : `1px solid ${V.b}`,
        borderRadius: 6,
        color: primary
          ? V.void
          : accent
            ? '#fff' /* PULSE_VISUAL_OK: universal white shorthand */
            : V.t2,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: S,
        ...sx,
      }}
    >
      {children}
    </button>
  );
}

function MetricCard({
  title,
  value,
  sub,
  color = V.em,
  icon,
  trend,
  loading,
}: {
  title: string;
  value: string;
  sub?: string;
  color?: string;
  icon: (s: number) => React.ReactNode;
  trend?: number;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div style={{ ...cs, padding: '20px 22px', flex: 1, minWidth: 180 }}>
        <NP w={160} h={28} color={color} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...cs,
        padding: '20px 22px',
        flex: 1,
        minWidth: 180,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', right: 12, top: 12, color, opacity: 0.08 }}>
        {icon(40)}
      </div>
      <span style={{ ...ls, marginBottom: 10 }}>{title}</span>
      <span
        style={{
          fontFamily: M,
          fontSize: 28,
          fontWeight: 700,
          color,
          display: 'block',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 11, color: V.t2, marginTop: 8, display: 'block' }}>{sub}</span>
      )}
      {trend !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10 }}>
          <span style={{ color: trend >= 0 ? V.g2 : V.r, display: 'flex' }}>
            {trend >= 0 ? IC.trend(12) : IC.down(12)}
          </span>
          <span
            style={{ fontSize: 10, color: trend >= 0 ? V.g2 : V.r, fontFamily: M, fontWeight: 600 }}
          >
            {Math.abs(trend)}%
          </span>
          <span style={{ fontSize: 9, color: V.t3 }}>{kloelT(`vs. anterior`)}</span>
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <NP color={color} w={140} h={16} />
      </div>
    </div>
  );
}

function TableHeader({ cols }: { cols: { l: string; w: string }[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: cols.map((c) => c.w).join(' '),
        padding: '10px 14px',
        background: V.e,
        borderBottom: `1px solid ${V.b}`,
      }}
    >
      {cols.map((h) => (
        <span
          key={h.l || 'empty'}
          style={{
            fontSize: 8,
            fontWeight: 600,
            color: V.t3,
            letterSpacing: '.08em',
            textTransform: 'uppercase' as const,
          }}
        >
          {h.l}
        </span>
      ))}
    </div>
  );
}

function Pagination({
  total,
  perPage = 10,
  page,
  setPage,
}: {
  total: number;
  perPage?: number;
  page: number;
  setPage: (p: number) => void;
}) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) {
    return null;
  }
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 14px',
        borderTop: `1px solid ${V.b}`,
      }}
    >
      <span style={{ fontSize: 10, color: V.t3, fontFamily: M }}>
        {kloelT(`Mostrando`)} {(page - 1) * perPage + 1} {kloelT(`até`)}{' '}
        {Math.min(page * perPage, total)} de {total}
      </span>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => setPage(p)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              border: `1px solid ${p === page ? V.em : V.b}`,
              background: p === page ? V.em : 'transparent',
              color: p === page ? V.void : V.t2,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: M,
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function CTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div
      style={{
        background: V.s,
        border: `1px solid ${V.b}`,
        borderRadius: 8,
        padding: '10px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,.6)',
      }}
    >
      <span style={{ fontSize: 10, color: V.t3, display: 'block', marginBottom: 4, fontFamily: M }}>
        {label}
      </span>
      {payload.map((p: TooltipPayloadEntry) => (
        <div
          key={p.name}
          style={{ fontSize: 12, fontFamily: M, fontWeight: 600, color: p.color || V.em }}
        >
          {p.name}:{' '}
          {typeof p.value === 'number' && p.value > 999
            ? R$(p.value)
            : typeof p.value === 'number' && p.value < 100
              ? `${p.value.toFixed(2)}%`
              : Fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ ...cs, padding: 40, textAlign: 'center' }}>
      <span style={{ color: V.t3, fontSize: 13 }}>{message}</span>
    </div>
  );
}

function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...cs, padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {children}
      </div>
    </div>
  );
}

function FilterField({
  label,
  children,
  flex = 1,
}: {
  label: string;
  children: React.ReactNode;
  flex?: number;
}) {
  return (
    <div style={{ flex, minWidth: 160 }}>
      <span style={ls}>{label}</span>
      {children}
    </div>
  );
}

function FilterDrawer({
  open,
  onClose,
  filters,
  setFilters,
}: {
  open: boolean;
  onClose: () => void;
  filters: RF;
  setFilters: (f: RF | ((prev: RF) => RF)) => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,.55)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
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
          width: 380,
          maxWidth: '90vw',
          background: V.s,
          borderLeft: `1px solid ${V.b}`,
          height: '100vh',
          overflowY: 'auto',
          padding: '28px 24px',
          animation: 'fadeIn .2s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: V.t }}>
            {kloelT(`Filtro avançado`)}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: V.t3,
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            {kloelT(`&times;`)}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <span style={ls}>{kloelT(`Período`)}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                aria-label="Data inicio"
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                style={is}
              />
              <input
                aria-label="Data fim"
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                style={is}
              />
            </div>
          </div>
          <div>
            <span style={ls}>{kloelT(`Código da venda`)}</span>
            <input aria-label="Codigo da venda" placeholder={kloelT(`Ex: ORD-12345`)} style={is} />
          </div>
          <div>
            <span style={ls}>{kloelT(`Comprador`)}</span>
            <input
              aria-label="Nome do comprador"
              placeholder={kloelT(`Nome do comprador`)}
              style={is}
            />
          </div>
          <div>
            <span style={ls}>{kloelT(`CPF / CNPJ`)}</span>
            <input aria-label="CPF ou CNPJ" placeholder="000.000.000-00" style={is} />
          </div>
          <div>
            <span style={ls}>{kloelT(`Forma de pagamento`)}</span>
            <select
              style={is}
              value={filters.paymentMethod || ''}
              onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value }))}
            >
              <option value="">{kloelT(`Todas`)}</option>
              <option value="CREDIT_CARD">{kloelT(`Cartão de crédito`)}</option>
              <option value="PIX">{kloelT(`Pix`)}</option>
              <option value="BOLETO">{kloelT(`Boleto`)}</option>
            </select>
          </div>
          <div>
            <span style={ls}>{kloelT(`Status`)}</span>
            <select
              style={is}
              value={filters.status || ''}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">{kloelT(`Todos`)}</option>
              <option value="PAID">{kloelT(`Aprovado`)}</option>
              <option value="PENDING">{kloelT(`Pendente`)}</option>
              <option value="PROCESSING">{kloelT(`Processando`)}</option>
              <option value="CANCELED">{kloelT(`Cancelado`)}</option>
              <option value="REFUNDED">{kloelT(`Estornado`)}</option>
            </select>
          </div>
          <div>
            <span style={ls}>{kloelT(`Produto`)}</span>
            <select
              style={is}
              value={filters.product || ''}
              onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}
            >
              <option value="">{kloelT(`Todos`)}</option>
            </select>
          </div>
          <div>
            <span style={ls}>{kloelT(`Plano`)}</span>
            <input aria-label="Nome do plano" placeholder={kloelT(`Nome do plano`)} style={is} />
          </div>
          <div>
            <span style={ls}>{kloelT(`UTM Source / Medium`)}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input aria-label="UTM Source" placeholder="utm_source" style={is} />
              <input aria-label="UTM Medium" placeholder="utm_medium" style={is} />
            </div>
          </div>
          <div>
            <span style={ls}>{kloelT(`Email afiliado`)}</span>
            <input
              aria-label="Email do afiliado"
              placeholder={kloelT(`email@afiliado.com`)}
              style={is}
            />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            {['Primeira compra', 'Recuperação', 'Upsell'].map((label) => (
              <label
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: V.t2,
                  cursor: 'pointer',
                }}
              >
                <input type="checkbox" style={{ accentColor: V.em }} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
          <Bt primary onClick={onClose}>
            {kloelT(`Aplicar filtros`)}
          </Bt>
          <Bt onClick={onClose}>{kloelT(`Limpar`)}</Bt>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STATUS MAPS
// ═══════════════════════════════════════════════════════════
const stMap: Record<string, { c: string; l: string }> = {
  PAID: { c: V.g2, l: 'Aprovado' },
  PENDING: { c: V.y, l: 'Pendente' },
  PROCESSING: { c: V.bl, l: 'Processando' },
  CANCELED: { c: V.t3, l: 'Cancelado' },
  REFUNDED: { c: V.p, l: 'Estornado' },
  CHARGEBACK: { c: V.pk, l: 'Chargeback' },
  DECLINED: { c: V.r, l: 'Recusado' },
  SHIPPED: { c: V.cy, l: 'Enviado' },
  DELIVERED: { c: V.g2, l: 'Entregue' },
  ACTIVE: { c: V.g2, l: 'Ativa' },
  CANCELLED: { c: V.r, l: 'Cancelada' },
  PAST_DUE: { c: V.y, l: 'Atrasada' },
  TRIALING: { c: V.bl, l: 'Trial' },
  PAUSED: { c: V.t3, l: 'Pausada' },
  active: { c: V.g2, l: 'Ativo' },
  approved: { c: V.g2, l: 'Aprovado' },
};
const formIcon: Record<string, (s: number) => React.ReactNode> = {
  PIX: IC.pix,
  CREDIT_CARD: IC.card,
  BOLETO: IC.file,
};

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════
const TABS = [
  { k: 'vendas', l: 'Operações', ic: IC.dollar },
  { k: 'abandonos', l: 'Abandonos', ic: IC.ban },
  { k: 'assinaturas', l: 'Assinaturas', ic: IC.repeat },
  { k: 'estornos', l: 'Estornos', ic: IC.undo },
];

const VISIBLE_REPORT_TABS = new Set(TABS.map((tab) => tab.k));

function normalizeVisibleReportTab(tab: string | null | undefined) {
  return tab && VISIBLE_REPORT_TABS.has(tab) ? tab : 'vendas';
}

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// TAB COMPONENTS (extracted for noNestedComponentDefinitions)
// ═══════════════════════════════════════════════════════════

// ── VENDAS TAB ──
function VendasTab({
  filters,
  baseFilters,
  page,
  setPage,
  isMobile,
}: {
  filters: RF;
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  isMobile: boolean;
}) {
  const gid = useId();

  const { data: summary, isLoading: ls } = useReport<VendasSummary>('vendas/summary', filters);
  const { data: daily } = useReport<ReportRow[]>('vendas/daily', filters);
  const { data: vendas, isLoading: lv } = useReport<PaginatedReport>('vendas', baseFilters);
  const rows = vendas?.data || [];
  const dailyData = Array.isArray(daily) ? daily : [];

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Total de operações`)}
          value={summary ? R$(summary.totalRevenue || 0) : '...'}
          sub={
            summary
              ? `${Fmt(summary.totalCount || 0)} operações · Ticket médio ${R$(summary.ticketMedio || 0)}`
              : ''
          }
          color={V.em}
          icon={IC.dollar}
          loading={ls}
        />
        <MetricCard
          title={kloelT(`Conversão`)}
          value={summary ? `${summary.conversao || 0}%` : '...'}
          sub={`${summary?.paidCount || 0} aprovadas`}
          color={V.bl}
          icon={IC.perc}
          loading={ls}
        />
        <MetricCard
          title={kloelT(`Total comissões`)}
          value={summary ? R$(summary.totalCommission || 0) : '...'}
          sub={kloelT(`Comissões do período`)}
          color={V.g2}
          icon={IC.users}
          loading={ls}
        />
      </div>
      {dailyData.length > 0 && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            {kloelT(`Receita diária`)}
          </span>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id={`${gid}-gR`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={V.em} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={V.em} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray={kloelT(`3 3`)} stroke={V.b} vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 8, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(8, 10) : '')}
              />
              <YAxis
                tick={{ fontSize: 8, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${(v / 100000).toFixed(0)}k`}
              />
              <Tooltip content={<CTooltip />} />
              <Area
                type="monotone"
                dataKey="receita"
                stroke={V.em}
                fill={`url(#${gid}-gR)`}
                strokeWidth={2}
                dot={false}
                name="Receita"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {dailyData.length > 0 && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            {kloelT(`Volume de operações`)}
          </span>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray={kloelT(`3 3`)} stroke={V.b} vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 7, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(8, 10) : '')}
              />
              <YAxis
                tick={{ fontSize: 8, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="vendas" fill={V.em} radius={[3, 3, 0, 0]} name="Operações" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...cs,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.bl, l: 'Processando' },
          { c: V.g2, l: 'Aprovado' },
          { c: V.y, l: 'Pendente' },
          { c: V.r, l: 'Frustrada' },
          { c: V.p, l: 'Estornado' },
          { c: V.t3, l: 'Cancelado' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...cs, overflowX: isMobile ? ('auto' as const) : ('hidden' as const) }}>
        <TableHeader
          cols={[
            { l: 'Pedido', w: '0.7fr' },
            { l: 'Comprador', w: '1.4fr' },
            { l: 'Pagamento', w: '0.5fr' },
            { l: 'Pedido', w: '0.8fr' },
            { l: 'Total', w: '0.7fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {lv ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: V.t3, fontSize: 12 }}>
            {kloelT(`Nenhuma operação no período`)}
          </div>
        ) : (
          rows.map((s: ReportRow, i: number) => {
            const st = stMap[s.status ?? ''] || { c: V.bl, l: s.status };
            const FI = formIcon[s.paymentMethod ?? ''] || IC.card;
            return (
              <section
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '0.7fr 1.4fr 0.5fr 0.8fr 0.7fr 0.4fr',
                  padding: '10px 14px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = V.e;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ fontFamily: M, fontSize: 9, color: V.t3 }}>
                  {s.orderNumber || s.id?.slice(0, 12)}
                </span>
                <div>
                  <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                    {s.customerName || '—'}
                  </span>
                  <span style={{ fontSize: 9, color: V.t3 }}>{s.customerEmail || ''}</span>
                </div>
                <span style={{ color: V.t2, display: 'flex', justifyContent: 'center' }}>
                  {FI(16)}
                </span>
                <span style={{ fontSize: 9, color: V.t2, fontFamily: M }}>
                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString('pt-BR') : '—'}
                </span>
                <span style={{ fontFamily: M, fontSize: 11, fontWeight: 600, color: V.t }}>
                  {R$(s.totalInCents || 0)}
                </span>
                <StatusDot color={st.c} />
              </section>
            );
          })
        )}
        <Pagination total={vendas?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── AFTER PAY TAB ──
function AfterPayTab({
  filters,
  setFilters,
  baseFilters,
  page,
  setPage,
}: {
  filters: RF;
  setFilters: React.Dispatch<React.SetStateAction<RF>>;
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('afterpay', baseFilters);
  const rows = data?.data || [];
  const aReceberTotal = rows.reduce((acc: number, r: ReportRow) => acc + (r.totalInCents || 0), 0);
  const atrasadasCount = rows.filter(
    (r: ReportRow) => r.status === 'PAST_DUE' || r.status === 'OVERDUE',
  ).length;
  const quitadosCount = rows.filter(
    (r: ReportRow) => r.status === 'PAID' || r.status === 'DELIVERED',
  ).length;
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Parcelamentos`)}
          value={String(data?.total || 0)}
          sub={kloelT(`Cartão de crédito`)}
          color={V.bl}
          icon={IC.clock}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`A receber`)}
          value={R$(aReceberTotal)}
          sub={kloelT(`Valor total pendente`)}
          color={V.bl}
          icon={IC.dollar}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Parcelas atrasadas`)}
          value={String(atrasadasCount)}
          sub={kloelT(`Em atraso`)}
          color={V.y}
          icon={IC.alert}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Quitados`)}
          value={String(quitadosCount)}
          sub={kloelT(`Pagos integralmente`)}
          color={V.g2}
          icon={IC.check}
          loading={isLoading}
        />
      </div>
      <FilterBar>
        <FilterField label={kloelT(`Produto`)}>
          <select
            style={is}
            value={filters.product || ''}
            onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}
          >
            <option value="">{kloelT(`Todos`)}</option>
          </select>
        </FilterField>
        <FilterField label={kloelT(`Status`)}>
          <select
            style={is}
            value={filters.status || ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">{kloelT(`Todos`)}</option>
            <option value="PAID">{kloelT(`Pago`)}</option>
            <option value="PENDING">{kloelT(`Pendente`)}</option>
            <option value="PAST_DUE">{kloelT(`Atrasado`)}</option>
          </select>
        </FilterField>
      </FilterBar>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...cs,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.bl, l: 'Processando' },
          { c: V.g2, l: 'Pago' },
          { c: V.y, l: 'Atrasado' },
          { c: V.r, l: 'Cancelado' },
          { c: V.t3, l: 'Pendente' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Pedido', w: '0.8fr' },
            { l: 'Comprador', w: '1.4fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhum parcelamento encontrado`)} />
        ) : (
          rows.map((a: ReportRow, i: number) => {
            const st = stMap[a.status ?? ''] || { c: V.t3, l: a.status };
            return (
              <div
                key={a.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '0.8fr 1.4fr 1fr 0.7fr 0.4fr',
                  padding: '12px 14px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = V.e;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ fontFamily: M, fontSize: 9, color: V.t3 }}>
                  {a.orderNumber || a.id?.slice(0, 12)}
                </span>
                <div>
                  <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                    {a.customerName || '—'}
                  </span>
                  <span style={{ fontSize: 9, color: V.t3 }}>{a.customerEmail}</span>
                </div>
                <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>
                  {a.plan?.name || '—'}
                </span>
                <span style={{ fontFamily: M, fontSize: 10, fontWeight: 600, color: V.t }}>
                  {R$(a.totalInCents || 0)}
                </span>
                <StatusDot color={st.c} />
              </div>
            );
          })
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── CHURN TAB ──
function ChurnTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<ChurnResponse>('churn', filters);
  const monthly = data?.monthly || [];
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Cancelamentos`)}
          value={String(data?.total || 0)}
          sub={kloelT(`Período selecionado`)}
          color={V.r}
          icon={IC.ban}
          loading={isLoading}
        />
      </div>
      {monthly.length > 0 && (
        <div style={{ ...cs, padding: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            {kloelT(`Evolução de cancelamentos`)}
          </span>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray={kloelT(`3 3`)} stroke={V.b} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="total" fill={V.r} radius={[3, 3, 0, 0]} name="Cancelamentos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!isLoading && monthly.length === 0 && (
        <EmptyState message={kloelT(`Nenhum cancelamento no período`)} />
      )}
    </>
  );
}

// ── ABANDONOS TAB ──
function AbandonosTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('abandonos', baseFilters);
  const rows = data?.data || [];
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Total abandonos`)}
          value={String(data?.total || 0)}
          sub={kloelT(`Checkouts não finalizados`)}
          color={V.r}
          icon={IC.ban}
          loading={isLoading}
        />
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Comprador', w: '1.6fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Plano', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Data', w: '0.8fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: V.t3, fontSize: 12 }}>
            {kloelT(`Nenhum abandono no período`)}
          </div>
        ) : (
          rows.map((a: ReportRow, i: number) => (
            <div
              key={a.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 1fr 1fr 0.7fr 0.8fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: V.t, display: 'block', fontWeight: 500 }}>
                  {a.customerName || '—'}
                </span>
                <span style={{ fontSize: 9, color: V.t3 }}>{a.customerEmail}</span>
              </div>
              <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>
                {a.plan?.product?.name || '—'}
              </span>
              <span style={{ fontSize: 10, color: V.t2 }}>{a.plan?.name || '—'}</span>
              <span style={{ fontFamily: M, fontSize: 10, fontWeight: 600, color: V.t }}>
                {R$(a.totalInCents || 0)}
              </span>
              <span style={{ fontFamily: M, fontSize: 9, color: V.t2 }}>
                {a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

function SatisfacaoTab() {
  const { nps, isLoading } = useNps();
  const distribution = useMemo(() => {
    const buckets = Array.from({ length: 11 }, (_, score) => ({
      score,
      total: nps.responses.filter((item) => Number(item.details?.score ?? -1) === score).length,
    }));
    return buckets;
  }, [nps.responses]);

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title="NPS"
          value={String(nps.nps || 0)}
          sub={kloelT(`Net Promoter Score`)}
          color={V.g2}
          icon={IC.check}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Nota média`)}
          value={String(nps.avg || '0.0')}
          sub={kloelT(`Média das respostas`)}
          color={V.em}
          icon={IC.perc}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Respostas`)}
          value={String(nps.total || 0)}
          sub={kloelT(`Coletas registradas`)}
          color={V.bl}
          icon={IC.users}
          loading={isLoading}
        />
      </div>
      {!isLoading && distribution.some((item) => item.total > 0) && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            {kloelT(`Distribuição de notas`)}
          </span>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distribution}>
              <CartesianGrid strokeDasharray={kloelT(`3 3`)} stroke={V.b} vertical={false} />
              <XAxis
                dataKey="score"
                tick={{ fontSize: 9, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="total" fill={V.g2} radius={[3, 3, 0, 0]} name="Respostas" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {isLoading ? (
        <div style={{ ...cs, padding: 20 }}>
          <NP w={200} h={20} />
        </div>
      ) : nps.responses.length === 0 ? (
        <EmptyState message={kloelT(`Nenhuma resposta de satisfação registrada ainda`)} />
      ) : (
        <div style={{ ...cs, overflow: 'hidden' }}>
          <TableHeader
            cols={[
              { l: 'Nota', w: '0.5fr' },
              { l: 'Comentário', w: '2fr' },
              { l: 'Pedido', w: '0.8fr' },
              { l: 'Data', w: '0.8fr' },
            ]}
          />
          {nps.responses.map((response, index) => (
            <div
              key={response.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.5fr 2fr 0.8fr 0.8fr',
                padding: '12px 14px',
                borderBottom: index < nps.responses.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span
                style={{
                  fontFamily: M,
                  fontSize: 16,
                  fontWeight: 700,
                  color:
                    Number(response.details?.score ?? 0) >= 9
                      ? V.g2
                      : Number(response.details?.score ?? 0) >= 7
                        ? V.y
                        : V.r,
                }}
              >
                {response.details?.score ?? '—'}
              </span>
              <span style={{ fontSize: 11, color: V.t }}>
                {response.details?.comment || 'Sem comentário'}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                {response.details?.orderId || '—'}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                {response.createdAt
                  ? new Date(response.createdAt).toLocaleDateString('pt-BR')
                  : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function EnvioRelatoriosTab({ filters, isMobile }: { filters: RF; isMobile: boolean }) {
  const [email, setEmail] = useState('');
  const [reportType, setReportType] = useState('vendas');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; message: string } | null>(null);

  const handleSendReport = async () => {
    if (!email.trim()) {
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const reportFilters = Object.fromEntries(
        Object.entries(filters)
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
          .map(([key, value]) => [key, String(value)]),
      );
      const res = await sendReportEmail({
        email: email.trim(),
        reportType,
        period: `${filters.startDate},${filters.endDate}`,
        filters: reportFilters,
      });
      const resObj = res as unknown as Record<string, unknown>;
      if (resObj?.error) {
        throw new Error(String(resObj.error));
      }
      setResult({ ok: true, message: `Relatório enviado para ${email.trim()}` });
    } catch (error: unknown) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Falha ao enviar relatório.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.1fr) minmax(280px,0.9fr)',
        gap: 16,
      }}
    >
      <div style={{ ...cs, padding: 20 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: V.t,
            display: 'block',
            marginBottom: 16,
          }}
        >
          {kloelT(`Enviar relatório por email`)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <span style={ls}>{kloelT(`Email de destino`)}</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={kloelT(`financeiro@empresa.com`)}
              style={is}
            />
          </div>
          <div>
            <span style={ls}>{kloelT(`Tipo de relatório`)}</span>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} style={is}>
              <option value="vendas">{kloelT(`Resumo de vendas`)}</option>
              <option value="assinaturas">{kloelT(`Assinaturas`)}</option>
              <option value="abandonos">{kloelT(`Abandonos`)}</option>
              <option value="chargeback">{kloelT(`Chargebacks`)}</option>
            </select>
          </div>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 6,
              background: V.e,
              border: `1px solid ${V.b}`,
              color: V.t2,
              fontSize: 12,
            }}
          >
            {kloelT(`Período atual:`)} {filters.startDate} {kloelT(`até`)} {filters.endDate}
          </div>
          <Bt primary onClick={handleSendReport} style={{ width: 'fit-content' }}>
            {IC.file(14)} {sending ? 'Enviando...' : 'Enviar relatório'}
          </Bt>
          {result && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: result.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${result.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                color: result.ok ? V.g2 : V.r,
                fontFamily: M,
                fontSize: 12,
              }}
            >
              {result.message}
            </div>
          )}
        </div>
      </div>
      <div style={{ ...cs, padding: 20 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: V.t,
            display: 'block',
            marginBottom: 16,
          }}
        >
          {kloelT(`Rotina recomendada`)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            'Financeiro: receba um resumo diário de receita e pendências.',
            'Operação: acompanhe abandonos e chargebacks com o mesmo período filtrado.',
            'Comercial: use o envio recorrente para alinhar vendas, afiliados e churn.',
          ].map((item) => (
            <div
              key={item}
              style={{
                padding: '12px 14px',
                borderRadius: 6,
                background: V.e,
                border: `1px solid ${V.b}`,
                color: V.t2,
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportacoesTab({
  setPage,
  exportReport,
  router,
  setActive,
}: {
  setPage: React.Dispatch<React.SetStateAction<number>>;
  exportReport: (tabKey: string, fileLabel?: string) => void;
  router: ReturnType<typeof useRouter>;
  setActive: React.Dispatch<React.SetStateAction<string>>;
}) {
  const reportCards = [
    { key: 'vendas', label: 'Vendas', desc: 'Resumo completo de pedidos e receita do período.' },
    {
      key: 'assinaturas',
      label: 'Assinaturas',
      desc: 'Base recorrente, status e próximas cobranças.',
    },
    { key: 'abandonos', label: 'Abandonos', desc: 'Checkouts não concluídos e valor perdido.' },
    {
      key: 'chargeback',
      label: 'Chargebacks',
      desc: 'Disputas, valores e histórico de perda/ganho.',
    },
    {
      key: 'engajamento',
      label: 'Engajamento',
      desc: 'Mensagens, contatos e performance operacional.',
    },
    {
      key: 'satisfacao',
      label: 'Satisfação',
      desc: 'NPS, comentários e visão de experiência do cliente.',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14,
      }}
    >
      {reportCards.map((report) => (
        <div key={report.key} style={{ ...cs, padding: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 8,
            }}
          >
            {report.label}
          </span>
          <span
            style={{
              fontSize: 12,
              color: V.t2,
              display: 'block',
              lineHeight: 1.6,
              minHeight: 56,
            }}
          >
            {report.desc}
          </span>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Bt primary onClick={() => exportReport(report.key, report.label.toLowerCase())}>
              {IC.dl(14)} {kloelT(`Exportar CSV`)}
            </Bt>
            <Bt
              onClick={() => {
                setActive(report.key);
                setPage(1);
                router.replace(`/analytics?tab=${report.key}`);
              }}
            >
              {IC.eye(14)} {kloelT(`Abrir`)}
            </Bt>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── AFILIADOS TAB ──
function AfiliadosTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<ReportRow[]>('afiliados', filters);
  const rows = Array.isArray(data) ? data : [];
  return (
    <div style={{ ...cs, overflow: 'hidden' }}>
      <TableHeader
        cols={[
          { l: 'Afiliado', w: '2fr' },
          { l: 'Vendas', w: '0.8fr' },
          { l: 'Receita', w: '1fr' },
          { l: 'Comissão', w: '1fr' },
          { l: 'Status', w: '0.4fr' },
        ]}
      />
      {isLoading ? (
        <div style={{ padding: 20 }}>
          <NP w={200} h={20} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message={kloelT(`Nenhum afiliado encontrado`)} />
      ) : (
        rows.map((a: ReportRow, i: number) => (
          <div
            key={a.id || i}
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr .8fr 1fr 1fr .4fr',
              padding: '12px 14px',
              borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = V.e;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div>
              <span style={{ fontSize: 12, fontWeight: 500, color: V.t, display: 'block' }}>
                {a.partnerName || '—'}
              </span>
              <span style={{ fontSize: 9, color: V.t3 }}>{a.partnerEmail}</span>
            </div>
            <span style={{ fontFamily: M, fontSize: 12, color: V.bl, fontWeight: 600 }}>
              {a.totalSales || 0}
            </span>
            <span style={{ fontFamily: M, fontSize: 11, color: V.t2 }}>
              {R$((a.totalRevenue || 0) * 100)}
            </span>
            <span style={{ fontFamily: M, fontSize: 12, fontWeight: 700, color: V.em }}>
              {R$((a.totalCommission || 0) * 100)}
            </span>
            <StatusDot color={(stMap[a.status ?? ''] || { c: V.t3 }).c} />
          </div>
        ))
      )}
    </div>
  );
}

// ── INDICADORES TAB ──
function IndicadoresTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<ReportRow[]>('indicadores', filters);
  const rows = Array.isArray(data) ? data : [];
  return (
    <>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Afiliado', w: '1.8fr' },
            { l: 'Vendas', w: '0.8fr' },
            { l: 'Receita', w: '1fr' },
            { l: 'Comissão', w: '1fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhum indicador encontrado`)} />
        ) : (
          rows.map((a: ReportRow, i: number) => (
            <div
              key={a.partnerName || a.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr .8fr 1fr 1fr',
                padding: '14px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <div>
                <span style={{ fontSize: 12, fontWeight: 500, color: V.t, display: 'block' }}>
                  {a.partnerName}
                </span>
                <span style={{ fontSize: 9, color: V.t3 }}>{a.partnerEmail}</span>
              </div>
              <span style={{ fontFamily: M, fontSize: 11, color: V.t2 }}>{a.totalSales || 0}</span>
              <span style={{ fontFamily: M, fontSize: 11, color: V.g2, fontWeight: 600 }}>
                {R$((a.totalRevenue || 0) * 100)}
              </span>
              <span style={{ fontFamily: M, fontSize: 12, fontWeight: 700, color: V.em }}>
                {R$((a.totalCommission || 0) * 100)}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── ASSINATURAS TAB ──
function AssinaturasTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<AssinaturasResponse>('assinaturas', baseFilters);
  const rows = data?.data || [];
  const summary = data?.summary || [];
  const activeCount =
    summary.find((s: SubscriptionSummaryRow) => s.status === 'ACTIVE')?._count || 0;
  const cancelledCount =
    summary.find((s: SubscriptionSummaryRow) => s.status === 'CANCELLED')?._count || 0;
  const pastDueCount =
    summary.find((s: SubscriptionSummaryRow) => s.status === 'PAST_DUE')?._count || 0;
  const othersCount = summary
    .filter((s: SubscriptionSummaryRow) => !['ACTIVE', 'CANCELLED', 'PAST_DUE'].includes(s.status))
    .reduce((acc: number, s: SubscriptionSummaryRow) => acc + (s._count || 0), 0);
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Ativas`)}
          value={String(activeCount)}
          color={V.g2}
          icon={IC.check}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Canceladas`)}
          value={String(cancelledCount)}
          color={V.r}
          icon={IC.ban}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Atrasadas`)}
          value={String(pastDueCount)}
          color={V.y}
          icon={IC.alert}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Outros`)}
          value={String(othersCount)}
          color={V.t3}
          icon={IC.clock}
          loading={isLoading}
        />
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...cs,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.cy, l: 'Iniciada' },
          { c: V.bl, l: 'Aguardando' },
          { c: V.g2, l: 'Ativa' },
          { c: V.y, l: 'Atrasada' },
          { c: V.r, l: 'Cancelada' },
          { c: V.t3, l: 'Inativa' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Assinante', w: '1.8fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Próx. Cobrança', w: '0.9fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhuma assinatura encontrada`)} />
        ) : (
          rows.map((s: ReportRow, i: number) => {
            const st = stMap[s.status ?? ''] || { c: V.t3, l: s.status };
            return (
              <div
                key={s.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.8fr 1fr .7fr .9fr .4fr',
                  padding: '12px 14px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = V.e;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                    {s.customerName}
                  </span>
                  <span style={{ fontSize: 9, color: V.t3 }}>{s.customerEmail}</span>
                </div>
                <span style={{ fontSize: 11, color: V.em }}>{s.planName || '—'}</span>
                <span style={{ fontFamily: M, fontSize: 10, fontWeight: 600, color: V.t }}>
                  {R$(s.amount || 0)}
                </span>
                <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                  {s.nextBillingAt ? new Date(s.nextBillingAt).toLocaleDateString('pt-BR') : '—'}
                </span>
                <StatusDot color={st.c} />
              </div>
            );
          })
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── INDICADORES PRODUTO TAB ──
function IndProdTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<ReportRow[]>('indicadores-produto', filters);
  const rows = Array.isArray(data) ? data : [];
  return (
    <>
      {rows.length > 0 ? (
        <div style={{ ...cs, padding: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            {kloelT(`Vendas por dia`)}
          </span>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray={kloelT(`3 3`)} stroke={V.b} vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 7, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(8, 10) : '')}
              />
              <YAxis
                tick={{ fontSize: 8, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="vendas" fill={V.p} radius={[3, 3, 0, 0]} name="Vendas" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : isLoading ? (
        <div style={{ ...cs, padding: 20 }}>
          <NP w={200} h={20} />
        </div>
      ) : (
        <EmptyState message={kloelT(`Selecione um produto para ver indicadores`)} />
      )}
    </>
  );
}

// ── RECUSA TAB ──
function RecusaTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('recusa', baseFilters);
  const rows = data?.data || [];
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        <MetricCard
          title={kloelT(`Total recusas`)}
          value={String(data?.total || 0)}
          sub={kloelT(`No período`)}
          color={V.r}
          icon={IC.alert}
          loading={isLoading}
        />
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Pedido', w: '0.7fr' },
            { l: 'Comprador', w: '1.3fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Data', w: '0.8fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhuma recusa no período`)} />
        ) : (
          rows.map((r: ReportRow, i: number) => (
            <div
              key={r.id || i}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.7fr 1.3fr 1fr 0.8fr .4fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                {r.order?.orderNumber || r.id?.slice(0, 10)}
              </span>
              <div>
                <span style={{ fontSize: 11, color: V.t, display: 'block' }}>
                  {r.order?.customerName}
                </span>
                <span style={{ fontSize: 9, color: V.t3 }}>{r.order?.customerEmail}</span>
              </div>
              <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>
                {r.order?.plan?.product?.name || '—'}
              </span>
              <span style={{ fontFamily: M, fontSize: 9, color: V.t2 }}>
                {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : '—'}
              </span>
              <StatusDot color={V.r} />
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── ORIGEM TAB ──
function OrigemTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<ReportRow[]>('origem', filters);
  const rows = Array.isArray(data) ? data : [];
  const PIE_COLORS = [V.em, V.bl, V.p, V.g2, V.y, V.cy, V.pk, V.r, V.t3];
  const totalVendas = rows.reduce((s: number, r: ReportRow) => s + (Number(r.vendas) || 0), 0);
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        <MetricCard
          title={kloelT(`Total vendas rastreadas`)}
          value={Fmt(totalVendas)}
          color={V.em}
          icon={IC.globe}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Fontes ativas`)}
          value={String(rows.length)}
          color={V.bl}
          icon={IC.link}
          loading={isLoading}
        />
      </div>
      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ ...cs, padding: 20, flex: 1.5 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: V.t,
                display: 'block',
                marginBottom: 16,
              }}
            >
              {kloelT(`Vendas por origem`)}
            </span>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={rows.map((d: ReportRow) => ({
                  name:
                    (d.source || '').length > 16 ? `${(d.source || '').slice(0, 14)}...` : d.source,
                  vendas: d.vendas,
                }))}
                layout="vertical"
                margin={{ left: 10 }}
              >
                <CartesianGrid strokeDasharray={kloelT(`3 3`)} stroke={V.b} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 8, fill: V.t3, fontFamily: M }}
                  stroke={V.b}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 9, fill: V.t2, fontFamily: S }}
                  stroke={V.b}
                  tickLine={false}
                  width={100}
                />
                <Tooltip content={<CTooltip />} />
                <Bar dataKey="vendas" fill={V.em} radius={[0, 4, 4, 0]} name="Vendas" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...cs, padding: 20, flex: 1 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: V.t,
                display: 'block',
                marginBottom: 16,
              }}
            >
              {kloelT(`Distribuição`)}
            </span>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={rows.map((d: ReportRow) => ({ name: d.source, value: d.vendas }))}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  dataKey="value"
                  stroke={V.void}
                  strokeWidth={2}
                >
                  {rows.map((r: ReportRow, i: number) => (
                    <Cell key={r.source || `cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {!isLoading && rows.length === 0 && (
        <EmptyState message={kloelT(`Nenhuma venda paga no período`)} />
      )}
      {rows.length > 0 && (
        <div style={{ ...cs, overflow: 'hidden' }}>
          <TableHeader
            cols={[
              { l: 'Fonte', w: '1.5fr' },
              { l: 'Vendas', w: '0.6fr' },
              { l: 'Receita', w: '1fr' },
              { l: '% Total', w: '1fr' },
            ]}
          />
          {rows.map((o: ReportRow, i: number) => {
            const perc = totalVendas > 0 ? ((o.vendas ?? 0) / totalVendas) * 100 : 0;
            return (
              <div
                key={o.source}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 0.6fr 1fr 1fr',
                  padding: '12px 14px',
                  borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = V.e;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 8,
                      background: PIE_COLORS[i % PIE_COLORS.length],
                    }}
                  />
                  <span style={{ fontSize: 12, color: V.t, fontWeight: 500 }}>{o.source}</span>
                </div>
                <span style={{ fontFamily: M, fontSize: 12, color: V.bl, fontWeight: 600 }}>
                  {Fmt(o.vendas ?? 0)}
                </span>
                <span style={{ fontFamily: M, fontSize: 11, color: V.t2 }}>
                  {R$(o.receita || 0)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 5,
                      background: V.e,
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${perc}%`,
                        height: '100%',
                        background: PIE_COLORS[i % PIE_COLORS.length],
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: M,
                      fontSize: 11,
                      fontWeight: 700,
                      color: V.em,
                      minWidth: 44,
                      textAlign: 'right',
                    }}
                  >
                    {perc.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── MÉTRICAS TAB ──
function MetricasTab({ filters }: { filters: RF }) {
  const { data, isLoading } = useReport<MetricasResponse>('metricas', filters);
  const methods = data?.byMethod || {};
  const total = data?.totalSales || 0;
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Total vendas`)}
          value={Fmt(total)}
          color={V.em}
          icon={IC.chart}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Conversão`)}
          value={`${data?.conversao || 0}%`}
          color={V.g2}
          icon={IC.perc}
          loading={isLoading}
        />
        <MetricCard
          title="ROAS"
          value={data?.roas ? `${data.roas}x` : '\u2014'}
          sub={
            data?.totalAdSpend
              ? `Ad spend: ${R$(data.totalAdSpend)}`
              : 'Registre gastos com an\u00FAncios'
          }
          color={
            data?.roas && Number.parseFloat(data.roas) >= 3
              ? V.g2
              : data?.roas && Number.parseFloat(data.roas) >= 1.5
                ? V.y
                : V.r
          }
          icon={IC.target}
          loading={isLoading}
        />
      </div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        {[
          { l: 'Cartão', v: methods.CREDIT_CARD || 0, c: V.g2 },
          { l: 'Pix', v: methods.PIX || 0, c: V.bl },
          { l: 'Boleto', v: methods.BOLETO || 0, c: V.y },
        ].map((m) => (
          <div key={m.l} style={{ ...cs, padding: 16, flex: 1 }}>
            <span style={{ fontSize: 11, color: V.t2, display: 'block' }}>{m.l}</span>
            <span
              style={{
                fontFamily: M,
                fontSize: 28,
                fontWeight: 700,
                color: m.c,
                display: 'block',
                marginTop: 4,
              }}
            >
              {Fmt(m.v)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <div
                style={{
                  flex: 1,
                  height: 4,
                  background: V.e,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${total > 0 ? (m.v / total) * 100 : 0}%`,
                    height: '100%',
                    background: m.c,
                    borderRadius: 2,
                  }}
                />
              </div>
              <span style={{ fontSize: 10, color: V.t3 }}>
                {total > 0 ? ((m.v / total) * 100).toFixed(1) : 0}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── ESTORNOS TAB ──
function EstornosTab({
  filters,
  setFilters,
  baseFilters,
  page,
  setPage,
}: {
  filters: RF;
  setFilters: React.Dispatch<React.SetStateAction<RF>>;
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<PaginatedReport>('estornos', baseFilters);
  const rows = data?.data || [];
  const valorEstornado = rows.reduce(
    (acc: number, r: ReportRow) => acc + (Number(r.totalInCents) || 0),
    0,
  );
  const processandoCount = rows.filter(
    (r: ReportRow) => r.status === 'PROCESSING' || r.status === 'PENDING',
  ).length;
  const negadosCount = rows.filter(
    (r: ReportRow) => r.status === 'DECLINED' || r.status === 'DENIED',
  ).length;
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Total estornos`)}
          value={String(data?.total || 0)}
          sub={kloelT(`No período`)}
          color={V.r}
          icon={IC.undo}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Valor estornado`)}
          value={R$(valorEstornado)}
          sub={kloelT(`Soma dos estornos`)}
          color={V.p}
          icon={IC.dollar}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Processando`)}
          value={String(processandoCount)}
          sub={kloelT(`Em andamento`)}
          color={V.bl}
          icon={IC.clock}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Negados`)}
          value={String(negadosCount)}
          sub={kloelT(`Estornos negados`)}
          color={V.y}
          icon={IC.ban}
          loading={isLoading}
        />
      </div>
      <FilterBar>
        <FilterField label={kloelT(`Produto`)}>
          <select
            style={is}
            value={filters.product || ''}
            onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}
          >
            <option value="">{kloelT(`Todos`)}</option>
          </select>
        </FilterField>
        <FilterField label={kloelT(`Status`)}>
          <select
            style={is}
            value={filters.status || ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">{kloelT(`Todos`)}</option>
            <option value="REFUNDED">{kloelT(`Estornado`)}</option>
            <option value="PROCESSING">{kloelT(`Processando`)}</option>
            <option value="DECLINED">{kloelT(`Negado`)}</option>
          </select>
        </FilterField>
      </FilterBar>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...cs,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.bl, l: 'Processando' },
          { c: V.p, l: 'Estornado' },
          { c: V.y, l: 'Negado' },
          { c: V.r, l: 'Cancelado' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Pedido', w: '0.7fr' },
            { l: 'Comprador', w: '1.4fr' },
            { l: 'Produto', w: '1fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Data', w: '0.8fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhum estorno no período`)} />
        ) : (
          rows.map((e: ReportRow, i: number) => (
            <div
              key={e.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.7fr 1.4fr 1fr 0.7fr 0.8fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(el) => {
                el.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(el) => {
                el.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontFamily: M, fontSize: 9, color: V.t3 }}>
                {e.orderNumber || e.id?.slice(0, 12)}
              </span>
              <div>
                <span style={{ fontSize: 11, color: V.t, display: 'block' }}>{e.customerName}</span>
                <span style={{ fontSize: 9, color: V.t3 }}>{e.customerEmail}</span>
              </div>
              <span style={{ fontSize: 10, color: V.em, fontWeight: 500 }}>
                {e.plan?.product?.name || '—'}
              </span>
              <span style={{ fontFamily: M, fontSize: 11, fontWeight: 600, color: V.r }}>
                {R$(e.totalInCents || 0)}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                {e.refundedAt ? new Date(String(e.refundedAt)).toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── CHARGEBACK TAB ──
function ChargebackTab({
  baseFilters,
  page,
  setPage,
}: {
  baseFilters: RF;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { data, isLoading } = useReport<ChargebackResponse>('chargeback', baseFilters);
  const rows = data?.data || [];
  const totalChargebackValue = rows.reduce(
    (acc: number, c: ReportRow) => acc + (Number(c.order?.totalInCents) || 0),
    0,
  );
  const ganhos = rows.filter(
    (c: ReportRow) => c.status === 'WON' || c.status === 'RESOLVED',
  ).length;
  const taxaMedia =
    rows.length > 0 ? (totalChargebackValue / rows.length / 100).toFixed(2) : '0.00';
  const monthly = data?.monthly || [];
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Ganhos cartão`)}
          value={String(ganhos)}
          sub={kloelT(`Disputas ganhas`)}
          color={V.g2}
          icon={IC.check}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Total chargebacks`)}
          value={String(data?.total || 0)}
          sub={kloelT(`Disputas`)}
          color={V.pk}
          icon={IC.ban}
          loading={isLoading}
        />
        <MetricCard
          title={kloelT(`Taxa média`)}
          value={`R$ ${taxaMedia}`}
          sub={kloelT(`Valor médio por disputa`)}
          color={V.y}
          icon={IC.perc}
          loading={isLoading}
        />
      </div>
      {monthly.length > 0 && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            {kloelT(`Ganhos vs Chargebacks`)}
          </span>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={monthly}>
              <CartesianGrid strokeDasharray={kloelT(`3 3`)} stroke={V.b} vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 9, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: V.t3, fontFamily: M }}
                stroke={V.b}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CTooltip />} />
              <Bar dataKey="ganhos" fill={V.g2} radius={[3, 3, 0, 0]} name="Ganhos" />
              <Bar dataKey="chargebacks" fill={V.pk} radius={[3, 3, 0, 0]} name="Chargebacks" />
              <Line
                type="monotone"
                dataKey="taxa"
                stroke={V.y}
                strokeWidth={2}
                dot={{ fill: V.y, r: 3 }}
                name="Taxa %"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 14,
          padding: '10px 16px',
          ...cs,
          flexWrap: 'wrap',
        }}
      >
        {[
          { c: V.g2, l: 'Ganho' },
          { c: V.pk, l: 'Chargeback' },
          { c: V.y, l: 'Em disputa' },
          { c: V.r, l: 'Perdido' },
        ].map((s) => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <StatusDot color={s.c} />
            <span style={{ fontSize: 10, color: V.t2 }}>{s.l}</span>
          </div>
        ))}
      </div>
      <div style={{ ...cs, overflow: 'hidden' }}>
        <TableHeader
          cols={[
            { l: 'Comprador', w: '1.4fr' },
            { l: 'Valor', w: '0.7fr' },
            { l: 'Data', w: '0.8fr' },
            { l: 'Status', w: '0.4fr' },
          ]}
        />
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <NP w={200} h={20} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={kloelT(`Nenhum chargeback encontrado`)} />
        ) : (
          rows.map((c: ReportRow, i: number) => (
            <div
              key={c.id || i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 0.7fr 0.8fr .4fr',
                padding: '12px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${V.b}` : 'none',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = V.e;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: 11, color: V.t }}>{c.order?.customerName || '—'}</span>
              <span style={{ fontFamily: M, fontSize: 11, fontWeight: 600, color: V.pk }}>
                {R$(c.order?.totalInCents || 0)}
              </span>
              <span style={{ fontFamily: M, fontSize: 10, color: V.t2 }}>
                {c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '—'}
              </span>
              <StatusDot color={V.pk} />
            </div>
          ))
        )}
        <Pagination total={data?.total || 0} page={page} setPage={setPage} />
      </div>
    </>
  );
}

// ── ENGAJAMENTO TAB — smart-time + analytics/stats + analytics/reports ──
function EngajamentoTab({ filters }: { filters: RF }) {
  const { smartTime, isLoading: stLoading } = useSmartTime();
  const { stats, isLoading: statsLoading } = useAnalyticsStats();
  const { report, isLoading: rLoading } = useReports(
    filters.startDate && filters.endDate ? `custom:${filters.startDate}:${filters.endDate}` : '30d',
  );

  const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          title={kloelT(`Mensagens enviadas`)}
          value={statsLoading ? '...' : Fmt(stats?.messages || 0)}
          sub={`${Fmt(stats?.contacts || 0)} contatos ativos`}
          color={V.bl}
          icon={IC.phone}
          loading={statsLoading}
        />
        <MetricCard
          title={kloelT(`Taxa de entrega`)}
          value={statsLoading ? '...' : `${(stats?.deliveryRate || 0).toFixed(1)}%`}
          sub={`Leitura: ${(stats?.readRate || 0).toFixed(1)}%`}
          color={V.g2}
          icon={IC.check}
          loading={statsLoading}
        />
        <MetricCard
          title={kloelT(`Flows ativos`)}
          value={statsLoading ? '...' : Fmt(stats?.flows || 0)}
          sub={`${Fmt(stats?.flowCompleted || 0)} concluídos`}
          color={V.em}
          icon={IC.chart}
          loading={statsLoading}
        />
        <MetricCard
          title={kloelT(`Melhor horário`)}
          value={stLoading ? '...' : smartTime ? `${smartTime.peakHour}h` : '--'}
          sub={
            stLoading
              ? ''
              : smartTime
                ? `Melhor dia: ${DAYS[new Date(smartTime.peakDay || '').getDay()] || smartTime.peakDay}`
                : 'Sem dados suficientes'
          }
          color={V.y}
          icon={IC.clock}
          loading={stLoading}
        />
      </div>

      {/* Smart Time Heatmap */}
      {!stLoading && smartTime && smartTime.heatmap && smartTime.heatmap.length > 0 && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 4,
            }}
          >
            {kloelT(`Melhor horário para envio`)}
          </span>
          <span style={{ fontSize: 10, color: V.t3, display: 'block', marginBottom: 16 }}>
            {kloelT(`Baseado no histórico de respostas do seu workspace`)}
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(24, 1fr)`, gap: 2 }}>
            <div />
            {HOURS.map((h) => (
              <span
                key={h}
                style={{ fontSize: 7, color: V.t3, textAlign: 'center', fontFamily: M }}
              >
                {h}h
              </span>
            ))}
            {DAYS.map((day) => (
              <React.Fragment key={day}>
                <span
                  style={{
                    fontSize: 9,
                    color: V.t2,
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: M,
                  }}
                >
                  {day}
                </span>
                {HOURS.map((h) => {
                  const cell = smartTime.heatmap.find((c) => c.day === day && c.hour === h);
                  const score = cell?.score || 0;
                  const opacity = Math.min(score, 1);
                  return (
                    <div
                      key={`${day}-${h}`}
                      title={`${day} ${h}h — score: ${(score * 100).toFixed(0)}%`}
                      style={{
                        height: 16,
                        borderRadius: 2,
                        background: score > 0 ? V.em : V.b,
                        opacity: score > 0 ? 0.2 + opacity * 0.8 : 0.3,
                      }}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 9, color: V.t3 }}>{kloelT(`Menos ativo`)}</span>
            {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
              <div
                key={o}
                style={{ width: 16, height: 10, borderRadius: 2, background: V.em, opacity: o }}
              />
            ))}
            <span style={{ fontSize: 9, color: V.t3 }}>{kloelT(`Mais ativo`)}</span>
          </div>
        </div>
      )}
      {!stLoading && !smartTime && (
        <EmptyState
          message={kloelT(
            `Dados de melhor horário indisponíveis. Envie mais mensagens para gerar análise.`,
          )}
        />
      )}

      {/* Full report from analytics/reports */}
      {!rLoading && report && (
        <div style={{ ...cs, padding: 20, marginBottom: 20 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: V.t,
              display: 'block',
              marginBottom: 16,
            }}
          >
            {kloelT(`Resumo do período`)}
          </span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {[
              { l: 'Mensagens', v: report?.messages?.total || report?.messages || 0 },
              { l: 'Leads novos', v: report?.leads?.newContacts || 0 },
              { l: 'Flows executados', v: report?.flows?.executions || 0 },
              { l: 'Flows concluidos', v: report?.flows?.completed || 0 },
              {
                l: 'Receita (vendas)',
                v: report?.sales?.revenue ? R$(report.sales.revenue) : '--',
              },
            ].map((item) => (
              <div key={item.l} style={{ background: V.e, borderRadius: 6, padding: '14px 16px' }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: V.t3,
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  {item.l}
                </span>
                <span style={{ fontFamily: M, fontSize: 18, fontWeight: 700, color: V.em }}>
                  {typeof item.v === 'number' ? Fmt(item.v) : item.v}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sentiment & Lead Score from stats */}
      {!statsLoading && stats && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {stats.sentiment && (
            <div style={{ ...cs, padding: 20, flex: 1, minWidth: 240 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: V.t,
                  display: 'block',
                  marginBottom: 16,
                }}
              >
                {kloelT(`Sentimento das conversas`)}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { l: 'Positivo', v: stats.sentiment.positive, c: V.g2 },
                  { l: 'Neutro', v: stats.sentiment.neutral, c: V.y },
                  { l: 'Negativo', v: stats.sentiment.negative, c: V.r },
                ].map((s) => (
                  <div key={s.l} style={{ flex: 1, textAlign: 'center' }}>
                    <span
                      style={{
                        fontFamily: M,
                        fontSize: 22,
                        fontWeight: 700,
                        color: s.c,
                        display: 'block',
                      }}
                    >
                      {s.v}
                    </span>
                    <span style={{ fontSize: 10, color: V.t3 }}>{s.l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.leadScore && (
            <div style={{ ...cs, padding: 20, flex: 1, minWidth: 240 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: V.t,
                  display: 'block',
                  marginBottom: 16,
                }}
              >
                {kloelT(`Score dos leads`)}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { l: 'Alto', v: stats.leadScore.high, c: V.em },
                  { l: 'Medio', v: stats.leadScore.medium, c: V.y },
                  { l: 'Baixo', v: stats.leadScore.low, c: V.t3 },
                ].map((s) => (
                  <div key={s.l} style={{ flex: 1, textAlign: 'center' }}>
                    <span
                      style={{
                        fontFamily: M,
                        fontSize: 22,
                        fontWeight: 700,
                        color: s.c,
                        display: 'block',
                      }}
                    >
                      {s.v}
                    </span>
                    <span style={{ fontSize: 10, color: V.t3 }}>{s.l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function KloelRelatorio() {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');
  const [active, setActive] = useState(normalizeVisibleReportTab(tabParam));

  // Sync tab from URL params (when navigating from sidebar)
  useEffect(() => {
    const nextTab = normalizeVisibleReportTab(tabParam);
    if (nextTab !== active) {
      setActive(nextTab);
    }
    if (tabParam && !VISIBLE_REPORT_TABS.has(tabParam)) {
      router.replace('/analytics?tab=vendas');
    }
  }, [active, router, tabParam]);
  const [page, setPage] = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<RF>({
    startDate: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const baseFilters = { ...filters, page, perPage: 10 };

  const resolveExportEndpoint = useCallback((tabKey: string) => {
    const map: Record<string, string | null> = {
      vendas: 'vendas',
      afterpay: 'afterpay',
      churn: 'churn',
      abandonos: 'abandonos',
      satisfacao: 'nps',
      afiliados: 'afiliados',
      indicadores: 'indicadores',
      assinaturas: 'assinaturas',
      ind_prod: 'indicadores-produto',
      recusa: 'recusa',
      origem: 'origem',
      metricas: 'metricas',
      estornos: 'estornos',
      chargeback: 'chargeback',
      engajamento: 'engajamento',
      envio: null,
      exportacoes: null,
    };
    return map[tabKey] ?? null;
  }, []);

  const exportReport = useCallback(
    (tabKey: string, fileLabel?: string) => {
      const ep = resolveExportEndpoint(tabKey);
      if (!ep) {
        return;
      }
      const url = buildUrl(ep, { ...filters, perPage: 1000 });
      swrFetcher(url)
        .then((data: unknown) => {
          const rows: ReportRow[] = Array.isArray(data)
            ? (data as ReportRow[])
            : ep === 'nps'
              ? ((data as Record<string, unknown>)?.responses as ReportRow[]) || []
              : ((data as Record<string, unknown>)?.data as ReportRow[]) || [];
          if (rows.length === 0) {
            return;
          }
          const headers = Object.keys(rows[0]);
          const csv = [
            headers.join(','),
            ...rows.map((row: ReportRow) =>
              headers
                .map((h) => {
                  const val = row[h];
                  if (val === null || val === undefined) {
                    return '';
                  }
                  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                  return str.includes(',') || str.includes('"')
                    ? `"${str.replace(PATTERN_RE, '""')}"`
                    : str;
                })
                .join(','),
            ),
          ].join('\n');
          const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
          const csvUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = csvUrl;
          a.download = `kloel-${fileLabel || tabKey}-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(csvUrl);
        })
        .catch(() => console.error('Export failed'));
    },
    [filters, resolveExportEndpoint],
  );

  const handleExport = useCallback(() => {
    exportReport(active, active);
  }, [active, exportReport]);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div
      style={{
        background: V.void,
        minHeight: '100vh',
        fontFamily: S,
        color: V.t,
        padding: isMobile ? '20px 16px 28px' : '28px 32px',
      }}
    >
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} ::selection{background:rgba(232,93,48,.3)} ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:${colors.border.space};border-radius:2px}`}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div />
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: isMobile ? 'stretch' : 'center',
            flexWrap: 'wrap',
            width: isMobile ? '100%' : 'auto',
          }}
        >
          <input
            aria-label="Data inicio"
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            style={{
              padding: '6px 10px',
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t,
              fontSize: 11,
              fontFamily: M,
              outline: 'none',
              width: isMobile ? '100%' : 'auto',
            }}
          />
          <span style={{ color: V.t3, fontSize: 10 }}>{kloelT(`até`)}</span>
          <input
            aria-label="Data fim"
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            style={{
              padding: '6px 10px',
              background: V.e,
              border: `1px solid ${V.b}`,
              borderRadius: 6,
              color: V.t,
              fontSize: 11,
              fontFamily: M,
              outline: 'none',
              width: isMobile ? '100%' : 'auto',
            }}
          />
          <Bt primary onClick={() => setShowFilter(true)}>
            {IC.filter(14)} {kloelT(`Filtro avançado`)}
          </Bt>
          {!['envio', 'exportacoes'].includes(active) && (
            <Bt accent={V.g2} onClick={handleExport}>
              {IC.dl(14)} {kloelT(`Excel`)}
            </Bt>
          )}
        </div>
      </div>

      {/* Tabs — pill style */}
      <div style={SUBINTERFACE_PILL_ROW_STYLE}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.k}
            onClick={() => {
              setActive(t.k);
              setPage(1);
              router.replace(`/analytics?tab=${t.k}`);
            }}
            style={getSubinterfacePillStyle(active === t.k, isMobile)}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.ic(14)}</span>
            {t.l}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ animation: 'fadeIn .3s ease', maxWidth: 1240, margin: '0 auto' }} key={active}>
        {active === 'vendas' && (
          <VendasTab
            filters={filters}
            baseFilters={baseFilters}
            page={page}
            setPage={setPage}
            isMobile={isMobile}
          />
        )}
        {active === 'afterpay' && (
          <AfterPayTab
            filters={filters}
            setFilters={setFilters}
            baseFilters={baseFilters}
            page={page}
            setPage={setPage}
          />
        )}
        {active === 'churn' && <ChurnTab filters={filters} />}
        {active === 'abandonos' && (
          <AbandonosTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'satisfacao' && <SatisfacaoTab />}
        {active === 'envio' && <EnvioRelatoriosTab filters={filters} isMobile={isMobile} />}
        {active === 'exportacoes' && (
          <ExportacoesTab
            setPage={setPage}
            exportReport={exportReport}
            router={router}
            setActive={setActive}
          />
        )}
        {active === 'afiliados' && <AfiliadosTab filters={filters} />}
        {active === 'indicadores' && <IndicadoresTab filters={filters} />}
        {active === 'assinaturas' && (
          <AssinaturasTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'ind_prod' && <IndProdTab filters={filters} />}
        {active === 'recusa' && (
          <RecusaTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'origem' && <OrigemTab filters={filters} />}
        {active === 'metricas' && <MetricasTab filters={filters} />}
        {active === 'estornos' && (
          <EstornosTab
            filters={filters}
            setFilters={setFilters}
            baseFilters={baseFilters}
            page={page}
            setPage={setPage}
          />
        )}
        {active === 'chargeback' && (
          <ChargebackTab baseFilters={baseFilters} page={page} setPage={setPage} />
        )}
        {active === 'engajamento' && <EngajamentoTab filters={filters} />}
      </div>

      <FilterDrawer
        open={showFilter}
        onClose={() => setShowFilter(false)}
        filters={filters}
        setFilters={setFilters}
      />
    </div>
  );
}

