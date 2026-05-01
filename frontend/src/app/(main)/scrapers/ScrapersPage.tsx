

export default function ScrapersPage() {
  const router = useRouter();
  const { jobs, isLoading, error, mutate } = useScrapers();
  const [showModal, setShowModal] = useState(false);
  const [importingIds, setImportingIds] = useState<Record<string, boolean>>({});
  const [importResult, setImportResult] = useState<{ jobId: string; imported: number } | null>(
    null,
  );
  const [typeFilter, setTypeFilter] = useState<'ALL' | ScrapingJob['type']>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | string>('ALL');

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (typeFilter !== 'ALL' && job.type !== typeFilter) {
        return false;
      }
      if (statusFilter !== 'ALL' && job.status?.toUpperCase() !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [jobs, statusFilter, typeFilter]);

  const handleImport = async (jobId: string) => {
    setImportingIds((prev) => ({ ...prev, [jobId]: true }));
    setImportResult(null);
    try {
      const result = await importScraperResults(jobId);
      setImportResult({ jobId, imported: result.imported });
    } catch {
      // silent — error visible via toasts if wired later
    } finally {
      setImportingIds((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  return (
    <SectionPage
      title={kloelT(`Scrapers`)}
      icon={kloelT(`&#128269;`)}
      description={kloelT(`Jobs de scraping para coleta de leads`)}
      back={() => router.push('/ferramentas')}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) auto auto auto auto',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'ALL' | ScrapingJob['type'])}
          style={{
            padding: '10px 14px',
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 12,
            outline: 'none',
          }}
        >
          <option value="ALL">{kloelT(`Todos os tipos`)}</option>
          <option value="MAPS">{kloelT(`Google Maps`)}</option>
          <option value="INSTAGRAM">{kloelT(`Instagram`)}</option>
          <option value="GROUP">{kloelT(`Grupo WhatsApp`)}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '10px 14px',
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 12,
            outline: 'none',
          }}
        >
          <option value="ALL">{kloelT(`Todos os status`)}</option>
          <option value="PENDING">{kloelT(`Pendentes`)}</option>
          <option value="RUNNING">{kloelT(`Executando`)}</option>
          <option value="COMPLETED">{kloelT(`Concluídos`)}</option>
          <option value="FAILED">{kloelT(`Falhos`)}</option>
        </select>
        <button
          type="button"
          onClick={() => router.push('/leads')}
          style={{
            padding: '10px 14px',
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-secondary)',
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {kloelT(`Abrir Leads`)}
        </button>
        <button
          type="button"
          onClick={() => router.push('/flow')}
          style={{
            padding: '10px 14px',
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-secondary)',
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {kloelT(`Abrir Flow`)}
        </button>
      </div>
      <div
        style={{
          marginBottom: 16,
          padding: '14px 16px',
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
        }}
      >
        <div
          style={{
            fontFamily: SORA,
            fontSize: 11,
            color: 'var(--app-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            marginBottom: 6,
          }}
        >
          {kloelT(`Trilha de aquisição`)}
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            fontFamily: SORA,
            fontSize: 13,
            color: 'var(--app-text-primary)',
          }}
        >
          <span>{kloelT(`Scrapers`)}</span>
          <span style={{ color: 'var(--app-text-tertiary)' }}>→</span>
          <span>{kloelT(`Leads`)}</span>
          <span style={{ color: 'var(--app-text-tertiary)' }}>→</span>
          <span>{kloelT(`Follow-ups`)}</span>
          <span style={{ color: 'var(--app-text-tertiary)' }}>→</span>
          <span>{kloelT(`Inbox`)}</span>
          <span style={{ color: 'var(--app-text-tertiary)' }}>→</span>
          <span>{kloelT(`Flow`)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            background: colors.ember.primary,
            border: 'none',
            borderRadius: 6,
            color:
              '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {kloelT(`+ Novo Job`)}
        </button>
      </div>
      {importResult && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 6,
            color:
              '#10B981' /* PULSE_VISUAL_OK: success emerald, non-Monitor status indicator */ /* PULSE_VISUAL_OK: success emerald, non-Monitor status indicator */,
            fontFamily: SORA,
            fontSize: 13,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span>
              {importResult.imported} {kloelT(`leads importados com sucesso.`)}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => router.push('/leads?source=scrapers')}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(16,185,129,0.12)',
                  border: '1px solid rgba(16,185,129,0.24)',
                  borderRadius: 6,
                  color:
                    '#10B981' /* PULSE_VISUAL_OK: success emerald, non-Monitor status indicator */ /* PULSE_VISUAL_OK: success emerald, non-Monitor status indicator */,
                  fontFamily: SORA,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {kloelT(`Ver leads`)}
              </button>
              <button
                type="button"
                onClick={() => router.push('/followups?source=scrapers')}
                style={{
                  padding: '6px 12px',
                  background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  color: 'var(--app-text-primary)',
                  fontFamily: SORA,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {kloelT(`Abrir follow-ups`)}
              </button>
              <button
                type="button"
                onClick={() => router.push('/flow?source=scrapers&purpose=acquisition&tab=editor')}
                style={{
                  padding: '6px 12px',
                  background: 'var(--app-bg-card)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  color: 'var(--app-text-primary)',
                  fontFamily: SORA,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {kloelT(`Automatizar no Flow`)}
              </button>
            </div>
          </div>
        </div>
      )}
      {isLoading ? (
        <Card>
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--app-text-secondary)',
              fontFamily: SORA,
            }}
          >
            {kloelT(`Carregando jobs...`)}
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color:
                '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */ /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
              fontFamily: SORA,
            }}
          >
            {kloelT(`Erro ao carregar scrapers`)}
          </div>
        </Card>
      ) : jobs.length === 0 ? (
        <div>
          <ContextualEmptyState
            context="generic"
            title={kloelT(`Nenhum job de scraping`)}
            description={kloelT(
              `Crie um job para coletar leads do Google Maps, Instagram ou grupos WhatsApp.`,
            )}
          />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              onClick={() => router.push('/leads')}
              style={{
                padding: '8px 14px',
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: 'var(--app-text-primary)',
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {kloelT(`Revisar Leads`)}
            </button>
            <button
              type="button"
              onClick={() => router.push('/flow?source=scrapers&purpose=acquisition&tab=templates')}
              style={{
                padding: '8px 14px',
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: 'var(--app-text-primary)',
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {kloelT(`Ver templates de Flow`)}
            </button>
          </div>
        </div>
      ) : filteredJobs.length === 0 ? (
        <Card>
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--app-text-secondary)',
              fontFamily: SORA,
            }}
          >
            {kloelT(`Nenhum job combina com os filtros atuais.`)}
          </div>
        </Card>
      ) : (
        <Card>
          {filteredJobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              onImport={handleImport}
              importing={!!importingIds[job.id]}
            />
          ))}
        </Card>
      )}

      {showModal && <NewJobModal onClose={() => setShowModal(false)} onCreated={() => mutate()} />}
    </SectionPage>
  );
}

