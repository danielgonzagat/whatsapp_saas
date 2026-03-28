'use client';

import { useRouter } from 'next/navigation';
import { SectionPage } from '@/components/kloel/SectionPage';
import { Card } from '@/components/kloel/Card';
import { useScrapers, type ScrapingJob } from '@/hooks/useScrapers';
import { ContextualEmptyState } from '@/components/kloel/EmptyStates';

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

function JobRow({ job }: { job: ScrapingJob }) {
  const status = job.status?.toUpperCase() || 'PENDING';
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
        <div style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: "'Sora', sans-serif" }}>
          {job.query}
        </div>
        <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2, fontFamily: "'Sora', sans-serif" }}>
          {TYPE_LABELS[job.type] || job.type} &middot; {status.toLowerCase()}
          {job.resultsCount != null && ` \u00B7 ${job.resultsCount} resultados`}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: "'Sora', sans-serif", whiteSpace: 'nowrap' }}>
        {new Date(job.createdAt).toLocaleDateString('pt-BR')}
      </div>
    </div>
  );
}

export default function ScrapersPage() {
  const router = useRouter();
  const { jobs, isLoading, error } = useScrapers();

  return (
    <SectionPage
      title="Scrapers"
      icon="\u{1F50D}"
      description="Jobs de scraping para coleta de leads"
      back={() => router.push('/ferramentas')}
    >
      {isLoading ? (
        <Card>
          <div style={{ padding: 32, textAlign: 'center', color: '#6E6E73', fontFamily: "'Sora', sans-serif" }}>
            Carregando jobs...
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div style={{ padding: 32, textAlign: 'center', color: '#EF4444', fontFamily: "'Sora', sans-serif" }}>
            Erro ao carregar scrapers
          </div>
        </Card>
      ) : jobs.length === 0 ? (
        <ContextualEmptyState context="generic" title="Nenhum job de scraping" description="Crie um job para coletar leads do Google Maps, Instagram ou grupos WhatsApp." />
      ) : (
        <Card>
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </Card>
      )}
    </SectionPage>
  );
}
