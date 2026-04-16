'use client';

import { type FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  adminDestructiveApi,
  type CreateIntentInput,
  type DestructiveIntentView,
} from '@/lib/api/admin-destructive-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

type Phase = 'reason' | 'challenge' | 'success' | 'failed';
export interface DestructiveConfirmDialogProps {
  open: boolean;
  onClose(): void;
  intent: Omit<CreateIntentInput, 'reason'> & {
    title: string;
    description?: string;
  };
  onSuccess?(result: DestructiveIntentView): void;
}

export function DestructiveConfirmDialog({
  open,
  onClose,
  intent,
  onSuccess,
}: DestructiveConfirmDialogProps) {
  const reasonId = useId();
  const challengeId = useId();
  const [phase, setPhase] = useState<Phase>('reason');
  const [reason, setReason] = useState('');
  const [challenge, setChallenge] = useState('');
  const [pending, setPending] = useState<DestructiveIntentView | null>(null);
  const [result, setResult] = useState<DestructiveIntentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setPhase('reason');
    setReason('');
    setChallenge('');
    setPending(null);
    setResult(null);
    setError(null);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  if (!open) return null;

  async function onCreate(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (reason.trim().length < 3) {
      setError('Explique o motivo em pelo menos 3 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await adminDestructiveApi.create({
        kind: intent.kind,
        targetType: intent.targetType,
        targetId: intent.targetId,
        reason: reason.trim(),
      });
      setPending(created);
      setPhase('challenge');
    } catch (err) {
      setError(
        err instanceof AdminApiClientError
          ? err.message
          : 'Não foi possível criar o intent. Tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!pending || challenge.trim().length !== 6) {
      setError('O challenge tem 6 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const confirmed = await adminDestructiveApi.confirm(
        pending.id,
        challenge.trim().toUpperCase(),
      );
      setResult(confirmed);
      if (confirmed.status === 'EXECUTED') {
        setPhase('success');
        onSuccess?.(confirmed);
      } else {
        setPhase('failed');
      }
    } catch (err) {
      setError(
        err instanceof AdminApiClientError
          ? err.message
          : 'Confirmação falhou. Verifique o challenge e tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6"
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="ember">{intent.kind}</Badge>
          </div>
          <CardTitle className="text-sm">{intent.title}</CardTitle>
          {intent.description ? <CardDescription>{intent.description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {phase === 'reason' ? (
            <form onSubmit={onCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor={reasonId}>Motivo (visível no audit log)</Label>
                <Input
                  id={reasonId}
                  value={reason}
                  onChange={(e) => setReason(e.currentTarget.value)}
                  placeholder="Ex.: fraude confirmada, solicitação do produtor"
                  maxLength={500}
                  required
                />
              </div>
              {error ? <p className="text-xs text-red-400">{error}</p> : null}
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={busy || reason.trim().length < 3}>
                  {busy ? 'Criando…' : 'Criar intent'}
                </Button>
              </div>
            </form>
          ) : null}

          {phase === 'challenge' && pending ? (
            <form onSubmit={onConfirm} className="flex flex-col gap-3">
              <div className="rounded-sm border border-border bg-card p-3 text-xs">
                <p className="text-muted-foreground">
                  Digite o challenge abaixo para confirmar a execução. Expira em{' '}
                  {new Date(pending.expiresAt).toLocaleTimeString('pt-BR')}.
                </p>
                <p className="mt-2 font-mono text-lg tracking-[0.3em] text-primary">
                  {pending.challenge}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={challengeId}>Challenge</Label>
                <Input
                  id={challengeId}
                  value={challenge}
                  onChange={(e) => setChallenge(e.currentTarget.value.toUpperCase())}
                  maxLength={6}
                  minLength={6}
                  className="font-mono tracking-[0.3em]"
                  required
                />
              </div>
              {error ? <p className="text-xs text-red-400">{error}</p> : null}
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={busy || challenge.trim().length !== 6}>
                  {busy ? 'Executando…' : 'Confirmar'}
                </Button>
              </div>
            </form>
          ) : null}

          {phase === 'success' && result ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                Executado com sucesso. Intent {result.id} • status {result.status}.
                {result.reversible && result.undoExpiresAt
                  ? ` Janela de undo até ${new Date(result.undoExpiresAt).toLocaleTimeString('pt-BR')}.`
                  : ' Ação irreversível.'}
              </div>
              {result.resultSnapshot ? (
                <pre className="max-h-40 overflow-auto rounded-sm border border-border bg-card p-3 font-mono text-[11px] text-muted-foreground">
                  {JSON.stringify(result.resultSnapshot, null, 2)}
                </pre>
              ) : null}
              <div className="flex items-center justify-end">
                <Button size="sm" onClick={onClose}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : null}

          {phase === 'failed' && result ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-sm border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
                Falha: {result.failureMessage ?? 'handler retornou erro.'}
              </div>
              <div className="flex items-center justify-end">
                <Button size="sm" variant="outline" onClick={onClose}>
                  Fechar
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
