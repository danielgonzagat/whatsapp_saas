'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { SectionPage } from '@/components/kloel/SectionPage';
import { Card } from '@/components/kloel/Card';
import { ContextualEmptyState } from '@/components/kloel/EmptyStates';

interface VideoJob {
  id: string;
  status: string;
  inputUrl?: string;
  prompt?: string;
  outputUrl?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PROCESSING: '#3B82F6',
  COMPLETED: '#10B981',
  FAILED: '#EF4444',
  PENDING: '#F59E0B',
};

function VideoJobRow({ job }: { job: VideoJob }) {
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
        <div style={{ fontSize: 14, fontWeight: 600, color: '#E0DDD8', fontFamily: "'Sora', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {job.prompt || 'Video job'}
        </div>
        <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2, fontFamily: "'Sora', sans-serif" }}>
          {status.toLowerCase()}
          {job.outputUrl && ' \u00B7 output pronto'}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#3A3A3F', fontFamily: "'Sora', sans-serif", whiteSpace: 'nowrap' }}>
        {new Date(job.createdAt).toLocaleDateString('pt-BR')}
      </div>
    </div>
  );
}

export default function VideoPage() {
  const router = useRouter();
  const { data, error, isLoading } = useSWR<any>('/video/jobs', swrFetcher);
  const jobs: VideoJob[] = Array.isArray(data) ? data : data?.jobs || [];

  return (
    <SectionPage
      title="Video AI"
      icon="\u{1F3AC}"
      description="Jobs de geração e processamento de vídeo"
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
            Erro ao carregar video jobs
          </div>
        </Card>
      ) : jobs.length === 0 ? (
        <ContextualEmptyState context="generic" title="Nenhum job de vídeo" description="Crie um job para gerar ou processar vídeos com IA." />
      ) : (
        <Card>
          {jobs.map((job) => (
            <VideoJobRow key={job.id} job={job} />
          ))}
        </Card>
      )}
    </SectionPage>
  );
}
