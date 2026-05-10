'use client';

import { kloelT } from '@/lib/i18n/t';
import { colors } from '@/lib/design-tokens';
export const dynamic = 'force-dynamic';

import { Card } from '@/components/kloel/Card';
import { ContextualEmptyState } from '@/components/kloel/EmptyStates';
import { SectionPage } from '@/components/kloel/SectionPage';
import {
  type ScrapingJob,
  importScraperResults,
  useScrapers,
} from '@/hooks/useScrapers';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ScraperJobRow } from './ScraperJobRow';
import { ScraperNewJobModal } from './ScraperNewJobModal';
import { ScraperFilterBar } from './ScraperFilterBar';
import { ScraperImportResultBanner } from './ScraperImportResultBanner';

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
      // silent
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
      <ScraperFilterBar
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        onTypeFilterChange={(v) => setTypeFilter(v)}
        onStatusFilterChange={(v) => setStatusFilter(v)}
      />
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
            fontFamily: "'Sora', sans-serif",
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
            fontFamily: "'Sora', sans-serif",
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
            color: colors.text.silver,
            fontFamily: "'Sora', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {kloelT(`+ Novo Job`)}
        </button>
      </div>
      <ScraperImportResultBanner importResult={importResult} />
      {isLoading ? (
        <Card>
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--app-text-secondary)',
              fontFamily: "'Sora', sans-serif",
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
              color: colors.semantic.error,
              fontFamily: "'Sora', sans-serif",
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
                fontFamily: "'Sora', sans-serif",
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
                fontFamily: "'Sora', sans-serif",
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
              fontFamily: "'Sora', sans-serif",
            }}
          >
            {kloelT(`Nenhum job combina com os filtros atuais.`)}
          </div>
        </Card>
      ) : (
        <Card>
          {filteredJobs.map((job) => (
            <ScraperJobRow
              key={job.id}
              job={job}
              onImport={handleImport}
              importing={!!importingIds[job.id]}
            />
          ))}
        </Card>
      )}

      {showModal && <ScraperNewJobModal onClose={() => setShowModal(false)} onCreated={() => mutate()} />}
    </SectionPage>
  );
}
