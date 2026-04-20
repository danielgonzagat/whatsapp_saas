'use client';

import Link from 'next/link';
import { use, useId, useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { DestructiveConfirmDialog } from '@/components/admin/destructive-confirm-dialog';
import { adminProductsApi, type AdminProductDetail } from '@/lib/api/admin-products-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  APPROVED: 'success',
  ACTIVE: 'success',
  PENDING: 'warning',
  DRAFT: 'default',
  REJECTED: 'danger',
  PAUSED: 'default',
  ARCHIVED: 'default',
};

type Dialog = 'approve' | 'reject' | null;
type DestructiveKind = 'PRODUCT_ARCHIVE' | 'PRODUCT_DELETE' | null;
const MODERATION_CHECKLIST = [
  'Oferta clara e sem promessa abusiva',
  'Criativos e descrição consistentes',
  'Suporte configurado',
  'Checkout com dados mínimos válidos',
];

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

/** Product detail page. */
export default function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [destructive, setDestructive] = useState<DestructiveKind>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const noteId = useId();
  const reasonId = useId();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<string[]>([]);

  const { data, error, isLoading, mutate } = useSWR<AdminProductDetail>(
    ['admin/products', productId],
    () => adminProductsApi.detail(productId),
  );

  async function confirmAction() {
    if (!dialog) {
      return;
    }
    setFeedback(null);
    setBusy(true);
    try {
      if (dialog === 'approve') {
        await adminProductsApi.approve(productId, note || undefined, checklist);
      } else {
        await adminProductsApi.reject(productId, reason, checklist);
      }
      await mutate();
      setDialog(null);
      setNote('');
      setReason('');
      setChecklist([]);
    } catch (err) {
      setFeedback(
        err instanceof AdminApiClientError ? err.message : 'Erro inesperado ao moderar o produto.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/produtos" className="hover:text-foreground">
            ← Produtos
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">{isLoading ? '…' : (data?.name ?? 'Produto')}</h1>
        {data ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Badge variant={STATUS_VARIANT[data.status] ?? 'default'}>{data.status}</Badge>
            <span>{data.format}</span>
            <span>•</span>
            <span>{data.category ?? 'sem categoria'}</span>
            <span>•</span>
            <span>
              Workspace:{' '}
              <Link href={`/contas/${data.workspaceId}`} className="text-primary hover:underline">
                {data.workspaceName ?? data.workspaceId}
              </Link>
            </span>
          </div>
        ) : null}
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          {error instanceof AdminApiClientError
            ? error.message
            : 'Não foi possível carregar o produto.'}
        </p>
      ) : null}

      {isLoading || !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Preço" value={data.priceInCents} kind="currency-brl" />
            <StatCard label="GMV total" value={data.commerce.gmvInCents} kind="currency-brl" />
            <StatCard
              label="GMV 30 dias"
              value={data.commerce.last30dGmvInCents}
              kind="currency-brl"
            />
            <StatCard
              label="Aprovadas"
              value={data.commerce.approvedOrders}
              kind="integer"
              sublabel={`${data.commerce.pendingOrders} pendentes`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Reembolsos" value={data.commerce.refundedOrders} kind="integer" />
            <StatCard label="Chargebacks" value={data.commerce.chargebackOrders} kind="integer" />
            <StatCard
              label="Estoque"
              value={data.trackStock ? (data.stockQuantity ?? 0) : null}
              kind="integer"
              unavailableReason={!data.trackStock ? 'Não rastreia estoque' : undefined}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Moderação</CardTitle>
              <CardDescription>
                Ações de moderação atualizam status, gravam no audit log append-only e refletem
                imediatamente para o produtor.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={() => setDialog('approve')}>Aprovar</Button>
              <Button variant="outline" onClick={() => setDialog('reject')}>
                Rejeitar
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await adminProductsApi.updateState(
                      productId,
                      'PAUSE',
                      'Pausado pelo backoffice.',
                    );
                    await mutate();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Pausar
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await adminProductsApi.updateState(
                      productId,
                      'REACTIVATE',
                      'Reativado pelo backoffice.',
                    );
                    await mutate();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Reativar
              </Button>
              <Button variant="outline" onClick={() => setDestructive('PRODUCT_ARCHIVE')}>
                Arquivar
              </Button>
              <Button variant="outline" onClick={() => setDestructive('PRODUCT_DELETE')}>
                Deletar
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/produtos">Voltar à lista</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Descrição</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {data.description || 'Sem descrição.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Metadados</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-xs md:grid-cols-2">
              <Field label="ID" value={data.id} mono />
              <Field label="SKU" value={data.sku ?? '—'} />
              <Field label="Tags" value={data.tags.join(', ') || '—'} />
              <Field label="Criado em" value={formatDateTime(data.createdAt)} />
              <Field label="Atualizado em" value={formatDateTime(data.updatedAt)} />
              <Field label="Página de vendas" value={data.salesPageUrl ?? '—'} />
              <Field label="Email de suporte" value={data.supportEmail ?? '—'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Histórico de moderação</CardTitle>
              <CardDescription>
                Trilha append-only das últimas decisões administrativas deste produto.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.moderationHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem eventos de moderação registrados.
                </p>
              ) : (
                data.moderationHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-md border border-border bg-card px-4 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{entry.action}</span>
                      <span>{formatDateTime(entry.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-xs text-foreground">
                      {entry.adminUserName ? `por ${entry.adminUserName}` : 'sem autor visível'}
                    </p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}

      {dialog ? (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-6"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-sm">
                {dialog === 'approve' ? 'Aprovar produto' : 'Rejeitar produto'}
              </CardTitle>
              <CardDescription>
                {data?.name} — {data?.workspaceName ?? data?.workspaceId}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {dialog === 'approve' ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={noteId}>Nota interna (opcional)</Label>
                  <Input
                    id={noteId}
                    value={note}
                    onChange={(e) => setNote(e.currentTarget.value)}
                    placeholder="Observação anexa ao audit log"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={reasonId}>Motivo</Label>
                  <Input
                    id={reasonId}
                    value={reason}
                    onChange={(e) => setReason(e.currentTarget.value)}
                    placeholder="Visível ao produtor"
                  />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label>Checklist</Label>
                <div className="grid gap-2">
                  {MODERATION_CHECKLIST.map((item) => {
                    const checked = checklist.includes(item);
                    return (
                      <label key={item} className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setChecklist((current) =>
                              event.currentTarget.checked
                                ? [...current, item]
                                : current.filter((value) => value !== item),
                            )
                          }
                        />
                        <span>{item}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {feedback ? <p className="text-xs text-red-400">{feedback}</p> : null}
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDialog(null)} disabled={busy}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={confirmAction}
                  disabled={busy || (dialog === 'reject' && reason.trim().length < 3)}
                >
                  {busy ? 'Processando…' : 'Confirmar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <DestructiveConfirmDialog
        open={destructive !== null}
        intent={{
          kind: destructive ?? 'PRODUCT_ARCHIVE',
          targetType: 'Product',
          targetId: productId,
          title:
            destructive === 'PRODUCT_DELETE'
              ? `Deletar definitivamente ${data?.name ?? 'produto'}`
              : `Arquivar ${data?.name ?? 'produto'}`,
          description:
            destructive === 'PRODUCT_DELETE'
              ? 'Ação irreversível. A linha do produto é removida do banco e não há janela de undo.'
              : 'Reversível por 24h via undo token. O produto some da loja mas as orders históricas permanecem.',
        }}
        onClose={() => setDestructive(null)}
        onSuccess={() => {
          setDestructive(null);
          void mutate();
        }}
      />
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-foreground' : 'text-foreground'}>{value}</span>
    </div>
  );
}
