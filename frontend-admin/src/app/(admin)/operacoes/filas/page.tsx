'use client';

import { RefreshCw, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import {
  adminOpsApi,
  type AdminOpsDlqJob,
  type AdminOpsQueueSummary,
} from '@/lib/api/admin-ops-api';

function queueCount(queue: AdminOpsQueueSummary, pipe: 'main' | 'dlq', key: string) {
  return Number(queue[pipe]?.[key] || 0);
}

function formatJobTime(value?: number) {
  if (!value) {
    return 'sem timestamp';
  }
  return new Date(value).toLocaleString('pt-BR');
}

/** Admin ops queues page. */
export default function AdminOpsQueuesPage() {
  const [selectedQueue, setSelectedQueue] = useState('');
  const [retrying, setRetrying] = useState(false);

  const queues = useSWR<AdminOpsQueueSummary[]>('admin/ops/queues', () => adminOpsApi.queues(), {
    refreshInterval: 30000,
  });
  const alerts = useSWR<unknown[]>('admin/ops/queues/alerts/webhooks', () =>
    adminOpsApi.webhookAlerts(20),
  );
  const suspended = useSWR('admin/ops/queues/billing/suspended', () =>
    adminOpsApi.billingSuspended(),
  );

  const activeQueue = selectedQueue || queues.data?.[0]?.name || '';
  const dlq = useSWR<AdminOpsDlqJob[]>(
    activeQueue ? ['admin/ops/queues/dlq', activeQueue] : null,
    () => adminOpsApi.dlq(activeQueue, 20),
  );

  const totals = useMemo(() => {
    const rows = queues.data ?? [];
    return rows.reduce(
      (acc, queue) => ({
        waiting: acc.waiting + queueCount(queue, 'main', 'waiting'),
        active: acc.active + queueCount(queue, 'main', 'active'),
        failed: acc.failed + queueCount(queue, 'main', 'failed'),
        dlq: acc.dlq + queueCount(queue, 'dlq', 'waiting') + queueCount(queue, 'dlq', 'failed'),
      }),
      { waiting: 0, active: 0, failed: 0, dlq: 0 },
    );
  }, [queues.data]);

  async function retrySelectedQueue() {
    if (!activeQueue) {
      return;
    }
    setRetrying(true);
    try {
      await adminOpsApi.retryDlq(activeQueue, 10);
      await Promise.all([queues.mutate(), dlq.mutate()]);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="OPERAÇÕES"
        title="Filas e DLQ"
        description="Supervisão operacional de filas, jobs retidos em DLQ, alertas de webhook e suspensões de billing."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => void Promise.all([queues.mutate(), alerts.mutate(), suspended.mutate()])}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Atualizar
          </Button>
        }
      />

      <AdminMetricGrid
        items={[
          {
            label: 'Waiting',
            value: totals.waiting,
            detail: 'Jobs aguardando nas filas principais',
          },
          { label: 'Active', value: totals.active, detail: 'Jobs em processamento agora' },
          {
            label: 'Failed',
            value: totals.failed,
            detail: 'Falhas nas filas principais',
            tone: totals.failed > 0 ? 'text-[var(--app-danger)]' : undefined,
          },
          {
            label: 'DLQ',
            value: totals.dlq,
            detail: 'Jobs retidos em dead-letter queues',
            tone: totals.dlq > 0 ? 'text-[var(--app-danger)]' : undefined,
          },
        ]}
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="Fila principal"
            description="Leitura em tempo quase real de waiting, active, delayed, failed e DLQ por fila."
          />
          <div className="grid gap-2">
            {(queues.data ?? []).map((queue) => {
              const isSelected = queue.name === activeQueue;
              const dlqTotal =
                queueCount(queue, 'dlq', 'waiting') + queueCount(queue, 'dlq', 'failed');
              return (
                <button
                  key={queue.name}
                  type="button"
                  onClick={() => setSelectedQueue(queue.name)}
                  className={`rounded-md border px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? 'border-[var(--app-accent)] bg-[var(--app-bg-secondary)]'
                      : 'border-[var(--app-border-primary)] bg-[var(--app-bg-card)] hover:bg-[var(--app-bg-hover)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[13px] font-bold text-[var(--app-text-primary)]">
                      {queue.name}
                    </div>
                    <div className="font-mono text-[11px] text-[var(--app-text-tertiary)]">
                      threshold {queue.threshold ?? '-'}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] text-[var(--app-text-secondary)] md:grid-cols-5">
                    <span>waiting {queueCount(queue, 'main', 'waiting')}</span>
                    <span>active {queueCount(queue, 'main', 'active')}</span>
                    <span>delayed {queueCount(queue, 'main', 'delayed')}</span>
                    <span>failed {queueCount(queue, 'main', 'failed')}</span>
                    <span>dlq {dlqTotal}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </AdminSurface>

        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader
            title="DLQ selecionada"
            description={activeQueue ? `Jobs retidos em ${activeQueue}` : 'Selecione uma fila'}
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() => void retrySelectedQueue()}
                disabled={!activeQueue || retrying || !dlq.data?.length}
              >
                <RotateCcw size={14} aria-hidden="true" />
                {retrying ? 'Reprocessando...' : 'Reprocessar 10'}
              </Button>
            }
          />
          <div className="grid gap-2">
            {(dlq.data ?? []).map((job) => (
              <div
                key={`${job.id ?? job.name}-${job.timestamp ?? ''}`}
                className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
              >
                <div className="text-[12px] font-semibold text-[var(--app-text-primary)]">
                  {job.name || 'job'}
                </div>
                <div className="mt-1 font-mono text-[10px] text-[var(--app-text-tertiary)]">
                  id {String(job.id ?? '-')} · {formatJobTime(job.timestamp)}
                </div>
                <div className="mt-2 line-clamp-2 text-[11px] text-[var(--app-text-secondary)]">
                  {job.failedReason || 'Sem motivo de falha informado'}
                </div>
              </div>
            ))}
          </div>
        </AdminSurface>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader title="Alertas de webhook" />
          <div className="text-[26px] font-bold text-[var(--app-text-primary)]">
            {alerts.data?.length ?? 0}
          </div>
          <div className="mt-1 text-[12px] text-[var(--app-text-secondary)]">
            alertas retornados na consulta atual
          </div>
        </AdminSurface>

        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminSectionHeader title="Billing suspenso" />
          <div className="text-[26px] font-bold text-[var(--app-text-primary)]">
            {suspended.data?.length ?? 0}
          </div>
          <div className="mt-1 text-[12px] text-[var(--app-text-secondary)]">
            workspaces exigindo ação operacional
          </div>
        </AdminSurface>
      </div>
    </AdminPage>
  );
}
