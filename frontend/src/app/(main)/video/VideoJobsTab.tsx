'use client';
import { kloelT } from '@/lib/i18n/t';
import { Card } from '@/components/kloel/Card';
import { ContextualEmptyState } from '@/components/kloel/EmptyStates';
import type { VideoJob } from './page.shared';
import { VideoJobRow } from './page.shared';

export function VideoJobsTab({
  jobs,
  isLoading,
  error,
  onRefresh,
}: {
  jobs: VideoJob[];
  isLoading: boolean;
  error: unknown;
  onRefresh: (id: string) => void;
}) {
  if (isLoading) {
    return (
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
    );
  }

  if (error) {
    return (
      <Card>
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'var(--app-error)',
            fontFamily: "'Sora', sans-serif",
          }}
        >
          {kloelT(`Erro ao carregar video jobs`)}
        </div>
      </Card>
    );
  }

  if (jobs.length === 0) {
    return (
      <ContextualEmptyState
        context="generic"
        title={kloelT(`Nenhum job de video`)}
        description={kloelT(`Crie um job para gerar ou processar videos com IA.`)}
      />
    );
  }

  return (
    <Card>
      {jobs.map((job) => (
        <VideoJobRow key={job.id} job={job} onRefresh={onRefresh} />
      ))}
    </Card>
  );
}
