'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AdminEmptyState,
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import {
  adminAccountsApi,
  type KycQueueResponse,
  type KycQueueRow,
} from '@/lib/api/admin-accounts-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

type Pending = { agentId: string; kind: 'approve' | 'reject' | 'reverify' } | null;

export default function KycQueuePage() {
  const { data, error, isLoading, mutate } = useSWR<KycQueueResponse>(
    'admin/accounts/kyc/queue',
    () => adminAccountsApi.kycQueue(),
    { refreshInterval: 60_000 },
  );

  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submitAction() {
    if (!pending) return;
    setFeedback(null);
    setBusy(true);
    try {
      if (pending.kind === 'approve') {
        await adminAccountsApi.approveKyc(pending.agentId, note || undefined);
      } else if (pending.kind === 'reject') {
        await adminAccountsApi.rejectKyc(pending.agentId, reason);
      } else {
        await adminAccountsApi.reverifyKyc(pending.agentId, reason);
      }
      await mutate();
      setPending(null);
      setReason('');
      setNote('');
    } catch (submitError) {
      setFeedback(
        submitError instanceof AdminApiClientError
          ? submitError.message
          : 'Erro inesperado ao processar a ação.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="KYC"
        title="Fila de KYC"
        description="Submissões aguardando revisão operacional, com atualização automática da fila."
      />

      <AdminMetricGrid
        items={[
          {
            label: 'Na fila',
            value: data?.total ?? null,
            kind: 'integer',
            detail: 'Submissões pendentes',
          },
          {
            label: 'Documentos',
            value: data?.items.reduce((sum, row) => sum + row.documentCount, 0) ?? null,
            kind: 'integer',
            detail: 'Arquivos anexados',
          },
          {
            label: 'Aguardando +48h',
            value:
              data?.items.filter((row) => {
                if (!row.kycSubmittedAt) return false;
                return Date.now() - new Date(row.kycSubmittedAt).getTime() > 48 * 60 * 60 * 1000;
              }).length ?? null,
            kind: 'integer',
            detail: 'Prioridade operacional',
          },
          {
            label: 'Atualização',
            value: 60,
            kind: 'integer',
            detail: 'Refresh automático em segundos',
          },
        ]}
      />

      {error ? <ErrorBanner error={error} /> : null}

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Submissões pendentes"
          description={
            data ? `${data.total} itens aguardando revisão` : 'Carregando fila operacional'
          }
        />
        <div className="flex flex-col gap-3">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !data || data.items.length === 0 ? (
            <AdminEmptyState
              title="Fila vazia"
              description="Quando novos documentos forem enviados eles aparecem aqui automaticamente."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {data.items.map((row) => (
                <KycRowCard
                  key={row.agentId}
                  row={row}
                  onAction={(kind) => {
                    setPending({ agentId: row.agentId, kind });
                    setReason('');
                    setNote('');
                    setFeedback(null);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </AdminSurface>

      {pending ? (
        <DecisionDialog
          pending={pending}
          reason={reason}
          setReason={setReason}
          note={note}
          setNote={setNote}
          busy={busy}
          feedback={feedback}
          onCancel={() => {
            setPending(null);
            setFeedback(null);
          }}
          onConfirm={submitAction}
        />
      ) : null}
    </AdminPage>
  );
}

function KycRowCard({
  row,
  onAction,
}: {
  row: KycQueueRow;
  onAction: (kind: 'approve' | 'reject' | 'reverify') => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-[var(--app-text-primary)]">{row.agentName}</span>
          <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-secondary)]">
            {row.workspaceName}
          </span>
        </div>
        <span className="text-xs text-[var(--app-text-secondary)]">{row.agentEmail}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-tertiary)]">
          Enviada em {formatDate(row.kycSubmittedAt)} • {row.documentCount} documentos
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="default" size="sm" onClick={() => onAction('approve')}>
          Aprovar
        </Button>
        <Button variant="outline" size="sm" onClick={() => onAction('reject')}>
          Rejeitar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAction('reverify')}>
          Pedir nova verificação
        </Button>
      </div>
    </li>
  );
}

function DecisionDialog({
  pending,
  reason,
  setReason,
  note,
  setNote,
  busy,
  feedback,
  onCancel,
  onConfirm,
}: {
  pending: { agentId: string; kind: 'approve' | 'reject' | 'reverify' };
  reason: string;
  setReason: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  busy: boolean;
  feedback: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titles = {
    approve: 'Aprovar KYC',
    reject: 'Rejeitar KYC',
    reverify: 'Pedir nova verificação',
  };

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-6"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-sm">{titles[pending.kind]}</CardTitle>
          <CardDescription>
            {pending.kind === 'approve'
              ? 'A conta será liberada e os documentos passam a aprovados.'
              : pending.kind === 'reject'
                ? 'A conta ficará com KYC rejeitado e o motivo será visível ao produtor.'
                : 'A conta volta para o estado inicial e o produtor precisará reenviar documentos.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {pending.kind === 'approve' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="note">Nota interna (opcional)</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                placeholder="Observação para a operação"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="reason">Motivo</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
                placeholder="Explique a decisão"
              />
            </div>
          )}
          {feedback ? <p className="text-xs text-red-400">{feedback}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={busy || (pending.kind !== 'approve' && reason.trim().length < 3)}
            >
              {busy ? 'Processando...' : 'Confirmar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300/50 bg-red-50 px-4 py-3 text-sm text-red-600"
    >
      {error instanceof AdminApiClientError ? error.message : 'Erro ao carregar a fila de KYC.'}
    </div>
  );
}
