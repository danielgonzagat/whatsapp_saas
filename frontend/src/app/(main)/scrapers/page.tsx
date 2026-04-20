'use client';

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
  RUNNING: '#3B82F6',
  COMPLETED: '#10B981',
  FAILED: '#EF4444',
  PENDING: '#F59E0B',
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
        borderBottom: '1px solid #222226',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: STATUS_COLORS[status] || '#6E6E73',
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
          {TYPE_LABELS[job.type] || job.type} &middot; {status.toLowerCase()}
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
            background: importing ? '#19191C' : '#E85D30',
            border: 'none',
            borderRadius: 6,
            color: importing ? '#6E6E73' : '#fff',
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
          Novo Job de Scraping
        </h2>
        <p
          style={{
            fontFamily: SORA,
            fontSize: 13,
            color: 'var(--app-text-secondary)',
            margin: '0 0 24px',
          }}
        >
          Configure a coleta de leads automatica.
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
          Tipo de scraping
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
          <option value="MAPS">Google Maps</option>
          <option value="INSTAGRAM">Instagram</option>
          <option value="GROUP">Grupo WhatsApp</option>
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
          Busca / query *
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
              Localidade (opcional)
            </label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Ex: Sao Paulo, SP"
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
              color: '#EF4444',
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
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !form.query.trim()}
            style={{
              padding: '9px 22px',
              background: '#E85D30',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
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
      title="Scrapers"
      icon="&#128269;"
      description="Jobs de scraping para coleta de leads"
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
          <option value="ALL">Todos os tipos</option>
          <option value="MAPS">Google Maps</option>
          <option value="INSTAGRAM">Instagram</option>
          <option value="GROUP">Grupo WhatsApp</option>
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
          <option value="ALL">Todos os status</option>
          <option value="PENDING">Pendentes</option>
          <option value="RUNNING">Executando</option>
          <option value="COMPLETED">Concluídos</option>
          <option value="FAILED">Falhos</option>
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
          Abrir Leads
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
          Abrir Flow
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
          Trilha de aquisição
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
          <span>Scrapers</span>
          <span style={{ color: 'var(--app-text-tertiary)' }}>→</span>
          <span>Leads</span>
          <span style={{ color: 'var(--app-text-tertiary)' }}>→</span>
          <span>Follow-ups</span>
          <span style={{ color: 'var(--app-text-tertiary)' }}>→</span>
          <span>Inbox</span>
          <span style={{ color: 'var(--app-text-tertiary)' }}>→</span>
          <span>Flow</span>
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
            background: '#E85D30',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontFamily: SORA,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Novo Job
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
            color: '#10B981',
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
            <span>{importResult.imported} leads importados com sucesso.</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => router.push('/leads?source=scrapers')}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(16,185,129,0.12)',
                  border: '1px solid rgba(16,185,129,0.24)',
                  borderRadius: 6,
                  color: '#10B981',
                  fontFamily: SORA,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Ver leads
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
                Abrir follow-ups
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
                Automatizar no Flow
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
            Carregando jobs...
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div style={{ padding: 32, textAlign: 'center', color: '#EF4444', fontFamily: SORA }}>
            Erro ao carregar scrapers
          </div>
        </Card>
      ) : jobs.length === 0 ? (
        <div>
          <ContextualEmptyState
            context="generic"
            title="Nenhum job de scraping"
            description="Crie um job para coletar leads do Google Maps, Instagram ou grupos WhatsApp."
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
              Revisar Leads
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
              Ver templates de Flow
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
            Nenhum job combina com os filtros atuais.
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
