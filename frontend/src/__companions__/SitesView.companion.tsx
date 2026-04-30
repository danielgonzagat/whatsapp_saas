function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: (s: number) => React.ReactElement;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        gap: 12,
      }}
    >
      <span style={{ color: EMBER, opacity: 0.25 }}>{icon(60)}</span>
      <div style={{ fontFamily: SORA, fontSize: 16, color: TEXT }}>{title}</div>
      <div
        style={{
          fontFamily: SORA,
          fontSize: 13,
          color: TEXT_DIM,
          maxWidth: 400,
          textAlign: 'center',
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? EMBER : BORDER,
          transition: 'all .2s',
          position: 'relative',
          padding: 2,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform .2s',
          }}
        />
      </div>
      {label && <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT }}>{label}</span>}
    </button>
  );
}

// ── NeuralPulse canvas ──
function NeuralPulse({ w, h, color = EMBER }: { w: number; h: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) {
      return;
    }
    const ctx = c.getContext('2d');
    if (!ctx) {
      return;
    }
    let frame = 0;
    let raf: number;
    let visible = true;
    const obs = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { threshold: 0 },
    );
    obs.observe(c);
    const draw = () => {
      if (!visible) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.15 + Math.sin(frame * 0.02 + i) * 0.1;
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 2) {
          const spike = secureRandomFloat() > 0.97 ? (secureRandomFloat() - 0.5) * h * 0.6 : 0;
          const y =
            h / 2 + Math.sin(x * 0.04 + frame * 0.03 + i * 1.5) * (h * 0.25 + i * 2) + spike;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      frame++;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, [w, h, color]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ display: 'block', opacity: 0.6, pointerEvents: 'none' }}
    />
  );
}

// ══════════════════════════════════════════
// TAB: Visao Geral
// ══════════════════════════════════════════

type OverviewSite = {
  name: string;
  domain: string;
  status: 'online' | 'offline' | 'warning' | 'building';
  views: number;
  uptime: number;
};

const OVERVIEW_SITES: OverviewSite[] = [
  {
    name: 'Landing Page Principal',
    domain: 'meusite.com.br',
    status: 'online',
    views: 12450,
    uptime: 99.9,
  },
  {
    name: 'Pagina de Vendas',
    domain: 'vendas.meusite.com.br',
    status: 'online',
    views: 8320,
    uptime: 99.8,
  },
  {
    name: 'Blog',
    domain: 'blog.meusite.com.br',
    status: 'building',
    views: 0,
    uptime: 0,
  },
];

function OverviewSiteCard({ site, isMobile }: { site: OverviewSite; isMobile: boolean }) {
  return (
    <Card
      style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 14,
        cursor: 'pointer',
      }}
    >
      <StatusDot status={site.status} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>{site.name}</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{site.domain}</div>
      </div>
      <Badge color={site.status === 'online' ? '#10B981' : '#8b5cf6'}>
        {site.status === 'online' ? 'Online' : 'Construindo'}
      </Badge>
      {site.views > 0 && (
        <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
          {Fmt(site.views)} visitas
        </span>
      )}
      {site.uptime > 0 && (
        <span style={{ fontFamily: MONO, fontSize: 11, color: '#10B981' }}>{site.uptime}%</span>
      )}
    </Card>
  );
}

