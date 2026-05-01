'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { Card } from '@/components/kloel/Card';
import { ContextualEmptyState } from '@/components/kloel/EmptyStates';
import { SectionPage } from '@/components/kloel/SectionPage';
import {
  type ScrapingJob,
  createScraperJob,
  importScraperResults,
  useScrapers,
} from '@/hooks/useScrapers';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';

const STATUS_COLORS: Record<string, string> = {
  RUNNING:
    '#3B82F6' /* PULSE_VISUAL_OK: info blue, non-Monitor status indicator */ /* PULSE_VISUAL_OK: info blue, non-Monitor status indicator */,
  COMPLETED:
    '#10B981' /* PULSE_VISUAL_OK: success emerald, non-Monitor status indicator */ /* PULSE_VISUAL_OK: success emerald, non-Monitor status indicator */,
  FAILED:
    '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */ /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
  PENDING:
    '#F59E0B' /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */ /* PULSE_VISUAL_OK: warning amber, non-Monitor status indicator */,
};

const TYPE_LABELS: Record<string, string> = {
  MAPS: 'Google Maps',
  INSTAGRAM: 'Instagram',
  GROUP: 'Grupo WhatsApp',
};

const SORA = "'Sora', sans-serif";

function JobRow({
  job,
  onImport,
  importing,
}: {
  job: ScrapingJob;
  onImport: (id: string) => void;
  importing: boolean;
}) {
  const status = job.status?.toUpperCase() || 'PENDING';
  const canImport = status === 'COMPLETED';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 16px',
        borderBottom: '1px solid colors.border.space',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_COLORS[status] || colors.text.muted,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
          }}
        >
          {job.query}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--app-text-secondary)',
            marginTop: 2,
            fontFamily: SORA,
          }}
        >
          {TYPE_LABELS[job.type] || job.type} {kloelT(`&middot;`)} {status.toLowerCase()}
          {job.resultsCount != null && ` \u00B7 ${job.resultsCount} resultados`}
        </div>
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--app-text-tertiary)',
          fontFamily: SORA,
          whiteSpace: 'nowrap',
        }}
      >
        {new Date(job.createdAt).toLocaleDateString('pt-BR')}
      </div>
      {canImport && (
        <button
          type="button"
          onClick={() => onImport(job.id)}
          disabled={importing}
          style={{
            padding: '6px 14px',
            background: importing ? colors.background.elevated : colors.ember.primary,
            border: 'none',
            borderRadius: 6,
            color: importing
              ? colors.text.muted
              : '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
            fontSize: 12,
            fontFamily: SORA,
            fontWeight: 600,
            cursor: importing ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background 150ms ease',
          }}
        >
          {importing ? 'Importando...' : 'Importar'}
        </button>
      )}
    </div>
  );
}

interface NewJobForm {
  type: 'MAPS' | 'INSTAGRAM' | 'GROUP';
  query: string;
  location: string;
}

function NewJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const fid = useId();
  const [form, setForm] = useState<NewJobForm>({ type: 'MAPS', query: '', location: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.query.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createScraperJob({
        type: form.type,
        query: form.query.trim(),
        location: form.location.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar job');
    } finally {
      setLoading(false);
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
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar modal"
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
          maxWidth: 440,
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 28,
        }}
      >
        <h2
          style={{
            fontFamily: SORA,
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--app-text-primary)',
            margin: '0 0 4px',
          }}
        >
          {kloelT(`Novo Job de Scraping`)}
        </h2>
        <p
          style={{
            fontFamily: SORA,
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            margin: '0 0 24px',
          }}
        >
          {kloelT(`Configure a coleta de leads automatica.`)}
        </p>

        <label
          style={{
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--app-text-secondary)',
            display: 'block',
            marginBottom: 6,
          }}
          htmlFor={`${fid}-scraping-type`}
        >
          {kloelT(`Tipo de scraping`)}
        </label>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as NewJobForm['type'] })}
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'var(--app-bg-primary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box',
          }}
          id={`${fid}-scraping-type`}
        >
          <option value="MAPS">{kloelT(`Google Maps`)}</option>
          <option value="INSTAGRAM">{kloelT(`Instagram`)}</option>
          <option value="GROUP">{kloelT(`Grupo WhatsApp`)}</option>
        </select>

        <label
          style={{
            fontFamily: SORA,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--app-text-secondary)',
            display: 'block',
            marginBottom: 6,
          }}
          htmlFor={`${fid}-query`}
        >
          {kloelT(`Busca / query *`)}
        </label>
        <input
          type="text"
          value={form.query}
          onChange={(e) => setForm({ ...form, query: e.target.value })}
          placeholder={
            form.type === 'MAPS'
              ? 'Ex: academias de ginastica'
              : form.type === 'INSTAGRAM'
                ? 'Ex: @fitnessbr'
                : 'Ex: link do grupo'
          }
          style={{
            width: '100%',
            padding: '10px 14px',
            background: 'var(--app-bg-primary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            fontSize: 13,
            outline: 'none',
            marginBottom: 16,
            boxSizing: 'border-box',
          }}
          id={`${fid}-query`}
        />

        {form.type === 'MAPS' && (
          <>
            <label
              style={{
                fontFamily: SORA,
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 6,
              }}
              htmlFor={`${fid}-location`}
            >
              {kloelT(`Localidade (opcional)`)}
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder={kloelT(`Ex: Sao Paulo, SP`)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--app-bg-primary)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: 'var(--app-text-primary)',
                fontFamily: SORA,
                fontSize: 13,
                outline: 'none',
                marginBottom: 16,
                boxSizing: 'border-box',
              }}
              id={`${fid}-location`}
            />
          </>
        )}

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              color:
                '#EF4444' /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */ /* PULSE_VISUAL_OK: error/danger red, non-Monitor status indicator */,
              fontFamily: SORA,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              background: 'none',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              color: 'var(--app-text-secondary)',
              fontFamily: SORA,
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
            disabled={loading || !form.query.trim()}
            style={{
              padding: '9px 22px',
              background: colors.ember.primary,
              border: 'none',
              borderRadius: 6,
              color:
                '#fff' /* PULSE_VISUAL_OK: universal white shorthand */ /* PULSE_VISUAL_OK: universal white shorthand */,
              fontFamily: SORA,
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: !form.query.trim() ? 0.5 : 1,
            }}
          >
            {loading ? 'Criando...' : 'Criar Job'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Scrapers page. */
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