function VisaoGeral({ switchTab }: { switchTab: (id: string) => void }) {
  const { isMobile } = useResponsiveViewport();
  const sites = OVERVIEW_SITES;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        <Stat label={kloelT(`Sites Ativos`)} value="2" icon={IC.site} />
        <Stat label={kloelT(`Dominios`)} value="3" icon={IC.globe} />
        <Stat label={kloelT(`Visitas (30d)`)} value={Fmt(20770)} icon={IC.eye} />
        <Stat label={kloelT(`Uptime Medio`)} value="99.9%" icon={IC.server} />
        <Stat label={kloelT(`SSL Ativos`)} value="3" icon={IC.lock} />
        <Stat label={kloelT(`Apps Instalados`)} value="5" icon={IC.puzzle} />
      </div>

      {/* Neural Pulse */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>
            {kloelT(`Trafego em tempo real`)}
          </span>
          <Badge>LIVE</Badge>
        </div>
        <NeuralPulse w={800} h={80} />
      </Card>

      {/* Sites List */}
      <div>
        <SectionLabel>{kloelT(`Seus Sites`)}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sites.map((s) => (
            <OverviewSiteCard key={s.domain} site={s} isMobile={isMobile} />
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <SectionLabel>{kloelT(`Acoes Rapidas`)}</SectionLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="primary" onClick={() => switchTab('criar')}>
            {IC.plus(14)} {kloelT(`Criar Novo Site`)}
          </Btn>
          <Btn variant="ghost" onClick={() => switchTab('dominios')}>
            {IC.globe(14)} {kloelT(`Gerenciar Dominios`)}
          </Btn>
          <Btn variant="ghost" onClick={() => switchTab('apps')}>
            {IC.puzzle(14)} {kloelT(`Instalar Apps`)}
          </Btn>
          <Btn variant="ghost" onClick={() => switchTab('protecao')}>
            {IC.shield(14)} {kloelT(`Verificar Seguranca`)}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Dominios
// ══════════════════════════════════════════

function Dominios() {
  const { isMobile } = useResponsiveViewport();
  // Domains loaded from backend when site module is connected
  const [domains] = useState<
    Array<{
      name: string;
      ssl: boolean;
      expires: string;
      status: string;
      dns: string;
      primary: boolean;
    }>
  >([]);
  const [newDomain, setNewDomain] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: EMBER }}>{IC.globe(24)}</span>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Dominios`)}</span>
          <Badge>{domains.length} dominios</Badge>
        </div>
      </div>

      {/* Add Domain */}
      <Card>
        <SectionLabel>{kloelT(`Adicionar Dominio`)}</SectionLabel>
        <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
          <Input
            value={newDomain}
            onChange={setNewDomain}
            placeholder={kloelT(`meunovodominio.com.br`)}
            style={{ flex: 1 }}
          />
          <Btn variant="primary" disabled={!newDomain.trim()} onClick={() => setNewDomain('')}>
            {IC.plus(14)} {kloelT(`Adicionar`)}
          </Btn>
        </div>
      </Card>

      {/* Domains Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {!isMobile && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px',
              gap: 0,
              padding: '10px 16px',
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            {['Dominio', 'SSL', 'DNS', 'Status', 'Expira', ''].map((h) => (
              <div
                key={h || 'actions'}
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: TEXT_MUTED,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                }}
              >
                {h}
              </div>
            ))}
          </div>
        )}
        {domains.map((d, i) =>
          isMobile ? (
            <div
              key={d.name}
              style={{
                padding: '14px 16px',
                borderBottom: i < domains.length - 1 ? `1px solid ${BORDER}` : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO, fontSize: 13, color: TEXT }}>{d.name}</span>
                {d.primary && <Badge color="#10B981">{kloelT(`Principal`)}</Badge>}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                <Badge color={d.dns === 'Configurado' ? '#10B981' : '#F59E0B'}>{d.dns}</Badge>
                <Badge color={d.status === 'ativo' ? '#10B981' : '#F59E0B'}>{d.status}</Badge>
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                  {kloelT(`SSL:`)} {d.ssl ? 'Ativo' : 'Pendente'}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{d.expires}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: TEXT_DIM,
                    padding: 4,
                  }}
                >
                  {IC.edit(14)}
                </button>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#ef4444',
                    padding: 4,
                  }}
                >
                  {IC.trash(14)}
                </button>
              </div>
            </div>
          ) : (
            <div
              key={d.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px',
                gap: 0,
                padding: '12px 16px',
                borderBottom: `1px solid ${BORDER}`,
                alignItems: 'center',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    color: TEXT,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {d.name}
                  {d.primary && <Badge color="#10B981">{kloelT(`Principal`)}</Badge>}
                </div>
              </div>
              <div>
                {d.ssl ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981' }}>
                    {IC.lock(12)}{' '}
                    <span style={{ fontFamily: MONO, fontSize: 11 }}>{kloelT(`Ativo`)}</span>
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#F59E0B' }}>
                    {IC.alert(12)}{' '}
                    <span style={{ fontFamily: MONO, fontSize: 11 }}>{kloelT(`Pendente`)}</span>
                  </span>
                )}
              </div>
              <div>
                <Badge color={d.dns === 'Configurado' ? '#10B981' : '#F59E0B'}>{d.dns}</Badge>
              </div>
              <div>
                <Badge color={d.status === 'ativo' ? '#10B981' : '#F59E0B'}>{d.status}</Badge>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>{d.expires}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: TEXT_DIM,
                    padding: 4,
                  }}
                >
                  {IC.edit(14)}
                </button>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#ef4444',
                    padding: 4,
                  }}
                >
                  {IC.trash(14)}
                </button>
              </div>
            </div>
          ),
        )}
      </Card>

      {/* DNS Instructions */}
      <Card>
        <SectionLabel>{kloelT(`Configuracao DNS`)}</SectionLabel>
        <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT_DIM, marginBottom: 12 }}>
          {kloelT(`Aponte os registros DNS do seu dominio para os servidores KLOEL:`)}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 2fr',
            gap: 8,
          }}
        >
          {[
            { type: 'A', name: '@', value: '76.223.105.230' },
            { type: 'CNAME', name: 'www', value: 'proxy.kloel.com' },
          ].map((r) => (
            <React.Fragment key={r.type}>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: EMBER,
                  padding: '6px 10px',
                  background: BG_ELEVATED,
                  borderRadius: 4,
                }}
              >
                {r.type}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: TEXT,
                  padding: '6px 10px',
                  background: BG_ELEVATED,
                  borderRadius: 4,
                }}
              >
                {r.name}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: TEXT_DIM,
                  padding: '6px 10px',
                  background: BG_ELEVATED,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                {r.value}
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(r.value)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: TEXT_DIM,
                    padding: 2,
                  }}
                >
                  {IC.copy(12)}
                </button>
              </div>
            </React.Fragment>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Hospedagem
// ══════════════════════════════════════════

function Hospedagem() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.server(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>{kloelT(`Hospedagem`)}</span>
        <Badge color="#10B981">{kloelT(`Plano Pro`)}</Badge>
      </div>

      {/* Server Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <Stat label="CPU" value="23%" sub={kloelT(`2 vCPUs`)} icon={IC.cpu} />
        <Stat label={kloelT(`Memoria`)} value="512MB" sub={kloelT(`de 1GB`)} icon={IC.server} />
        <Stat
          label={kloelT(`Armazenamento`)}
          value="2.4GB"
          sub={kloelT(`de 10GB`)}
          icon={IC.cloud}
        />
        <Stat
          label={kloelT(`Bandwidth`)}
          value="45GB"
          sub={kloelT(`de 100GB / mes`)}
          icon={IC.upload}
        />
      </div>

      {/* Usage Bars */}
      <Card>
        <SectionLabel>{kloelT(`Uso de Recursos`)}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'CPU', value: 23, max: 100, color: '#10B981' },
            { label: 'Memoria RAM', value: 512, max: 1024, color: '#3B82F6' },
            { label: 'Disco', value: 2.4, max: 10, color: '#F59E0B' },
            { label: 'Bandwidth', value: 45, max: 100, color: EMBER },
          ].map((r) => (
            <div key={r.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT }}>{r.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                  {typeof r.value === 'number' && r.value < 100 ? r.value : r.value}
                  {r.label === 'CPU' ? '%' : r.label === 'Memoria RAM' ? 'MB' : 'GB'} / {r.max}
                  {r.label === 'CPU' ? '%' : r.label === 'Memoria RAM' ? 'MB' : 'GB'}
                </span>
              </div>
              <ProgressBar value={r.value} max={r.max} color={r.color} />
            </div>
          ))}
        </div>
      </Card>

      {/* Server Info */}
      <Card>
        <SectionLabel>{kloelT(`Informacoes do Servidor`)}</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Regiao', value: 'Sao Paulo (sa-east-1)' },
            { label: 'IP', value: '76.223.105.230' },
            { label: 'Runtime', value: 'Node.js 20 LTS' },
            { label: 'CDN', value: 'CloudFront (ativo)' },
            { label: 'SSL', value: "Let's Encrypt (auto-renovacao)" },
            { label: 'Backups', value: 'Diarios (7 dias retencao)' },
          ].map((info) => (
            <div
              key={info.label}
              style={{ padding: '8px 12px', background: BG_ELEVATED, borderRadius: 6 }}
            >
              <div
                style={{
                  fontFamily: SORA,
                  fontSize: 10,
                  color: TEXT_MUTED,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  marginBottom: 2,
                }}
              >
                {info.label}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT }}>{info.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Uptime */}
      <Card>
        <SectionLabel>{kloelT(`Uptime (30 dias)`)}</SectionLabel>
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 40 }}>
          {Array.from({ length: 30 }, (_, i) => `day-${i + 1}`).map((dayKey) => (
            <div
              key={`uptime-${dayKey}`}
              style={{ flex: 1, height: 40, background: '#10B981', borderRadius: 2, opacity: 0.3 }}
            />
          ))}
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          {kloelT(`Dados indisponiveis — conecte seu site`)}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Criar Site
// ══════════════════════════════════════════

const FmtMoney = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

function CriarSite({ mode }: { mode?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<'ask' | 'building' | 'editor'>('ask');
  const [prompt, setPrompt] = useState('');
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [savedSiteId, setSavedSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState('');
  const [savedSites, setSavedSites] = useState<SiteItem[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { products: rawProducts } = useProducts();
  const dynamicMode = mode === 'dynamic';
  const source = searchParams?.get('source') || '';
  const productId = searchParams?.get('productId') || '';
  const productName = searchParams?.get('productName') || '';

  useEffect(() => {
    if (!dynamicMode || prompt.trim()) {
      return;
    }
    setPrompt(
      'Crie uma página de vendas dinâmica que adapte headline, provas e CTA conforme origem do tráfego, interesse do visitante e produto selecionado.',
    );
  }, [dynamicMode, prompt]);

  useEffect(() => {
    if (prompt.trim() || !productName) {
      return;
    }
    setPrompt(
      `Crie uma página de vendas para o produto ${productName}, com headline forte, provas, FAQ, CTA principal e integração natural com checkout.`,
    );
  }, [productName, prompt]);

  useEffect(() => {
    setLoadingSites(true);
    apiFetch('/kloel/site/list')
      .then((res) => {
        const data = res.data as { sites?: SiteItem[] } | undefined;
        if (data?.sites) {
          setSavedSites(data.sites);
        }
      })
      .finally(() => setLoadingSites(false));
  }, []);

  const productList = useMemo(() => {
    if (!rawProducts || !Array.isArray(rawProducts)) {
      return [];
    }
    return (rawProducts as Record<string, unknown>[])
      .slice(0, 6)
      .map((p: Record<string, unknown>) => ({
        name: (p.name as string) || (p.title as string) || 'Produto',
        price: (p.price as number) ?? 0,
      }));
  }, [rawProducts]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      return;
    }
    setError('');
    setPhase('building');
    const res = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: { prompt: prompt.trim() },
    });
    if (res.error) {
      setError(res.error);
      setPhase('ask');
      return;
    }
    const generateData = res.data as { html?: string } | undefined;
    if (generateData?.html) {
      setGeneratedHtml(generateData.html);
      setSiteName(prompt.trim().slice(0, 60));
      setPhase('editor');
    } else {
      setError('Nenhum HTML foi gerado. Tente novamente.');
      setPhase('ask');
    }
  };

  const invalidateSites = () =>
    mutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/site'));
  const handleSave = async () => {
    setSaving(true);
    setError('');
    if (savedSiteId) {
      const res = await apiFetch(`/kloel/site/${savedSiteId}`, {
        method: 'PUT',
        body: { name: siteName || 'Site sem titulo', htmlContent: generatedHtml },
      });
      if (res.error) {
        setError(res.error);
      } else {
        invalidateSites();
      }
    } else {
      const res = await apiFetch('/kloel/site/save', {
        method: 'POST',
        body: { name: siteName || 'Site sem titulo', htmlContent: generatedHtml },
      });
      if (res.error) {
        setError(res.error);
      } else {
        const saveData = res.data as { site?: { id?: string } } | undefined;
        if (saveData?.site?.id) {
          setSavedSiteId(saveData.site.id);
        }
        invalidateSites();
      }
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    if (!savedSiteId) {
      setSaving(true);
      setError('');
      const saveRes = await apiFetch('/kloel/site/save', {
        method: 'POST',
        body: { name: siteName || 'Site sem titulo', htmlContent: generatedHtml },
      });
      setSaving(false);
      if (saveRes.error) {
        setError(saveRes.error);
        return;
      }
      const saveData = saveRes.data as { site?: { id?: string } } | undefined;
      if (!saveData?.site?.id) {
        setError('Erro ao salvar site antes de publicar.');
        return;
      }
      setSavedSiteId(saveData.site.id);
      setPublishing(true);
      const pubRes = await apiFetch(`/kloel/site/${saveData.site.id}/publish`, {
        method: 'POST',
      });
      setPublishing(false);
      if (pubRes.error) {
        setError(pubRes.error);
        return;
      }
      const publishData = pubRes.data as { url?: string } | undefined;
      if (publishData?.url) {
        setPublishedUrl(publishData.url);
      }
    } else {
      setPublishing(true);
      setError('');
      const res = await apiFetch(`/kloel/site/${savedSiteId}/publish`, { method: 'POST' });
      setPublishing(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      const publishData = res.data as { url?: string } | undefined;
      if (publishData?.url) {
        setPublishedUrl(publishData.url);
      }
    }
  };

  const handleEditWithAI = async () => {
    if (!editPrompt.trim()) {
      return;
    }
    setEditLoading(true);
    setError('');
    const res = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: { prompt: editPrompt.trim(), currentHtml: generatedHtml },
    });
    setEditLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const editData = res.data as { html?: string } | undefined;
    if (editData?.html) {
      setGeneratedHtml(editData.html);
      setEditPrompt('');
    }
  };

  const loadSavedSite = (site: SiteItem) => {
    setGeneratedHtml(site.htmlContent || '');
    setSavedSiteId(site.id);
    setSiteName(site.name || '');
    setPublishedUrl(site.published && site.slug ? `/s/${site.slug}` : '');
    setPhase('editor');
  };

  const handleDelete = async (siteId: string) => {
    const res = await apiFetch(`/kloel/site/${siteId}`, { method: 'DELETE' });
    if (!res.error) {
      setSavedSites((prev) => prev.filter((s) => s.id !== siteId));
      if (savedSiteId === siteId) {
        setSavedSiteId(null);
        setGeneratedHtml('');
        setPhase('ask');
      }
      invalidateSites();
    }
  };

  // ASK PHASE
  if (phase === 'ask') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 20,
        }}
      >
        <div style={{ color: EMBER, opacity: 0.3 }}>{IC.globe(80)}</div>
        <div style={{ fontFamily: SORA, fontSize: 22, color: TEXT }}>
          {kloelT(`Criar seu Site`)}
        </div>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 14,
            color: TEXT_DIM,
            maxWidth: 400,
            textAlign: 'center',
          }}
        >
          {kloelT(
            `Descreva o site que voce quer e a IA vai gerar um site completo. Pronto em segundos.`,
          )}
        </div>
        {(source || productName) && (
          <div
            style={{
              width: '100%',
              maxWidth: 500,
              padding: '12px 16px',
              borderRadius: 6,
              border: `1px solid ${EMBER}30`,
              background: `${EMBER}10`,
            }}
          >
            <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT, marginBottom: 6 }}>
              {kloelT(`Contexto comercial`)}
            </div>
            <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
              {productName
                ? `Você veio de Produtos para publicar a oferta ${productName}. Gere a página, publique e depois volte para conectar checkout, URL e campanha.`
                : 'Use este editor para criar a superfície pública da sua oferta e conecte com checkout, domínio e publicação.'}
            </div>
          </div>
        )}
        {dynamicMode && (
          <div
            style={{
              width: '100%',
              maxWidth: 500,
              padding: '12px 16px',
              borderRadius: 6,
              border: `1px solid ${EMBER}40`,
              background: `${EMBER}10`,
            }}
          >
            <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT, marginBottom: 8 }}>
              {kloelT(`Modo páginas dinâmicas`)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                'Adapte headline por origem do tráfego',
                'Mostre provas por estágio de compra',
                'Troque CTA por campanha ativa',
              ].map((hint) => (
                <button
                  type="button"
                  key={hint}
                  onClick={() => setPrompt((prev) => `${prev.trim()} ${hint}.`.trim())}
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: `1px solid ${BORDER}`,
                    background: BG_CARD,
                    color: TEXT,
                    cursor: 'pointer',
                  }}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}
        {productList.length > 0 && (
          <div style={{ width: '100%', maxWidth: 500 }}>
            <SectionLabel>{kloelT(`Seus Produtos (clique para incluir)`)}</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {productList.map((p) => (
                <button
                  type="button"
                  key={p.name}
                  onClick={() => setPrompt((prev) => prev + (prev ? ', ' : '') + p.name)}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 4,
                    border: `1px solid ${BORDER}`,
                    background: BG_CARD,
                    color: TEXT,
                    cursor: 'pointer',
                  }}
                >
                  {p.name} -- {FmtMoney(p.price)}
                </button>
              ))}
            </div>
          </div>
        )}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={kloelT(
            `Ex: Landing page para venda de curso de marketing digital, com secao de depoimentos e botao de compra...`,
          )}
          style={{
            fontFamily: SORA,
            fontSize: 14,
            width: '100%',
            maxWidth: 500,
            minHeight: 100,
            padding: 14,
            borderRadius: 6,
            border: `1px solid ${BORDER}`,
            background: BG_CARD,
            color: TEXT,
            resize: 'vertical',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = EMBER;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = BORDER;
          }}
        />
        <Btn variant="primary" onClick={handleGenerate} disabled={!prompt.trim()}>
          {IC.zap(16)} {kloelT(`Gerar Site com IA`)}
        </Btn>
        {error && (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: '#ef4444',
              maxWidth: 500,
              textAlign: 'center',
              padding: '8px 16px',
              background: 'rgba(239,68,68,0.1)',
              borderRadius: 6,
            }}
          >
            {error}
          </div>
        )}
        {(loadingSites || savedSites.length > 0) && (
          <div style={{ width: '100%', maxWidth: 500, marginTop: 16 }}>
            <SectionLabel>{kloelT(`Sites Salvos`)}</SectionLabel>
            {loadingSites && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT_DIM }}>
                {kloelT(`Carregando...`)}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {savedSites.map((site) => (
                <Card
                  key={site.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    padding: '10px 14px',
                  }}
                >
                  <button
                    type="button"
                    aria-label="Abrir site salvo"
                    style={{
                      color: EMBER,
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() => loadSavedSite(site)}
                  >
                    {IC.site(16)}
                  </button>
                  <button
                    type="button"
                    style={{
                      fontFamily: SORA,
                      fontSize: 13,
                      color: TEXT,
                      flex: 1,
                      cursor: 'pointer',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      textAlign: 'left',
                    }}
                    onClick={() => loadSavedSite(site)}
                  >
                    {site.name || 'Site sem titulo'}
                  </button>
                  {site.published && <Badge color="#10B981">{kloelT(`Publicado`)}</Badge>}
                  <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>
                    {site.updatedAt ? new Date(site.updatedAt).toLocaleDateString('pt-BR') : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(site.id)}
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: `1px solid ${BORDER}`,
                      background: 'transparent',
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                  >
                    X
                  </button>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // BUILDING PHASE
  if (phase === 'building') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 400,
          gap: 20,
        }}
      >
        <div style={{ color: EMBER }}>{IC.globe(60)}</div>
        <div style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>
          {kloelT(`Gerando seu site com IA...`)}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: EMBER }}>
          {kloelT(`Isso pode levar alguns segundos`)}
        </div>
        <div
          style={{
            width: 300,
            height: 4,
            background: BORDER,
            borderRadius: 99,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              background: EMBER,
              borderRadius: 99,
              width: '100%',
              animation: 'sitesBuildPulse 1.5s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    );
  }

  // EDITOR PHASE
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn
            variant="ghost"
            small
            onClick={() => {
              setPhase('ask');
              setError('');
              setPublishedUrl('');
            }}
          >
            {kloelT(`Voltar`)}
          </Btn>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>
            {kloelT(`Editor do Site`)}
          </span>
          {savedSiteId && (
            <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED }}>
              {kloelT(`ID:`)} {savedSiteId.slice(0, 8)}...
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Btn>
          <Btn variant="primary" onClick={handlePublish} disabled={publishing || saving}>
            {publishing ? 'Publicando...' : 'Publicar'}
          </Btn>
        </div>
      </div>
      {publishedUrl && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            marginBottom: 12,
            background: 'rgba(16,185,129,0.08)',
            borderRadius: 6,
            border: '1px solid rgba(16,185,129,0.2)',
          }}
        >
          <span style={{ color: '#10B981' }}>{IC.check(16)}</span>
          <span style={{ fontFamily: SORA, fontSize: 13, color: '#10B981' }}>
            {kloelT(`Publicado em:`)}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT }}>{publishedUrl}</span>
        </div>
      )}
      {(publishedUrl || productId) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {productId && (
            <>
              <Btn
                variant="ghost"
                onClick={() =>
                  router.push(`/products/${productId}?tab=checkouts&focus=checkout-appearance`)
                }
              >
                {IC.site(14)} {kloelT(`Voltar para Checkout`)}
              </Btn>
              <Btn variant="ghost" onClick={() => router.push(`/products/${productId}?tab=urls`)}>
                {IC.link(14)} {kloelT(`Conectar URL`)}
              </Btn>
            </>
          )}
          <Btn variant="ghost" onClick={() => router.push('/sites/dominios')}>
            {IC.globe(14)} {kloelT(`Domínios`)}
          </Btn>
          <Btn variant="ghost" onClick={() => router.push('/sites/apps')}>
            {IC.puzzle(14)} {kloelT(`Apps`)}
          </Btn>
        </div>
      )}
      {error && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: '#ef4444',
            padding: '8px 16px',
            marginBottom: 12,
            background: 'rgba(239,68,68,0.1)',
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>{kloelT(`Nome:`)}</span>
        <Input
          value={siteName}
          onChange={setSiteName}
          placeholder={kloelT(`Nome do site`)}
          style={{ maxWidth: 300 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          value={editPrompt}
          onChange={setEditPrompt}
          placeholder={kloelT(
            `Pedir alteracao para a IA... Ex: Mude as cores para azul, adicione mais depoimentos`,
          )}
        />
        <Btn
          variant="primary"
          onClick={handleEditWithAI}
          disabled={editLoading || !editPrompt.trim()}
        >
          {editLoading ? (
            'Editando...'
          ) : (
            <>
              {IC.zap(14)} {kloelT(`Editar com IA`)}
            </>
          )}
        </Btn>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden', minHeight: 500 }}>
        <div
          style={{
            background: BG_ELEVATED,
            padding: '6px 12px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, marginLeft: 8 }}>
            {kloelT(`Preview`)}
          </span>
        </div>
        <iframe
          ref={iframeRef}
          srcDoc={generatedHtml}
          sandbox="allow-scripts"
          style={{ width: '100%', height: 500, border: 'none', background: '#fff' }}
          title={kloelT(`Site Preview`)}
        />
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Editar Site
// ══════════════════════════════════════════

function EditarSite({ mode }: { mode?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [savedSites, setSavedSites] = useState<SiteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<SiteItem | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [variantPrompt, setVariantPrompt] = useState('');
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantNotice, setVariantNotice] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const abMode = mode === 'ab';
  const productId = searchParams?.get('productId') || '';

  useEffect(() => {
    apiFetch('/kloel/site/list')
      .then((res) => {
        const data = res.data as { sites?: SiteItem[] } | undefined;
        if (data?.sites) {
          setSavedSites(data.sites);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleEditWithAI = async () => {
    if (!editPrompt.trim() || !selectedSite) {
      return;
    }
    setEditLoading(true);
    setError('');
    const res = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: { prompt: editPrompt.trim(), currentHtml: selectedSite.htmlContent },
    });
    setEditLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const editData = res.data as { html?: string } | undefined;
    if (editData?.html) {
      setSelectedSite({ ...selectedSite, htmlContent: editData.html });
      setEditPrompt('');
    }
  };

  const handleSave = async () => {
    if (!selectedSite) {
      return;
    }
    setSaving(true);
    setError('');
    const res = await apiFetch(`/kloel/site/${selectedSite.id}`, {
      method: 'PUT',
      body: { name: selectedSite.name, htmlContent: selectedSite.htmlContent },
    });
    if (res.error) {
      setError(res.error);
    }
    setSaving(false);
  };

  const handleDelete = async (siteId: string) => {
    const res = await apiFetch(`/kloel/site/${siteId}`, { method: 'DELETE' });
    if (!res.error) {
      setSavedSites((prev) => prev.filter((s) => s.id !== siteId));
      if (selectedSite?.id === siteId) {
        setSelectedSite(null);
      }
    }
  };

  const handleCreateVariant = async () => {
    if (!selectedSite || !variantPrompt.trim()) {
      return;
    }
    setVariantLoading(true);
    setVariantNotice('');
    setError('');
    const genRes = await apiFetch('/kloel/site/generate', {
      method: 'POST',
      body: {
        prompt: `Crie uma variação alternativa A/B deste site mantendo a mesma oferta, mas mudando estrutura, ênfase visual e sequência de persuasão. Objetivo: ${variantPrompt.trim()}`,
        currentHtml: selectedSite.htmlContent,
      },
    });
    const generatedVariantData = genRes.data as { html?: string } | undefined;
    if (genRes.error || !generatedVariantData?.html) {
      setVariantLoading(false);
      setError(genRes.error || 'Falha ao gerar variante.');
      return;
    }

    const variantName = `${selectedSite.name || 'Site'} — Variante B`;
    const saveRes = await apiFetch('/kloel/site/save', {
      method: 'POST',
      body: { name: variantName, htmlContent: generatedVariantData.html },
    });
    setVariantLoading(false);
    const savedVariantData = saveRes.data as { site?: SiteItem } | undefined;
    if (saveRes.error || !savedVariantData?.site) {
      setError(saveRes.error || 'Falha ao salvar variante.');
      return;
    }
    const newSite = savedVariantData.site;
    setSavedSites((prev) => [newSite, ...prev]);
    setSelectedSite(newSite);
    setVariantPrompt('');
    setVariantNotice(`Variante criada: ${variantName}`);
  };

  if (!selectedSite) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: EMBER }}>{IC.edit(24)}</span>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>
            {kloelT(`Editar Site`)}
          </span>
        </div>
        {loading ? (
          <Card style={{ padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: EMBER }}>{IC.refresh(16)}</span>
            <div>
              <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>
                {kloelT(`Carregando seus sites`)}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                {kloelT(`Mantendo a interface estável enquanto os dados chegam.`)}
              </div>
            </div>
          </Card>
        ) : savedSites.length === 0 ? (
          <EmptyState
            icon={IC.site}
            title={kloelT(`Nenhum site encontrado`)}
            subtitle={kloelT(`Crie seu primeiro site na aba 'Criar Site'`)}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedSites.map((site) => (
              <Card
                key={site.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  padding: '12px 16px',
                }}
              >
                <button
                  type="button"
                  style={{
                    color: EMBER,
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedSite(site)}
                  aria-label={`Abrir ${site.name || 'site'}`}
                >
                  {IC.site(20)}
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    cursor: 'pointer',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                  }}
                  onClick={() => setSelectedSite(site)}
                  aria-label={`Abrir ${site.name || 'site'}`}
                >
                  <div style={{ fontFamily: SORA, fontSize: 14, color: TEXT }}>
                    {site.name || 'Site sem titulo'}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: TEXT_DIM }}>
                    {site.updatedAt
                      ? new Date(site.updatedAt).toLocaleDateString('pt-BR')
                      : 'Sem data'}
                  </div>
                </button>
                {site.published && <Badge color="#10B981">{kloelT(`Publicado`)}</Badge>}
                <Btn variant="ghost" small onClick={() => setSelectedSite(site)}>
                  {IC.edit(14)} {kloelT(`Editar`)}
                </Btn>
                <Btn variant="danger" small onClick={() => handleDelete(site.id)}>
                  {IC.trash(14)}
                </Btn>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn variant="ghost" small onClick={() => setSelectedSite(null)}>
            {kloelT(`Voltar`)}
          </Btn>
          <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>
            {selectedSite.name || 'Site sem titulo'}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED }}>
            {kloelT(`ID:`)} {selectedSite.id?.slice(0, 8)}...
          </span>
        </div>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Alteracoes'}
        </Btn>
      </div>
      {abMode && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 12,
            background: `${EMBER}10`,
            borderRadius: 6,
            border: `1px solid ${EMBER}40`,
          }}
        >
          <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT, marginBottom: 8 }}>
            {kloelT(`Modo páginas alternativas`)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={variantPrompt}
              onChange={setVariantPrompt}
              placeholder={kloelT(`Ex: crie uma variante mais agressiva focada em prova social`)}
            />
            <Btn
              variant="primary"
              onClick={handleCreateVariant}
              disabled={variantLoading || !variantPrompt.trim()}
            >
              {variantLoading ? 'Gerando...' : 'Gerar Variante B'}
            </Btn>
          </div>
          {variantNotice && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: '#10B981', marginTop: 8 }}>
              {variantNotice}
            </div>
          )}
        </div>
      )}
      {productId && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <Btn
            variant="ghost"
            onClick={() =>
              router.push(`/products/${productId}?tab=checkouts&focus=checkout-appearance`)
            }
          >
            {IC.site(14)} {kloelT(`Voltar para Checkout`)}
          </Btn>
          <Btn
            variant="ghost"
            onClick={() =>
              router.push(`/products/${productId}?tab=campanhas&focus=recommendations`)
            }
          >
            {IC.chart(14)} {kloelT(`Revisar recomendações`)}
          </Btn>
        </div>
      )}
      {error && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: '#ef4444',
            padding: '8px 16px',
            marginBottom: 12,
            background: 'rgba(239,68,68,0.1)',
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Input
          value={editPrompt}
          onChange={setEditPrompt}
          placeholder={kloelT(`Descreva a alteracao que deseja...`)}
        />
        <Btn
          variant="primary"
          onClick={handleEditWithAI}
          disabled={editLoading || !editPrompt.trim()}
        >
          {editLoading ? (
            'Editando...'
          ) : (
            <>
              {IC.zap(14)} {kloelT(`Editar com IA`)}
            </>
          )}
        </Btn>
      </div>
      <Card style={{ padding: 0, overflow: 'hidden', minHeight: 500 }}>
        <div
          style={{
            background: BG_ELEVATED,
            padding: '6px 12px',
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, marginLeft: 8 }}>
            {kloelT(`Preview`)}
          </span>
        </div>
        <iframe
          ref={iframeRef}
          srcDoc={selectedSite.htmlContent || ''}
          sandbox="allow-scripts"
          style={{ width: '100%', height: 500, border: 'none', background: '#fff' }}
          title={kloelT(`Site Preview`)}
        />
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Apps
// ══════════════════════════════════════════

function Apps() {
  // Apps loaded from backend when site app store is connected
  const [installedApps] = useState<
    Array<{ name: string; icon: (s: number) => React.ReactElement; status: string; desc: string }>
  >([]);

  // Available apps catalog — will be loaded from marketplace when connected
  const [availableApps] = useState<
    Array<{ name: string; icon: (s: number) => React.ReactElement; desc: string }>
  >([]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.puzzle(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>
          {kloelT(`Apps & Integracoes`)}
        </span>
        <Badge>{installedApps.length} instalados</Badge>
      </div>

      {/* Installed */}
      <div>
        <SectionLabel>{kloelT(`Apps Instalados`)}</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {installedApps.map((app) => (
            <Card key={app.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: EMBER }}>{app.icon(20)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>{app.name}</div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{app.desc}</div>
              </div>
              <Badge color="#10B981">{app.status}</Badge>
            </Card>
          ))}
        </div>
      </div>

      {/* Available */}
      <div>
        <SectionLabel>{kloelT(`Apps Disponiveis`)}</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {availableApps.map((app) => (
            <Card key={app.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: TEXT_DIM }}>{app.icon(20)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>{app.name}</div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>{app.desc}</div>
              </div>
              <Btn variant="ghost" small>
                {IC.plus(12)} {kloelT(`Instalar`)}
              </Btn>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// TAB: Protecao
// ══════════════════════════════════════════

function Protecao() {
  const [sslEnabled, setSslEnabled] = useState(true);
  const [ddosProtection, setDdosProtection] = useState(true);
  const [firewallEnabled, setFirewallEnabled] = useState(true);
  const [autoBackups, setAutoBackups] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: EMBER }}>{IC.shield(24)}</span>
        <span style={{ fontFamily: SORA, fontSize: 18, color: TEXT }}>
          {kloelT(`Protecao & Seguranca`)}
        </span>
        <Badge color="#10B981">{kloelT(`Seguro`)}</Badge>
      </div>

      {/* Security Score */}
      <Card style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: SORA,
            fontSize: 10,
            color: TEXT_MUTED,
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            marginBottom: 8,
          }}
        >
          {kloelT(`Pontuacao de Seguranca`)}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 48, color: '#10B981', fontWeight: 700 }}>96</div>
        <div style={{ fontFamily: SORA, fontSize: 12, color: TEXT_DIM }}>
          {kloelT(`de 100 pontos`)}
        </div>
        <div style={{ marginTop: 12, maxWidth: 300, margin: '12px auto 0' }}>
          <ProgressBar value={96} color="#10B981" />
        </div>
      </Card>

      {/* Security Settings */}
      <Card>
        <SectionLabel>{kloelT(`Configuracoes de Seguranca`)}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#10B981' }}>{IC.lock(18)}</span>
              <div>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>
                  {kloelT(`SSL/TLS (HTTPS)`)}
                </div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>
                  {kloelT(`Criptografia de dados em transito`)}
                </div>
              </div>
            </div>
            <Toggle checked={sslEnabled} onChange={setSslEnabled} />
          </div>
          <div style={{ height: 1, background: BORDER }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#3B82F6' }}>{IC.shield(18)}</span>
              <div>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>
                  {kloelT(`Protecao DDoS`)}
                </div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>
                  {kloelT(`Mitigacao de ataques distribuidos`)}
                </div>
              </div>
            </div>
            <Toggle checked={ddosProtection} onChange={setDdosProtection} />
          </div>
          <div style={{ height: 1, background: BORDER }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#F59E0B' }}>{IC.key(18)}</span>
              <div>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>
                  {kloelT(`Firewall (WAF)`)}
                </div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>
                  {kloelT(`Bloqueio de requisicoes maliciosas`)}
                </div>
              </div>
            </div>
            <Toggle checked={firewallEnabled} onChange={setFirewallEnabled} />
          </div>
          <div style={{ height: 1, background: BORDER }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: EMBER }}>{IC.cloud(18)}</span>
              <div>
                <div style={{ fontFamily: SORA, fontSize: 13, color: TEXT }}>
                  {kloelT(`Backups Automaticos`)}
                </div>
                <div style={{ fontFamily: SORA, fontSize: 11, color: TEXT_DIM }}>
                  {kloelT(`Backup diario com 7 dias de retencao`)}
                </div>
              </div>
            </div>
            <Toggle checked={autoBackups} onChange={setAutoBackups} />
          </div>
        </div>
      </Card>

      {/* SSL Certificates */}
      <Card>
        <SectionLabel>{kloelT(`Certificados SSL`)}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            {
              domain: 'meusite.com.br',
              issuer: "Let's Encrypt",
              expires: '2026-09-15',
              status: 'valido',
            },
            {
              domain: 'vendas.meusite.com.br',
              issuer: "Let's Encrypt",
              expires: '2026-09-15',
              status: 'valido',
            },
            { domain: 'blog.meusite.com.br', issuer: '--', expires: '--', status: 'pendente' },
          ].map((cert) => (
            <div
              key={cert.domain}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: BG_ELEVATED,
                borderRadius: 6,
              }}
            >
              <span style={{ color: cert.status === 'valido' ? '#10B981' : '#F59E0B' }}>
                {IC.lock(14)}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT }}>{cert.domain}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>{cert.issuer}</div>
              </div>
              <Badge color={cert.status === 'valido' ? '#10B981' : '#F59E0B'}>{cert.status}</Badge>
              <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_DIM }}>
                {cert.expires}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Threats */}
      <Card>
        <SectionLabel>{kloelT(`Atividade Recente`)}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { time: '2 min', event: 'Requisicao bloqueada (SQL injection)', severity: 'alta' },
            { time: '15 min', event: 'Rate limit atingido - IP 192.168.1.45', severity: 'media' },
            { time: '1h', event: 'Certificado SSL renovado automaticamente', severity: 'info' },
            { time: '3h', event: 'Backup automatico concluido', severity: 'info' },
            { time: '6h', event: 'Bot crawler bloqueado', severity: 'baixa' },
          ].map((item) => (
            <div
              key={item.event}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                background: BG_ELEVATED,
                borderRadius: 6,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_MUTED, width: 50 }}>
                {item.time}
              </span>
              <span style={{ fontFamily: SORA, fontSize: 12, color: TEXT, flex: 1 }}>
                {item.event}
              </span>
              <Badge
                color={
                  item.severity === 'alta'
                    ? '#ef4444'
                    : item.severity === 'media'
                      ? '#F59E0B'
                      : item.severity === 'baixa'
                        ? '#3B82F6'
                        : TEXT_DIM
                }
              >
                {item.severity}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════

export default function SitesView({ defaultTab = 'visao-geral' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(defaultTab);
  const prevDefault = useRef(defaultTab);
  useEffect(() => {
    if (prevDefault.current !== defaultTab) {
      setTab(defaultTab);
      prevDefault.current = defaultTab;
    }
  }, [defaultTab]);
  const mode = searchParams?.get('mode') || undefined;

  const TABS = [
    { id: 'visao-geral', label: 'Visao Geral', icon: IC.globe },
    { id: 'dominios', label: 'Dominios', icon: IC.link },
    { id: 'hospedagem', label: 'Hospedagem', icon: IC.server },
    { id: 'criar', label: 'Criar Site', icon: IC.site },
    { id: 'editar', label: 'Editar Site', icon: IC.edit },
    { id: 'apps', label: 'Apps', icon: IC.puzzle },
    { id: 'protecao', label: 'Protecao', icon: IC.shield },
  ];

  const switchTab = useCallback(
    (id: string) => {
      setTab(id);
      const nextRoute = id === 'visao-geral' ? '/sites' : `/sites/${id}`;
      if (pathname === nextRoute) {
        return;
      }
      startTransition(() => {
        router.push(nextRoute);
      });
    },
    [pathname, router],
  );

  return (
    <div
      style={{
        fontFamily: SORA,
        color: TEXT,
        minHeight: '100vh',
        padding: isMobile ? 16 : 24,
      }}
    >
      {/* CSS Keyframes */}
      <style>{`
        @keyframes sitesFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sitesBuildPulse { 0% { opacity: 0.3; transform: scaleX(0.3); } 50% { opacity: 1; transform: scaleX(1); } 100% { opacity: 0.3; transform: scaleX(0.3); } }
      `}</style>

      {/* Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 24,
          overflowX: 'auto',
          paddingBottom: 8,
          maxWidth: 1240,
          marginInline: 'auto',
        }}
      >
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => switchTab(t.id)}
            style={{
              fontFamily: SORA,
              fontSize: isMobile ? 11 : 12,
              padding: isMobile ? '8px 12px' : '8px 14px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: tab === t.id ? `${EMBER}20` : 'transparent',
              color: tab === t.id ? EMBER : TEXT_DIM,
              transition: 'all .2s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {/* Tab Content */}
        {tab === 'visao-geral' && <VisaoGeral switchTab={switchTab} />}
        {tab === 'dominios' && <Dominios />}
        {tab === 'hospedagem' && <Hospedagem />}
        {tab === 'criar' && <CriarSite mode={mode} />}
        {tab === 'editar' && <EditarSite mode={mode} />}
        {tab === 'apps' && <Apps />}
        {tab === 'protecao' && <Protecao />}
      </div>
    </div>
  );
}

